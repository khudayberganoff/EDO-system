import { PrismaClient } from "@prisma/client";
import { Role, DocumentType, DocumentStatus } from "../src/common/enums";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPasswordHash = await bcrypt.hash("Admin123!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@wafagroup.uz" },
    update: {},
    create: {
      fullName: "Tizim Administratori",
      email: "admin@wafagroup.uz",
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
    },
  });

  const managerPasswordHash = await bcrypt.hash("Manager123!", 10);
  const manager = await prisma.user.upsert({
    where: { email: "manager@wafagroup.uz" },
    update: {},
    create: {
      fullName: "Bo'lim Boshlig'i",
      email: "manager@wafagroup.uz",
      passwordHash: managerPasswordHash,
      role: Role.MANAGER,
    },
  });

  const employeePasswordHash = await bcrypt.hash("Employee123!", 10);
  const employee = await prisma.user.upsert({
    where: { email: "employee@wafagroup.uz" },
    update: {},
    create: {
      fullName: "Xodim Xodimov",
      email: "employee@wafagroup.uz",
      passwordHash: employeePasswordHash,
      role: Role.EMPLOYEE,
    },
  });

  const existingDoc = await prisma.document.findFirst({
    where: { title: "Murobaha shartnomasi №001" },
  });

  if (!existingDoc) {
    const doc = await prisma.document.create({
      data: {
        title: "Murobaha shartnomasi №001",
        type: DocumentType.CONTRACT,
        status: DocumentStatus.IN_REVIEW,
        ownerId: employee.id,
        contractRefId: "CRM-CONTRACT-001",
        versions: {
          create: {
            versionNumber: 1,
            fileUrl: "/uploads/demo/contract-001-v1.pdf",
            fileName: "contract-001-v1.pdf",
            fileSizeBytes: 128_000,
            createdById: employee.id,
            note: "Boshlang'ich versiya",
          },
        },
        workflow: {
          create: {
            type: "SEQUENTIAL",
            steps: {
              create: [
                { order: 1, approverId: manager.id, status: "PENDING" },
                { order: 2, approverId: admin.id, status: "PENDING" },
              ],
            },
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        documentId: doc.id,
        userId: employee.id,
        action: "CREATE",
        metadata: JSON.stringify({ source: "seed" }),
      },
    });
  }

  const existingLetter = await prisma.letter.findFirst({
    where: { documentNumber: "202628856" },
  });

  if (!existingLetter) {
    await prisma.letter.createMany({
      data: [
        {
          direction: "INCOMING",
          type: "WARNING",
          status: "NEW",
          documentNumber: "202628856",
          documentDate: new Date("2026-08-15"),
          counterpartyName: '"O\'ZBEKISTON RESPUBLIKASI ICHKI ISHLAR VAZIRLIGI" TOSHKENT SH',
          counterpartyAddress: "Toshkent sh., Yunusobod tumani",
          phoneNumber: "",
          summary: "Shartnoma shartlari yuzasidan ogohlantirish xati.",
          createdById: employee.id,
        },
        {
          direction: "INCOMING",
          type: "REFERENCE",
          status: "NEW",
          documentNumber: "302595707",
          documentDate: new Date("2026-08-13"),
          counterpartyName: '"YEMA GROUP INTERNATIONAL" MCHJ',
          counterpartyAddress: "Toshkent sh., Mirzo Ulug'bek tumani",
          phoneNumber: "+998935353524",
          summary: "Yetkazib berilgan tovarlar bo'yicha ma'lumotnoma.",
          createdById: employee.id,
        },
        {
          direction: "OUTGOING",
          type: "LETTER",
          status: "APPROVED",
          documentNumber: "40-11/08",
          documentDate: new Date("2026-08-13"),
          counterpartyName: '"ALVIS TREND" MCHJ',
          counterpartyAddress: "Toshkent sh., Chilonzor tumani",
          phoneNumber: "+998935209095",
          summary: "Shartnoma muddati uzaytirilishi to'g'risidagi taklif xati.",
          createdById: manager.id,
        },
        {
          direction: "OUTGOING",
          type: "LETTER",
          status: "DELETED",
          documentNumber: "146-01/08",
          documentDate: new Date("2026-08-12"),
          counterpartyName: '"SUPER MIX BETON" MCHJ',
          counterpartyAddress: "Toshkent sh., Sergeli tumani",
          phoneNumber: "+998981401100",
          summary: "Xato kiritilgani sababli bekor qilingan ishonchnoma.",
          createdById: employee.id,
        },
      ],
    });
  }

  console.log("Seed muvaffaqiyatli yakunlandi.");
  console.log("Admin login: admin@wafagroup.uz / Admin123!");
  console.log("Manager login: manager@wafagroup.uz / Manager123!");
  console.log("Employee login: employee@wafagroup.uz / Employee123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
