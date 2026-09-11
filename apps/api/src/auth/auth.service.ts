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
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Xavfsizlik uchun: email topilmadimi yoki parol xato - bir xil xabar qaytariladi
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Email yoki parol noto'g'ri.");
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Email yoki parol noto'g'ri.");
    }

    if (!dto.organizationId) {
      const memberships = await this.myOrganizations(user.id);
      if (memberships.length === 0) {
        throw new ForbiddenException("Sizga hech qanday tashkilotga kirish huquqi berilmagan.");
      }
      if (memberships.length > 1) {
        return { requiresOrganizationSelection: true as const, organizations: memberships };
      }
      dto = { ...dto, organizationId: memberships[0].id };
    }

    const organization = await this.assertOrgAccess(user.id, dto.organizationId!);

    const payload = { sub: user.id, email: user.email, role: user.role, organizationId: organization.id };
    const accessToken = await this.jwtService.signAsync(payload);

    await this.auditLog.record({
      userId: user.id,
      action: AuditAction.LOGIN,
      metadata: { organizationId: organization.id },
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
