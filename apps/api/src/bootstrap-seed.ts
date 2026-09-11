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
  await seedOrganizations();
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

/**
 * Ikkita tashkilot (WAFA LEASING MCHJ, VAFO MOLIYA MCHJ MMT) yaratiladi va:
 * - ADMIN/MANAGER rolidagi foydalanuvchilarga ikkala tashkilotga ham kirish
 *   huquqi beriladi (rahbariyat ular orasida tanlab/almashtirib kiradi),
 *   qolganlarga - faqat WAFA LEASING'ga;
 * - eski (tashkilot ajratilishidan OLDIN yaratilgan, organizationId=null)
 *   Letter/Document/Employee yozuvlari WAFA LEASING'ga bog'lanadi.
 *
 * Har safar ishga tushganda ham xavfsiz qayta bajariladi (faqat yo'q
 * bo'lgan narsalarni qo'shadi / null bo'lganlarini to'ldiradi) - shuning
 * uchun `seedInitialUsers`dagi kabi "bazada allaqachon bor" tekshiruvi
 * bilan cheklanmaydi.
 */
async function seedOrganizations(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const WAFA_LEASING = "WAFA LEASING MCHJ";
    const VAFO_MOLIYA = "VAFO MOLIYA MCHJ MMT";

    const wafaLeasing = await prisma.organization.upsert({
      where: { name: WAFA_LEASING }, update: {}, create: { name: WAFA_LEASING },
    });
    await prisma.organization.upsert({
      where: { name: VAFO_MOLIYA }, update: {}, create: { name: VAFO_MOLIYA },
    });

    // Tashkilot ajratilishidan oldingi eski yozuvlar - hammasi WAFA LEASING'ga
    await prisma.letter.updateMany({ where: { organizationId: null }, data: { organizationId: wafaLeasing.id } });
    await prisma.document.updateMany({ where: { organizationId: null }, data: { organizationId: wafaLeasing.id } });
    await prisma.employee.updateMany({ where: { organizationId: null }, data: { organizationId: wafaLeasing.id } });

    // Har bir foydalanuvchiga kamida bitta tashkilotga kirish huquqi - bo'lmasa qo'shiladi
    const users = await prisma.user.findMany({ select: { id: true, role: true } });
    const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
    const wafaLeasingId = orgs.find((o) => o.name === WAFA_LEASING)!.id;
    const vafoMoliyaId = orgs.find((o) => o.name === VAFO_MOLIYA)!.id;

    for (const user of users) {
      const targetOrgIds = user.role === Role.ADMIN || user.role === Role.MANAGER
        ? [wafaLeasingId, vafoMoliyaId]
        : [wafaLeasingId];
      for (const organizationId of targetOrgIds) {
        await prisma.userOrganization.upsert({
          where: { userId_organizationId: { userId: user.id, organizationId } },
          update: {},
          create: { userId: user.id, organizationId },
        });
      }
    }

    console.log("Tashkilotlar (WAFA LEASING, VAFO MOLIYA) tayyor.");
  } catch (err) {
    console.error("Tashkilotlarni tayyorlashda xatolik:", err);
  } finally {
    await prisma.$disconnect();
  }
}
