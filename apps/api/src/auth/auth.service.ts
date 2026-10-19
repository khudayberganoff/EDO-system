import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { AuditLogService } from "../audit-log/audit-log.service";
import { AuditAction } from "../common/enums";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private auditLog: AuditLogService,
  ) {}

  /** Kirish sahifasidagi tashkilot tanlagichi uchun - login qilishdan OLDIN ochiq (Public). */
  async listOrganizations() {
    return this.prisma.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  }

  /**
   * Email+parol to'g'ri kelgach:
   * - foydalanuvchi FAQAT BITTA tashkilotga ega bo'lsa - shu tashkilot bilan darhol kiradi;
   * - BIR NECHTA tashkilotga ega bo'lsa va `organizationId` hali berilmagan bo'lsa -
   *   token BERMASDAN, tanlash uchun tashkilotlar ro'yxatini qaytaradi (frontend alohida
   *   oynada shu ro'yxatni ko'rsatadi, foydalanuvchi tanlagach xuddi shu email/parol bilan,
   *   endi organizationId bilan qayta yuboradi).
   */
  async login(dto: LoginDto) {
    // Email qidiruvi katta-kichik harfga SEZGIR (Postgres) - lekin foydalanuvchilar email
    // yaratilganda har doim kichik harfga normalizatsiya qilinadi (settings.service.ts,
    // hr.service.ts). Agar kirishda email boshqacha registrda kiritilsa (masalan telefon
    // klaviaturasi birinchi harfni avtomatik katta qilib qo'ysa) - login/parol TO'G'RI
    // bo'lsa ham "email yoki parol noto'g'ri" xatosi chiqib qolardi. Shuning uchun bu
    // yerda ham xuddi shunday normalizatsiya qilinadi.
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Xavfsizlik uchun: email topilmadimi yoki parol xato - bir xil xabar qaytariladi
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Email yoki parol noto'g'ri.");
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Email yoki parol noto'g'ri.");
    }

    return this.startSession(user, dto.organizationId, "password");
  }

  /**
   * Foydalanuvchi aniqlangach (parol yoki ERI): bitta tashkilot bo'lsa darhol token beradi,
   * bir nechta bo'lsa tanlash uchun ro'yxat qaytaradi. ERI da tanlash `selectionToken` bilan yakunlanadi.
   */
  async startSession(
    user: { id: string; fullName: string; email: string; role: string; isActive: boolean; createdAt: Date; mustChangePassword: boolean },
    organizationId: string | undefined,
    method: "password" | "eri",
  ) {
    if (!organizationId) {
      const memberships = await this.myOrganizations(user.id);
      if (memberships.length === 0) {
        throw new ForbiddenException("Sizga hech qanday tashkilotga kirish huquqi berilmagan.");
      }
      if (memberships.length > 1) {
        const selectionToken = method === "eri"
          ? await this.jwtService.signAsync({ sub: user.id, purpose: "eri-org" }, { expiresIn: "5m" })
          : undefined;
        return { requiresOrganizationSelection: true as const, organizations: memberships, ...(selectionToken ? { selectionToken } : {}) };
      }
      organizationId = memberships[0].id;
    }

    const organization = await this.assertOrgAccess(user.id, organizationId);

    const payload = { sub: user.id, email: user.email, role: user.role, organizationId: organization.id };
    const accessToken = await this.jwtService.signAsync(payload);

    await this.auditLog.record({
      userId: user.id,
      action: AuditAction.LOGIN,
      metadata: { organizationId: organization.id, method },
    });

    return {
      accessToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
        mustChangePassword: user.mustChangePassword,
        organizationId: organization.id,
        organizationName: organization.name,
      },
    };
  }

  /** ERI bilan tasdiqlangan JSHSHIR bo'yicha faol foydalanuvchini topadi (avval hisob, so'ng kadrlar kartochkasi). */
  async findUserByPinfl(pinfl: string) {
    const direct = await this.prisma.user.findUnique({ where: { pinfl } });
    if (direct) return direct;
    const emp = await this.prisma.employee.findFirst({ where: { pinfl, userId: { not: null } }, include: { user: true } });
    return emp?.user ?? null;
  }

  async loginWithEri(pinfl: string, organizationId?: string) {
    const user = await this.findUserByPinfl(pinfl);
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Bu ERI kaliti tizimdagi hech bir faol foydalanuvchiga bog'lanmagan. Administratorga murojaat qiling.");
    }
    return this.startSession(user, organizationId, "eri");
  }

  /** Ko'p tashkilotli foydalanuvchi ERI dan keyin tashkilot tanlaganda (selectionToken 5 daqiqa amal qiladi). */
  async selectOrganizationAfterEri(selectionToken: string, organizationId: string) {
    let decoded: { sub?: string; purpose?: string };
    try { decoded = await this.jwtService.verifyAsync(selectionToken); } catch { throw new UnauthorizedException("Sessiya muddati tugadi. ERI bilan qayta kiring."); }
    if (decoded.purpose !== "eri-org" || !decoded.sub) throw new UnauthorizedException("Noto'g'ri so'rov.");
    const user = await this.prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException("Foydalanuvchi topilmadi.");
    return this.startSession(user, organizationId, "eri");
  }

  /** Joriy foydalanuvchi kira oladigan barcha tashkilotlar - tashkilot almashtirgichini ko'rsatish kerak-emasligini aniqlash uchun. */
  async myOrganizations(userId: string) {
    const rows = await this.prisma.userOrganization.findMany({
      where: { userId },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { organization: { name: "asc" } },
    });
    return rows.map((r) => r.organization);
  }

  /**
   * Qayta parol so'ramasdan boshqa (foydalanuvchi kira oladigan) tashkilotga
   * o'tish - rahbariyat ikkala tashkilot orasida shu orqali almashtiradi.
   */
  async switchOrganization(userId: string, organizationId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException("Foydalanuvchi topilmadi.");

    const organization = await this.assertOrgAccess(userId, organizationId);
    const payload = { sub: user.id, email: user.email, role: user.role, organizationId: organization.id };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
        mustChangePassword: user.mustChangePassword,
        organizationId: organization.id,
        organizationName: organization.name,
      },
    };
  }

  /** Foydalanuvchi shu tashkilotga kirish huquqiga ega ekanini tekshiradi va tashkilotni qaytaradi. */
  private async assertOrgAccess(userId: string, organizationId: string) {
    const membership = await this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: { organization: { select: { id: true, name: true } } },
    });
    if (!membership) throw new ForbiddenException("Sizga ushbu tashkilotga kirish huquqi berilmagan.");
    return membership.organization;
  }

  /**
   * Foydalanuvchi o'zi parolini almashtiradi (joriy parolni bilishi shart).
   * Avtomatik yaratilgan yoki administrator tiklagan hisoblarda birinchi
   * kirishda majburiy - shundan keyin mustChangePassword yechiladi.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Foydalanuvchi topilmadi.");

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) throw new UnauthorizedException("Joriy parol noto'g'ri.");
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException("Yangi parol kamida 8 ta belgidan iborat bo'lishi kerak.");
    }
    if (newPassword === currentPassword) {
      throw new BadRequestException("Yangi parol joriy paroldan farq qilishi kerak.");
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: false },
    });
    await this.auditLog.record({ userId, action: AuditAction.UPDATE, metadata: { kind: "passwordSelfChange" } });
    return { success: true };
  }
}
