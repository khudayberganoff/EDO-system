import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { execFile } from "child_process";
import { promisify } from "util";
import { Role } from "./common/enums";

const execFileAsync = promisify(execFile);

/**
 * Baza sxemasini yangilaydi va bo'sh bazaga boshlang'ich foydalanuvchilarni qo'shadi.
 *
 * Nima uchun bu ish serverdan KEYIN bajariladi:
 * ilgari `prisma db push` va seed server ishga tushishidan oldin bajarilardi.
 * Bepul tarifdagi cheklangan resurslarda bu uzoq davom etib, platforma port
 * ochilishini kutolmay konteynerni o'chirib yuborardi (SIGTERM).
 * Endi server avval portni ochadi - shundan keyin baza fonda tayyorlanadi.
 */
export async function runBootstrapSeed(): Promise<void> {
  await syncDatabaseSchema();
  await seedInitialUsers();
}

/** `prisma db push` - sxemadagi o'zgarishlarni bazaga qo'llaydi. */
async function syncDatabaseSchema(): Promise<void> {
  try {
    console.log("Baza sxemasi tekshirilmoqda...");
    const { stdout } = await execFileAsync(
      "npx",
      ["prisma", "db", "push", "--accept-data-loss", "--skip-generate"],
      { cwd: process.cwd(), timeout: 180_000, maxBuffer: 10 * 1024 * 1024 },
    );
    console.log(stdout.trim());
  } catch (err: any) {
    console.error("Baza sxemasini yangilashda xatolik:", err?.message ?? err);
  }
}

/** Bo'sh bazaga standart hisoblar (admin / manager / employee). */
async function seedInitialUsers(): Promise<void> {
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
    console.error("Boshlang'ich ma'lumotlarni yaratishda xatolik:", err);
  } finally {
    await prisma.$disconnect();
  }
}
