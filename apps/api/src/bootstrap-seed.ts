import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { Role } from "./common/enums";

/**
 * Bo'sh bazaga boshlang'ich foydalanuvchilarni qo'shadi.
 *
 * Nima uchun bu yerda: ilgari seed alohida ts-node jarayoni sifatida server
 * ishga tushishidan OLDIN bajarilardi. Bu sekin va og'ir edi - platforma
 * portni kutib turolmay konteynerni o'chirib yuborardi (SIGTERM).
 * Endi server avval portni ochadi, seed esa fonda bajariladi.
 */
export async function runBootstrapSeed(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) return; // baza allaqachon to'ldirilgan

    const accounts = [
      { fullName: "Tizim Administratori", email: "admin@wafagroup.uz", password: "Admin123!", role: Role.ADMIN },
      { fullName: "Bo'lim Boshlig'i", email: "manager@wafagroup.uz", password: "Manager123!", role: Role.MANAGER },
      { fullName: "Xodim Xodimov", email: "employee@wafagroup.uz", password: "Employee123!", role: Role.EMPLOYEE },
    ];

    for (const acc of accounts) {
      await prisma.user.upsert({
        where: { email: acc.email },
        update: {},
        create: {
          fullName: acc.fullName,
          email: acc.email,
          passwordHash: await bcrypt.hash(acc.password, 10),
          role: acc.role,
        },
      });
    }

    console.log("Boshlang'ich foydalanuvchilar yaratildi (admin/manager/employee).");
  } catch (err) {
    // Seed muvaffaqiyatsiz bo'lsa ham server ishlashda davom etadi
    console.error("Boshlang'ich ma'lumotlarni yaratishda xatolik:", err);
  } finally {
    await prisma.$disconnect();
  }
}
