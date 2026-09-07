import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { AuditAction, Role } from "../common/enums";

/** Tizimdagi bo'limlar ro'yxati - ruxsatlar shu kalitlar bo'yicha beriladi. */
export const MODULES = [
  { key: "dashboard", label: "Bosh sahifa" },
  { key: "my-hr", label: "Mening HR" },
  { key: "approvals", label: "Tasdiqlashim kerak" },
  { key: "letters", label: "Xatlar" },
  { key: "hr", label: "Kadrlar" },
  { key: "deleted", label: "O'chirilgan" },
  { key: "integrations", label: "Tashqi tizimlar" },
  { key: "settings", label: "Sozlamalar" },
] as const;

/** Yozuv bo'lmaganda ishlaydigan standart ruxsatlar. */
const DEFAULTS: Record<string, { view: string[]; edit: string[] }> = {
  dashboard: { view: ["ADMIN", "MANAGER", "EMPLOYEE"], edit: [] },
  "my-hr": { view: ["ADMIN", "MANAGER", "EMPLOYEE"], edit: [] },
  approvals: { view: ["ADMIN", "MANAGER", "EMPLOYEE"], edit: ["ADMIN", "MANAGER"] },
  letters: { view: ["ADMIN", "MANAGER", "EMPLOYEE"], edit: ["ADMIN", "MANAGER", "EMPLOYEE"] },
  hr: { view: ["ADMIN", "MANAGER"], edit: ["ADMIN", "MANAGER"] },
  deleted: { view: ["ADMIN", "MANAGER"], edit: ["ADMIN"] },
  integrations: { view: ["ADMIN"], edit: ["ADMIN"] },
  settings: { view: ["ADMIN"], edit: ["ADMIN"] },
};

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  /** Barcha rollar uchun ruxsatlar jadvali (saqlanganlari + standartlari). */
  async permissions() {
    const saved = await this.prisma.modulePermission.findMany();
    const roles = [Role.ADMIN, Role.MANAGER, Role.EMPLOYEE];

    const rows = MODULES.map((m) => ({
      module: m.key,
      label: m.label,
      roles: Object.fromEntries(
        roles.map((role) => {
          const record = saved.find((s) => s.role === role && s.module === m.key);
          const def = DEFAULTS[m.key];
          return [
            role,
            {
              canView: record ? record.canView : def.view.includes(role),
              canEdit: record ? record.canEdit : def.edit.includes(role),
            },
          ];
        }),
      ),
    }));
    return { modules: rows, roles };
  }

  /** Bitta rol + bo'lim uchun ruxsatni saqlaydi. */
  async setPermission(data: { role: string; module: string; canView: boolean; canEdit: boolean }, userId: string) {
    if (!MODULES.some((m) => m.key === data.module)) throw new BadRequestException("Noma'lum bo'lim.");

    // Administrator sozlamalardan mahrum bo'lib qolmasligi kerak
    if (data.role === Role.ADMIN && data.module === "settings" && !data.canView) {
      throw new BadRequestException("Administratordan sozlamalar bo'limini olib bo'lmaydi.");
    }

    const saved = await this.prisma.modulePermission.upsert({
      where: { role_module: { role: data.role, module: data.module } },
      create: { role: data.role, module: data.module, canView: data.canView, canEdit: data.canEdit },
      update: { canView: data.canView, canEdit: data.canEdit },
    });
    await this.auditLog.record({ userId, action: AuditAction.UPDATE, metadata: { kind: "permission", ...data } });
    return saved;
  }

  /** Joriy foydalanuvchi uchun ochiq bo'limlar - interfeys shunga qarab quriladi. */
  async myAccess(role: string) {
    const saved = await this.prisma.modulePermission.findMany({ where: { role } });
    return Object.fromEntries(
      MODULES.map((m) => {
        const record = saved.find((s) => s.module === m.key);
        const def = DEFAULTS[m.key];
        return [m.key, {
          canView: record ? record.canView : def.view.includes(role),
          canEdit: record ? record.canEdit : def.edit.includes(role),
        }];
      }),
    );
  }

  // ---------- Foydalanuvchilar ----------

  async listUsers() {
    return this.prisma.user.findMany({
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, email: true, role: true, isActive: true, createdAt: true },
    });
  }

  async createUser(data: { fullName: string; email: string; password: string; role: string }, actorId: string) {
    const email = data.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new BadRequestException("Bu email allaqachon ro'yxatdan o'tgan.");
    if (!data.password || data.password.length < 8) {
      throw new BadRequestException("Parol kamida 8 ta belgidan iborat bo'lishi kerak.");
    }

    const user = await this.prisma.user.create({
      data: {
        fullName: data.fullName.trim(),
        email,
        passwordHash: await bcrypt.hash(data.password, 10),
        role: data.role,
      },
      select: { id: true, fullName: true, email: true, role: true, isActive: true },
    });
    await this.auditLog.record({ userId: actorId, action: AuditAction.CREATE, metadata: { kind: "user", userId: user.id } });
    return user;
  }

  /**
   * Parolni tiklash: administrator yangi parol o'rnatadi va u BIR MARTA qaytariladi.
   *
   * Nima uchun mavjud parolni ko'rsatib bo'lmaydi: parollar bcrypt bilan bir tomonlama
   * shifrlanadi. Bu atayin shunday - baza qo'lga tushsa ham hech kim parollarni
   * o'qiy olmaydi. Shuning uchun "ko'rsatish" o'rniga "yangisini berish" ishlatiladi.
   */
  async resetPassword(id: string, actorId: string, customPassword?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Foydalanuvchi topilmadi.");

    const password = customPassword?.trim() || this.generatePassword();
    if (password.length < 8) throw new BadRequestException("Parol kamida 8 ta belgidan iborat bo'lishi kerak.");

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    await this.auditLog.record({
      userId: actorId, action: AuditAction.UPDATE,
      metadata: { kind: "passwordReset", targetUserId: id },
    });

    return { email: user.email, fullName: user.fullName, password };
  }

  /** O'qishga qulay, lekin taxmin qilish qiyin parol yaratadi. */
  private generatePassword(): string {
    // Adashtiruvchi belgilar (0/O, 1/l/I) ishlatilmaydi
    const letters = "abcdefghijkmnpqrstuvwxyz";
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const digits = "23456789";
    const pick = (set: string, n: number) =>
      Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join("");
    return `${pick(upper, 1)}${pick(letters, 5)}${pick(digits, 3)}!`;
  }

  async updateUser(id: string, data: { fullName?: string; role?: string; isActive?: boolean; password?: string }, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Foydalanuvchi topilmadi.");

    // Oxirgi faol administrator o'chirilmasligi kerak
    if ((data.role && data.role !== Role.ADMIN) || data.isActive === false) {
      if (user.role === Role.ADMIN) {
        const activeAdmins = await this.prisma.user.count({ where: { role: Role.ADMIN, isActive: true } });
        if (activeAdmins <= 1) throw new BadRequestException("Tizimda kamida bitta faol administrator qolishi kerak.");
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: data.fullName?.trim(),
        role: data.role,
        isActive: data.isActive,
        ...(data.password ? { passwordHash: await bcrypt.hash(data.password, 10) } : {}),
      },
      select: { id: true, fullName: true, email: true, role: true, isActive: true },
    });
    await this.auditLog.record({ userId: actorId, action: AuditAction.UPDATE, metadata: { kind: "user", userId: id } });
    return updated;
  }
}
