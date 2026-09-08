import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, ImageRun, VerticalAlign } from "docx";
import * as QRCode from "qrcode";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ImageModule = require("docxtemplater-image-module-free");
import { AuditAction, LetterStatus, LetterType, Role } from "../common/enums";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { CreateLetterDto } from "./dto/create-letter.dto";
import { QueryLettersDto } from "./dto/query-letters.dto";
import { LetterAiAgentService } from "./letter-ai-agent.service";
import { LetterPdfService } from "./letter-pdf.service";
import { moneyToWordsUz, daysToWordsUz } from "./number-to-words.uz";

const ARCHIVE_DIR = path.resolve(process.cwd(), "uploads", "letters");
const LETTERHEAD_DIR = path.resolve(process.cwd(), "uploads", "letterhead");
const FIRST_WARNING_TEMPLATE_PATH = path.resolve(process.cwd(), "..", "..", "templates", "1-OGOHLANTIRISH-NAMUNA.docx");
/// Xat va ma'lumotnomalar uchun standart blank (kompaniya o'z blankasini yuklamagan holat)
const LETTER_TEMPLATE_PATH = path.resolve(process.cwd(), "..", "..", "templates", "XAT-BLANK-NAMUNA.docx");
const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
const formatThousandsUz = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
// Oq (bo'sh) 180x180 PNG - hali tasdiqlanmagan xatlarda QR o'rniga vaqtinchalik bo'sh joy.
// Diqqat: 1x1 shaffof PNG ishlatilsa Word uni qora kvadrat qilib ko'rsatadi, shuning uchun oq rasm.
// Qoralama (hali tasdiqlanmagan) xatlarda QR o'rniga ko'rsatiladigan izohli rasm.
// Bo'sh oq rasm ishlatilsa - foydalanuvchi buni xatolik deb o'ylardi.
const BLANK_QR_PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAIAAACyr5FlAAAJo0lEQVR4nO3dy1PTXBgG8JPSFqzSixQog6CUi4AUBUZg4ejgDVAXbvwjOyxcgTjAAhHHyggM94uwAEpBhNIinQIl+RZnzORL8pbC99nr89towznNqTwktXl5I0iSxAD0GFK9AEhfRv6Hz+dL7TogrXR0dDAcOSAOo/IBzwvkMuU5BEcOICEcQEI4gIRwAAnhABLCASSEA0gIB5AQDiAhHEBCOICEcAAJ4QASwgEkhANICAeQEA4gIRxAQjiAhHAACeEAEsIBJIQDSAgHkBAOICEcQEI4gIRwAAnhABLCASSEA0gIB5AQDiAhHEBCOICEcAAJ4QASwgEkhANICAeQEA4gIRxAQjiAhHAACeEAEsIBJIQDSAgHkBAOICEcQEI4gIRwAMl48ZBMtr6+vrKyYjAYRFGsr6+/c+cOY8zr9RYVFTHGzs7O2traSkpK+OC+vr53794xxiKRyOjoaFdX1/b2tjy9rq7O7XbL0wVBOD8/r6mp4RuzUjaHIxAIrK2tPX361Gw2n56ejo6OWiyWkpISg8Hw/Plzxtjh4eGXL19evXqlnHV+fj4+Pv7w4cNgMKid7nK55OmxWGx0dNRoNFZWVqbmFf5l2XxaWVxcbGlpMZvNjDGz2dzS0rKwsKAcYLfbI5GIatbExITb7XY6nRdONxqNLS0ty8vLf/l1pEw2hyMUCjkcDvmhw+EIhULKAYFAwOVyKbcsLy8bDIbq6upEpjPG7Hb70dHR/7/09JDNpxWts7MzxpgoisPDw6IohsPhN2/eyF8VRXFlZcVms1HTBUFQbZEkyWDI2h+wrH1hjDGbzRYMBuWHBwcH/BvP3zS8fPmysbFxfX1dHiAIQk9PTywWW11djTNdaX9/3263/9VXkULZHI7GxsapqSl+tDg9PZ2enr53755yQFlZ2f7+vvxQEASTydTZ2Tk3NxcOhxsaGlTTGxoalNNPT0+npqZUG7NJNp9WXC5XJBIZGRkRBCEcDjPGfv/+rRxQWFgYDAYlSVKeLywWS2tr6/j4eHd3dyQSGR4ezsvL4/+V5W9Q+FlJEARRFBsbG0tLS5P8upJGkCSJ/bm9fUdHR6rX8xednJwcHh5m8ffyf6FMQjafVlTy8/ORjEvJoXDAZSEcQEI4gIRwAAnhABLCAaQUfwi2ubnJr2ru7e0VFxczxurq6iorK9fW1iYmJt6+fVtQUMAYOzg4mJ6e5p9WdXZ2WiwW3aIKuSBDt4xD/qqSakder9fpdD579ox/VZ7y48ePtbU1QRDMZnN7e7vFYrnUdKoEJMHpqZLicFRUVFRUVDDG+vr6eJEE5/f77969u729zf8dfT7fkydPLBbL5ubm5OTko0eP4hRVUGUcugtQ7YjnaXd3V/mJyM7Ozubm5osXLwwGw8LCgs/n6+rqSnw6+3M1R7vaBKenSjqeVmKxWCwWq66u9vv9fEs0Gj0/P2eMlZeX19XVKQdriyourMOIsyPGWHNz8+zsrHLY4uJic3Mzv/paW1ubl5fHP1ZOcDq12itMT7J0DEcgECgrK7NarcfHx6IoMsbu378/NDTk8/n29va0xwBVUUUidRjUjhhj/Kd2d3dX9wlNJtPjx4/5tZgEp1Orvdr0ZErHC29+vz8YDG5sbEQikZ8/f7pcLrfbfevWra2tre/fv1dUVHg8HuX4C4sq+JXVRHbEt3s8ntnZWfnYLn/nlpaWtra2otEorwJJcLqKvNqrTU+mtAuHJEnhcLi3t5cxFggE/H6/w+E4OjpyOp1ut7u8vLy/v18VDlVRBa/DcDqd/KFuHYbujuRvT2lp6dzcnPzjyy/eFhUV1dfXu93u9+/fX2q6Cl/tlacnU9qdVvb29uRjeHFxcSAQYIx9/vyZF3uenJxcv35dOV5bVHFhGUecHck8Hs/MzAz/e01NzczMDD9+rK6u8nNK4tN1V3u16UmWdkeOra0t+YhqNBoLCgpOTk7a29vHxsaMRqMgCPxqcpyiCqqMQxTFoaEhPqa4uFgURdWO+GCOF6nzQFRVVYXD4YGBgWvXrlVVVfFwaNdJTddd7eTkZOLTUyX76zlQxnEpuVXPgTKOK8v+cMCVIRxAQjiAhHAACeEAEsIBpFwJR19fH/9LJBL58OFDNBr1er3DfywtLYVCoYGBAf6pD2NscHDw8PBQnuX1ekdGRrTPlt3S7hPSv0ruvVFQUCDXWMhsNtvGxsbt27e3t7dv3LihvF6TbpUWyZErRw5O7r2h+1WPxzM/Py9J0vz8vOraHkuzSovkyKFwKHtv6LJarXa7/du3bxaLRXshN60qLZIjV8LBe29Eo1HlFvk9x69fv/jGpqam9fV17WGD45UWyVhuesiV9xy898bY2Njq6mptbS1T1HUqWa1Wo9FotVp1nyR9Ki2SI1eOHKreG1d+njSptEiOXDlycMreG/y0wrc7nc4HDx4k8gxpUmmRHNlfzwGXklv1HHBlCAeQEA4gIRxAQjiAhHAACeEAUsZ8CCa3uBBFsbW1ld8wRdnfIhQKjY+P9/b28l86Ghwc7Ozs/Pjxo7YxhrJ7h3wXFeVeGGNnZ2fNzc3l5eXawbxtRoLdPuI0EUl/GRMO5U1Svn792tPTw/7d38Jms2kLMrSNMUwmk+5dVFR7CQaDnz59MhgM2sFxFqntt5HRd2bJvNOK3W4/Pj5mev0t4hRkyI0xEuze4XA4BEHQHUxdltPtt6Ha+39+9UmVeeHY2dnhv4Ks7W8RvyCDN8ZIsHvHzs5OW1ub7uDu7m7dhen221Dt/UqvOGUy5rQiXyczmUz8k3/d/hZNTU39/f2vX7/WPgNvjCFXicqUXfHlW7Hs7+/rVgRqb7kio/ptKPd+iRecBjImHKryC6q/RZyCDN4YQxTFON07lO9shoaGioqKEmn1EWc9qr1f/fWnQoZlWRa/v4WW3BjjwruocPn5+YWFhQkOvnA9GXpnlow5cqjotsfQHjB023jo3kVFNZ4x1t7efvPmTWpwIt0+Mv3OLKjngH9BPQckBOEAEsIBJIQDSAgHkBAOICEcQEI4gIRwAAnhABLCASSEA0gIB5AQDiAhHEBCOICEcAAJ4QASwgEkhANICAeQEA4gIRxAQjiAhHAACeEAEsIBJIQDSAgHkBAOICEcQEI4gIRwAAnhABLCASSEA0gIB5AQDiAhHEBCOICEcAAJ4QASwgEkhANICAeQEA4gIRxAQjiAhHAACeEAEsIBJIQDSAgHkBAOICEcQEI4gIRwAAnhABLCASSEA0gIB5AQDiAZlQ98Pl+q1gFpCEcOIAmSJKV6DZCmcOQA0j+r1iER90QPiwAAAABJRU5ErkJggg==",
  "base64",
);

@Injectable()
export class LettersService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private aiAgent: LetterAiAgentService,
    private pdfService: LetterPdfService,
  ) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    fs.mkdirSync(LETTERHEAD_DIR, { recursive: true });
    if (!fs.existsSync(FIRST_WARNING_TEMPLATE_PATH)) throw new Error("1-ogohlantirish shabloni topilmadi: " + FIRST_WARNING_TEMPLATE_PATH);
  }

  // --- Firma blankasi (letterhead) ---

  private findLetterheadFile(): string | null {
    if (!fs.existsSync(LETTERHEAD_DIR)) return null;
    const files = fs.readdirSync(LETTERHEAD_DIR).filter((f) => f.startsWith("current"));
    return files.length > 0 ? path.join(LETTERHEAD_DIR, files[0]) : null;
  }

  async getLetterheadStatus() {
    const file = this.findLetterheadFile();
    return { exists: !!file, url: file ? `/uploads/letterhead/${path.basename(file)}` : null };
  }

  async uploadLetterhead(file: Express.Multer.File, user: { id: string; role: string }) {
    if (![Role.ADMIN, Role.MANAGER].includes(user.role as Role)) {
      fs.unlinkSync(file.path);
      throw new ForbiddenException("Faqat rahbariyat firma blankasini o'zgartira oladi.");
    }
    // Eski blank fayllarini (boshqa kengaytmadagi) tozalash - bitta faol blank bo'lishi uchun
    for (const f of fs.readdirSync(LETTERHEAD_DIR)) {
      if (f.startsWith("current") && f !== path.basename(file.path)) {
        fs.unlinkSync(path.join(LETTERHEAD_DIR, f));
      }
    }
    await this.auditLog.record({ userId: user.id, action: AuditAction.UPDATE, metadata: { kind: "letterhead", action: "upload" } });
    return this.getLetterheadStatus();
  }

  async removeLetterhead(user: { id: string; role: string }) {
    if (![Role.ADMIN, Role.MANAGER].includes(user.role as Role)) throw new ForbiddenException("Faqat rahbariyat firma blankasini o'chira oladi.");
    const file = this.findLetterheadFile();
    if (file) fs.unlinkSync(file);
    await this.auditLog.record({ userId: user.id, action: AuditAction.UPDATE, metadata: { kind: "letterhead", action: "remove" } });
    return this.getLetterheadStatus();
  }

  /** Xat turiga mos raqam boshlanishi: X-, MA-, OG1-, OG2- */
  private numberPrefix(type: LetterType): string {
    return type === LetterType.FIRST_WARNING ? "OG1"
      : type === LetterType.FINAL_WARNING ? "OG2"
      : type === LetterType.REFERENCE ? "MA" : "X";
  }

  /**
   * Foydalanuvchining bo'limi (Kadrlar kartotekasidagi departmentRef orqali).
   * Bo'limga biriktirilmagan foydalanuvchilar uchun umumiy "GENERAL" hisoblagich ishlatiladi.
   */
  private async resolveDepartmentScope(userId: string): Promise<string> {
    const employee = await this.prisma.employee.findFirst({
      where: { userId },
      select: { departmentRefId: true },
    });
    return employee?.departmentRefId ?? "GENERAL";
  }

  private incomingLetterNumber(letters: { documentNumber: string }[], prefix: string) {
    let max = 0;
    for (const l of letters) {
      const m = new RegExp(`^${prefix}-(\\d+)$`).exec(String(l.documentNumber).trim());
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `${prefix}-${String(max + 1).padStart(4, "0")}`;
  }

  /**
   * Hujjat raqamini KUTILAYOTGAN qiymat sifatida ko'rsatadi - hisoblagichni OSHIRMAYDI.
   * Xat yaratish formasida foydalanuvchiga oldindan raqam ko'rsatish uchun ishlatiladi
   * (real raqam faqat "Yaratish" bosilganda, `create()` ichida beriladi).
   */
  async peekNextDocumentNumber(type: LetterType, direction: "INCOMING" | "OUTGOING" = "OUTGOING", userId?: string) {
    const prefix = this.numberPrefix(type);

    if (direction === "OUTGOING") {
      const year = new Date().getFullYear();
      const departmentId = userId ? await this.resolveDepartmentScope(userId) : "GENERAL";
      const counter = await this.prisma.documentCounter.findUnique({ where: { departmentId_year: { departmentId, year } } });
      return { documentNumber: `${prefix}-${(counter?.lastNumber ?? 0) + 1}/${year}` };
    }

    const letters = await this.prisma.letter.findMany({ where: { type, direction }, select: { documentNumber: true } });
    return { documentNumber: this.incomingLetterNumber(letters, prefix) };
  }

  /**
   * Keyingi hujjat raqamini BERADI (hisoblagichni haqiqatan oshiradi). Faqat hujjat
   * yaratilayotganda chaqiriladi - ikki marta chaqirilsa ikkita turli raqam qaytaradi.
   *
   * Chiquvchi hujjatlar uchun: har bir bo'lim va yil bo'yicha alohida, ketma-ket
   * (1, 2, 3, ...) hisoblagich ishlatiladi - shunda raqamlar hech qachon takrorlanmaydi
   * va har yil (1-yanvardan) yana 1 dan boshlanadi. Hisoblagich bitta atomik
   * UPDATE/UPSERT amali orqali oshiriladi, shu sababli bir vaqtda bir nechta
   * hujjat yaratilganda ham (race condition) raqam takrorlanib qolmaydi.
   *
   * Kiruvchi hujjatlar uchun eski (turi bo'yicha, eng katta raqamga asoslangan) usul saqlanadi.
   */
  async getNextDocumentNumber(type: LetterType, direction: "INCOMING" | "OUTGOING", userId?: string) {
    const prefix = this.numberPrefix(type);

    if (direction === "OUTGOING") {
      const year = new Date().getFullYear();
      const departmentId = userId ? await this.resolveDepartmentScope(userId) : "GENERAL";

      // Postgres'da Prisma upsert bitta "INSERT ... ON CONFLICT DO UPDATE" so'roviga
      // aylanadi - shuning uchun bu amal atomik va parallel so'rovlarda ham xavfsiz.
      const counter = await this.prisma.documentCounter.upsert({
        where: { departmentId_year: { departmentId, year } },
        create: { departmentId, year, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });

      return { documentNumber: `${prefix}-${counter.lastNumber}/${year}` };
    }

    // Kiruvchi xatlar: oldingi mantiq - eng katta mavjud raqam asos qilib olinadi.
    const letters = await this.prisma.letter.findMany({ where: { type, direction }, select: { documentNumber: true } });
    return { documentNumber: this.incomingLetterNumber(letters, prefix) };
  }

  async create(dto: CreateLetterDto, userId: string) {
    // 1-ogohlantirish shabloni faqat jismoniy shaxslar (fuqarolar) uchun mo'ljallangan
    const counterpartyType = dto.type === LetterType.FIRST_WARNING ? "CITIZEN" : (dto.counterpartyType || "ORGANIZATION");
    const direction = dto.direction === "INCOMING" ? "INCOMING" : "OUTGOING";
    const number = await this.getNextDocumentNumber(dto.type, direction, userId);
    const body = dto.bodyText?.trim() || (await this.aiAgent.generate(dto)).text;
    const letter = await this.prisma.letter.create({
      data: {
        direction: dto.direction === "INCOMING" ? "INCOMING" : "OUTGOING", type: dto.type, status: LetterStatus.DRAFT,
        documentNumber: number.documentNumber, documentDate: new Date(dto.documentDate),
        counterpartyType, counterpartyName: dto.counterpartyName,
        counterpartyAddress: dto.counterpartyAddress, phoneNumber: dto.phoneNumber, summary: dto.summary,
        bodyText: body, aiGenerated: dto.aiGenerated ?? false, createdById: userId,
        contractNumber: dto.contractNumber,
        contractDate: dto.contractDate ? new Date(dto.contractDate) : undefined,
        paymentDueDay: dto.paymentDueDay,
        monthlyPaymentAmount: dto.monthlyPaymentAmount,
        overdueDays: dto.overdueDays,
        charityAmount: dto.charityAmount,
      },
    });
    await this.auditLog.record({ userId, action: AuditAction.CREATE, metadata: { letterId: letter.id, kind: "letter" } });
    await this.generateDraftFile(letter.id);
    return this.findOne(letter.id);
  }

  async aiGenerate(input: {
    type: LetterType; documentDate: string; counterpartyType?: string; counterpartyName: string;
    counterpartyAddress?: string; summary: string; contractNumber?: string; contractDate?: string;
    monthlyPaymentAmount?: number; overdueDays?: number; charityAmount?: number;
  }) {
    return this.aiAgent.generate(input);
  }

  async getAiAgentStats() {
    return this.aiAgent.getLearningStats();
  }

  async findAll(query: Partial<QueryLettersDto>) {
    const where: Prisma.LetterWhereInput = {};
    if (query.direction) where.direction = query.direction;
    if (query.type) where.type = query.type;
    if (query.status) {
      where.status = query.status;
    } else {
      // O'chirilgan xatlar asosiy ro'yxatda ko'rinmaydi - ular "Fayllar arxivi"ga o'tadi
      where.status = { not: LetterStatus.DELETED };
    }
    const page = query.page ?? 1; const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.letter.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: "desc" }, include: { createdBy: { select: { fullName: true } } } }),
      this.prisma.letter.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async exportRows(query: QueryLettersDto) {
    const where: Prisma.LetterWhereInput = {};
    if (query.direction) where.direction = query.direction; if (query.type) where.type = query.type; if (query.status) where.status = query.status;
    return this.prisma.letter.findMany({ where, orderBy: [{ documentDate: "asc" }, { createdAt: "asc" }], include: { createdBy: { select: { fullName: true } } } });
  }

  async countsByDirection() {
    const [all, incoming, outgoing] = await this.prisma.$transaction([
      this.prisma.letter.count(), this.prisma.letter.count({ where: { direction: "INCOMING" } }), this.prisma.letter.count({ where: { direction: "OUTGOING" } }),
    ]); return { all, incoming, outgoing };
  }

  async findOne(id: string) {
    const letter = await this.prisma.letter.findUnique({ where: { id }, include: { createdBy: { select: { fullName: true } } } });
    if (!letter) throw new NotFoundException("Xat topilmadi.");
    return letter;
  }

  /** Tasdiqlashga yuborish. approverId berilsa - xat aynan shu rahbarga biriktiriladi. */
  async submitForApproval(id: string, userId: string, approverId?: string) {
    const letter = await this.findOne(id);
    if (![LetterStatus.DRAFT].includes(letter.status as LetterStatus)) {
      throw new BadRequestException("Faqat qoralama xatni rahbariyatga yuborish mumkin.");
    }

    // Tanlangan shaxs haqiqatan rahbar ekanini tekshiramiz
    if (approverId) {
      const approver = await this.prisma.user.findUnique({ where: { id: approverId } });
      if (!approver || !approver.isActive) throw new BadRequestException("Tanlangan rahbar topilmadi.");
      if (![Role.ADMIN, Role.MANAGER].includes(approver.role as Role)) {
        throw new BadRequestException("Xatni faqat rahbariyat a'zosiga yuborish mumkin.");
      }
    }

    await this.generateDraftFile(id);
    const updated = await this.prisma.letter.update({
      where: { id },
      data: {
        status: LetterStatus.PENDING_APPROVAL,
        submittedAt: new Date(),
        assignedApproverId: approverId ?? null,
      },
    });
    await this.auditLog.record({
      userId, action: AuditAction.STATUS_CHANGE,
      metadata: { letterId: id, to: LetterStatus.PENDING_APPROVAL, approverId: approverId ?? null },
    });
    return updated;
  }

  /** Tasdiqlashi mumkin bo'lgan rahbarlar ro'yxati. */
  async listApprovers() {
    return this.prisma.user.findMany({
      where: { isActive: true, role: { in: [Role.ADMIN, Role.MANAGER] } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, email: true, role: true },
    });
  }

  async approve(id: string, user: { id: string; role: string }) {
    // Xat aniq bir rahbarga biriktirilgan bo'lsa - faqat o'sha (yoki ADMIN) tasdiqlaydi
    const target = await this.prisma.letter.findUnique({ where: { id }, select: { assignedApproverId: true } });
    if (target?.assignedApproverId && target.assignedApproverId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException("Bu xat boshqa rahbarga tasdiqlash uchun yuborilgan.");
    }
    if (![Role.ADMIN, Role.MANAGER].includes(user.role as Role)) throw new ForbiddenException("Faqat rahbariyat xatni tasdiqlashi mumkin.");
    const letter = await this.findOne(id);
    if (letter.status !== LetterStatus.PENDING_APPROVAL) throw new BadRequestException("Xat rahbariyat tasdig'iga yuborilmagan.");
    const token = randomUUID();
    const finalFile = await this.generateFinalFile(id, token);
    const updated = await this.prisma.letter.update({ where: { id }, data: { status: LetterStatus.ARCHIVED, approvedAt: new Date(), approvedById: user.id, qrToken: token, finalFileUrl: finalFile } });
    await this.auditLog.record({ userId: user.id, action: AuditAction.STATUS_CHANGE, metadata: { letterId: id, to: LetterStatus.ARCHIVED, qrToken: token } });
    return updated;
  }

  /** Rahbariyat xatni rad etadi - sabab bilan. Xat qoralamaga qaytmaydi, alohida holat oladi. */
  async reject(id: string, user: { id: string; role: string }, reason: string) {
    if (![Role.ADMIN, Role.MANAGER].includes(user.role as Role)) {
      throw new ForbiddenException("Faqat rahbariyat xatni rad etishi mumkin.");
    }
    const letter = await this.findOne(id);
    if (letter.status !== LetterStatus.PENDING_APPROVAL) {
      throw new BadRequestException("Xat rahbariyat tasdig'iga yuborilmagan.");
    }
    const trimmed = (reason ?? "").trim();
    if (trimmed.length < 3) {
      throw new BadRequestException("Rad etish sababini yozing.");
    }
    const updated = await this.prisma.letter.update({
      where: { id },
      data: { status: LetterStatus.REJECTED, rejectedAt: new Date(), rejectionReason: trimmed },
    });
    await this.auditLog.record({
      userId: user.id,
      action: AuditAction.STATUS_CHANGE,
      metadata: { letterId: id, to: LetterStatus.REJECTED, reason: trimmed },
    });
    return updated;
  }

  /** Xat matnini tahrirlash - faqat qoralama holatidagi xatlar uchun. */
  async updateBody(id: string, data: { bodyText?: string; summary?: string }, userId: string) {
    const letter = await this.findOne(id);
    if (letter.status !== LetterStatus.DRAFT) {
      throw new BadRequestException("Faqat qoralama holatidagi xatni tahrirlash mumkin.");
    }

    const updated = await this.prisma.letter.update({
      where: { id },
      data: {
        bodyText: data.bodyText ?? letter.bodyText,
        summary: data.summary ?? letter.summary,
      },
    });

    // Matn o'zgargani uchun qoralama fayl qaytadan shakllantiriladi
    await this.generateDraftFile(id);
    await this.auditLog.record({ userId, action: AuditAction.UPDATE, metadata: { letterId: id, kind: "letterBody" } });
    return updated;
  }

  async softDelete(id: string, userId: string) {
    await this.findOne(id);
    const updated = await this.prisma.letter.update({ where: { id }, data: { status: LetterStatus.DELETED } });
    await this.auditLog.record({ userId, action: AuditAction.DELETE, metadata: { letterId: id, kind: "letter" } });
    return updated;
  }

  /**
   * Tasdiqlangan xatning PDF nusxasi. Word shablonidan hosil bo'lgan HAQIQIY
   * matn asosida tayyorlanadi, QR kod ham qo'shiladi.
   */
  async buildPdf(id: string): Promise<{ buffer: Buffer; name: string }> {
    const letter = await this.findOne(id);
    const approved = letter.status === LetterStatus.ARCHIVED && !!letter.qrToken;
    // Word shabloni to'ldirilib, aynan o'sha fayl PDF ga aylantiriladi -
    // shuning uchun PDF va DOCX bir xil ko'rinadi (QR ham ichida).
    const docx = await this.buildDocx(letter, approved, letter.qrToken ?? undefined);
    const buffer = await this.pdfService.docxToPdf(docx);
    return { buffer, name: `xat-${letter.documentNumber}.pdf` };
  }

  /** Xatning Word shablonidan olingan haqiqiy matni (QR sahifasida ko'rsatish uchun). */
  async getRenderedText(id: string): Promise<string[]> {
    const letter = await this.findOne(id);
    const approved = letter.status === LetterStatus.ARCHIVED && !!letter.qrToken;
    const docx = await this.buildDocx(letter, approved, letter.qrToken ?? undefined);
    return this.pdfService.extractParagraphs(docx);
  }

  // --- QR orqali ochiq (login talab qilinmaydigan) tekshiruv ---
  getPublicBaseUrl(): string {
    // Render o'zi RENDER_EXTERNAL_URL ni beradi - bu xizmatning haqiqiy manzili.
    // Shuning uchun undan foydalanamiz, aks holda QR noto'g'ri domenga ishora qiladi.
    const configured =
      process.env.PUBLIC_APP_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      process.env.CORS_ORIGIN?.split(",")[0];
    return (configured || "http://localhost:5173").replace(/\/+$/, "");
  }

  buildVerifyUrl(letterId: string, token: string): string {
    return `${this.getPublicBaseUrl()}/verify/${letterId}?token=${token}`;
  }

  async verifyByToken(id: string, token: string) {
    const letter = await this.prisma.letter.findUnique({ where: { id } });
    if (!letter || letter.status !== LetterStatus.ARCHIVED || !letter.qrToken || letter.qrToken !== token) {
      throw new NotFoundException("Hujjat topilmadi yoki QR kodi noto'g'ri.");
    }
    // Word shablonidan olingan haqiqiy xat matni - QR sahifasida shu ko'rsatiladi
    let renderedText: string[] = [];
    try {
      renderedText = await this.getRenderedText(id);
    } catch {
      renderedText = [];
    }

    // Faqat elektron tasdiqlash uchun zarur bo'lgan xavfsiz maydonlar qaytariladi
    return {
      renderedText,
      documentNumber: letter.documentNumber,
      type: letter.type,
      counterpartyName: letter.counterpartyName,
      counterpartyAddress: letter.counterpartyAddress,
      documentDate: letter.documentDate,
      summary: letter.summary,
      bodyText: letter.bodyText,
      approvedAt: letter.approvedAt,
      finalFileUrl: letter.finalFileUrl,
    };
  }

  async generateDraftFile(id: string) {
    const letter = await this.findOne(id);
    const file = await this.buildDocx(letter, false);
    const name = `xat-${letter.documentNumber}-qoralama.docx`;
    const full = path.join(ARCHIVE_DIR, name); fs.writeFileSync(full, file);
    await this.prisma.letter.update({ where: { id }, data: { draftFileUrl: `/uploads/letters/${name}` } });
    return `/uploads/letters/${name}`;
  }

  async generateFinalFile(id: string, token: string) {
    const letter = await this.findOne(id);
    const file = await this.buildDocx(letter, true, token);
    const name = `xat-${letter.documentNumber}-tasdiqlangan.docx`;
    fs.writeFileSync(path.join(ARCHIVE_DIR, name), file);
    return `/uploads/letters/${name}`;
  }

  async download(id: string, kind: "draft" | "final") {
    const letter = await this.findOne(id);

    // Xat tasdiqlangan bo'lsa - doim QR kodli YAKUNIY nusxa beriladi.
    // (Aks holda eski qoralama yuklanib, QR o'rni bo'sh ko'rinib qolardi.)
    const effectiveKind: "draft" | "final" =
      letter.status === LetterStatus.ARCHIVED && letter.qrToken ? "final" : kind;

    let url = effectiveKind === "final" ? letter.finalFileUrl : letter.draftFileUrl;

    // Render kabi platformalarda yuklangan fayllar har deploydan keyin o'chib ketadi
    // (vaqtinchalik disk). Shuning uchun fayl topilmasa - uni qaytadan yaratamiz.
    const exists = url ? fs.existsSync(path.resolve(process.cwd(), url.replace(/^\//, ""))) : false;
    if (!url || !exists) {
      if (effectiveKind === "final") {
        if (!letter.qrToken) throw new NotFoundException("Fayl mavjud emas: xat hali tasdiqlanmagan.");
        url = await this.generateFinalFile(id, letter.qrToken);
      } else {
        url = await this.generateDraftFile(id);
      }
    }

    const full = path.resolve(process.cwd(), url!.replace(/^\//, ""));
    if (!fs.existsSync(full)) throw new NotFoundException("Faylni yaratib bo'lmadi.");
    return { full, name: path.basename(full) };
  }

  /** "O'chirilgan" bo'limi - faqat o'chirilgan xatlar (tasdiqlanganlar "Imzolangan"da). */
  async archiveList() {
    return this.prisma.letter.findMany({
      where: { status: LetterStatus.DELETED },
      orderBy: { updatedAt: "desc" },
      include: { createdBy: { select: { fullName: true } } },
    });
  }

  private async buildDocx(letter: any, approved: boolean, token?: string): Promise<Buffer> {
    if (letter.type === LetterType.FIRST_WARNING) {
      // 1-ogohlantirish - kompaniya taqdim etgan qat'iy yuridik shablon, doim shu
      // shablon ishlatiladi (umumiy firma blankasidan mustaqil).
      return this.buildFirstWarningDocx(letter, approved, token);
    }
    // 1) Kompaniya o'z blankasini yuklagan bo'lsa - o'sha ustun turadi
    const letterheadFile = this.findLetterheadFile();
    if (letterheadFile) {
      return await this.buildDocxFromTemplate(letterheadFile, letter, approved, token);
    }

    // 2) Aks holda tizimdagi standart xat blanki ishlatiladi
    if (fs.existsSync(LETTER_TEMPLATE_PATH)) {
      return await this.buildDocxFromTemplate(LETTER_TEMPLATE_PATH, letter, approved, token);
    }

    // 3) Shablon topilmasa - dastur ichida shakllantiriladi
    return this.buildDocxDefault(letter, approved, token);
  }

  /**
   * "1-ogohlantirish" turidagi xatlar uchun - kompaniya yuborgan aniq yuridik
   * shablon (templates/1-OGOHLANTIRISH-NAMUNA.docx) ishlatiladi. Shablondagi teglar:
   *   {kun} {oy} {yil} {xat raqami} {manzil} {kimga} {telefon_raqam}
   *   {shartnoma_raqami} {shartnoma_tuzilgan_kun} {shartnoma_tuzilgan_oy} {shartnoma_tuzilgan_yil}
   *   {grafik_sanasi} {kechikkan_kun} {kechikkan_kun_so'z_bilan}
   *   {oylik_to'lov} {oylik_to'lov_so'z_bilan} {xayriya_summasi} {xayriya_summasi_ so'z_bilan}
   *   {%qr_kod}
   */
  private async buildFirstWarningDocx(letter: any, approved: boolean, token?: string): Promise<Buffer> {
    try {
      const content = fs.readFileSync(FIRST_WARNING_TEMPLATE_PATH, "binary");
      const zip = new PizZip(content);
      const qrBuffer = approved && token
        ? await QRCode.toBuffer(this.buildVerifyUrl(letter.id, token), { width: 180, margin: 1 })
        : BLANK_QR_PLACEHOLDER_PNG;
      const imageModule = new ImageModule({ centered: false, getImage: () => qrBuffer, getSize: () => [90, 90] });
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, modules: [imageModule] });

      const docDate = letter.documentDate ? new Date(letter.documentDate) : new Date();
      const contractDate = letter.contractDate ? new Date(letter.contractDate) : null;
      const overdueDays = letter.overdueDays ?? 0;
      const monthlyPayment = letter.monthlyPaymentAmount ?? 0;
      const charityAmount = letter.charityAmount ?? 0;

      doc.render({
        kun: String(docDate.getDate()),
        oy: UZ_MONTHS[docDate.getMonth()],
        yil: String(docDate.getFullYear()),
        "xat raqami": letter.documentNumber ?? "",
        manzil: letter.counterpartyAddress ?? "",
        kimga: letter.counterpartyName ?? "",
        telefon_raqam: letter.phoneNumber ?? "",
        shartnoma_raqami: letter.contractNumber ?? "",
        shartnoma_tuzilgan_kun: contractDate ? String(contractDate.getDate()) : "",
        shartnoma_tuzilgan_oy: contractDate ? UZ_MONTHS[contractDate.getMonth()] : "",
        shartnoma_tuzilgan_yil: contractDate ? String(contractDate.getFullYear()) : "",
        grafik_sanasi: letter.paymentDueDay != null ? String(letter.paymentDueDay) : "",
        kechikkan_kun: String(overdueDays),
        "kechikkan_kun_so\u2019z_bilan": daysToWordsUz(overdueDays),
        "oylik_to\u2019lov": formatThousandsUz(monthlyPayment),
        "oylik_to\u2019lov_so\u2019z_bilan": moneyToWordsUz(monthlyPayment).replace(/ so'm$/, ""),
        xayriya_summasi: formatThousandsUz(charityAmount),
        "xayriya_summasi_ so\u2019z_bilan": moneyToWordsUz(charityAmount).replace(/ so'm$/, ""),
        qr_kod: "qr",
      });
      return doc.getZip().generate({ type: "nodebuffer" });
    } catch (err: any) {
      const details = err?.properties?.errors?.map((e: any) => e.properties?.explanation).filter(Boolean).join("; ");
      throw new BadRequestException("1-ogohlantirish shablonida xatolik: " + (details || err.message));
    }
  }

  /**
   * Kompaniya yuklagan .docx blankni shablon sifatida ishlatib, xat ma'lumotlarini
   * shu blank ichidagi teglarga joylashtiradi. Blankda quyidagi teglardan istalganini
   * ishlatish mumkin (barchasi ixtiyoriy, blank qaysi teglarni ishlatsa - o'sha to'ldiriladi):
   *   {raqam} {sana} {kimga} {manzil} {telefon} {sarlavha} {matn}
   *   {shartnoma_raqami} {shartnoma_sanasi} {oylik_tolov} {kechikkan_kun} {xayriya_summasi}
   *   {qr_kod}
   */
  private async buildDocxFromTemplate(templatePath: string, letter: any, approved: boolean, token?: string): Promise<Buffer> {
    const money = (n: number) => new Intl.NumberFormat("uz-UZ").format(Math.round(n)) + " so'm";
    const title = letter.type === LetterType.FINAL_WARNING ? "ЯКУНИЙ ОГОҲЛАНТИРИШ ХАТИ" : letter.type === LetterType.REFERENCE ? "МАЪЛУМОТНОМА" : "XAT";
    try {
      const content = fs.readFileSync(templatePath, "binary");
      const zip = new PizZip(content);
      // {%qr_kod} - blankda shu tegni qo'yilsa, xatga tegishli UNIKAL QR kod rasm sifatida
      // joylashadi. Tasdiqlangandan keyingina haqiqiy QR bo'ladi, aks holda bo'sh joy qoladi.
      const qrBuffer = approved && token
        ? await QRCode.toBuffer(this.buildVerifyUrl(letter.id, token), { width: 180, margin: 1 })
        : BLANK_QR_PLACEHOLDER_PNG;
      const imageModule = new ImageModule({
        centered: false,
        getImage: () => qrBuffer,
        getSize: () => [90, 90],
      });
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, modules: [imageModule] });
      const docDate = letter.documentDate ? new Date(letter.documentDate) : new Date();
      doc.render({
        raqam: letter.documentNumber ?? "",
        // Ba'zi blanklarda raqam tegi "xat raqami" deb yozilgan
        "xat raqami": letter.documentNumber ?? "",
        sana: docDate.toLocaleDateString("uz-UZ"),
        // Sana bo'laklari alohida teglar sifatida ham beriladi
        kun: String(docDate.getDate()),
        oy: UZ_MONTHS[docDate.getMonth()],
        yil: String(docDate.getFullYear()),
        kimga: letter.counterpartyName ?? "",
        manzil: letter.counterpartyAddress ?? "",
        telefon: letter.phoneNumber ?? "",
        telefon_raqam: letter.phoneNumber ?? "",
        sarlavha: title,
        matn: letter.bodyText ?? "",
        shartnoma_raqami: letter.contractNumber ?? "",
        shartnoma_sanasi: letter.contractDate ? new Date(letter.contractDate).toLocaleDateString("uz-UZ") : "",
        oylik_tolov: letter.monthlyPaymentAmount != null ? money(letter.monthlyPaymentAmount) : "",
        kechikkan_kun: letter.overdueDays != null ? String(letter.overdueDays) : "",
        xayriya_summasi: letter.charityAmount != null ? money(letter.charityAmount) : "",
        qr_kod: "qr",
      });
      return doc.getZip().generate({ type: "nodebuffer" });
    } catch (err: any) {
      const details = err?.properties?.errors?.map((e: any) => e.properties?.explanation).filter(Boolean).join("; ");
      throw new BadRequestException("Firma blankasi (Word shabloni) noto'g'ri formatlangan: " + (details || err.message));
    }
  }

  private async buildDocxDefault(letter: any, approved: boolean, token?: string): Promise<Buffer> {
    const qr = approved && token ? await QRCode.toBuffer(this.buildVerifyUrl(letter.id, token), { width: 180, margin: 1 }) : undefined;
    const header = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: "none" }, bottom: { style: "none" }, left: { style: "none" }, right: { style: "none" }, insideHorizontal: { style: "none" }, insideVertical: { style: "none" } }, rows: [new TableRow({ children: [
      new TableCell({ width: { size: 62, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "«WAFA LEASING»", bold: true, size: 28 }), new TextRun({ text: "\nMas’uliyati cheklangan jamiyat", size: 20 }), new TextRun({ text: "\n«WAFA LEASING»", bold: true, size: 22 }), new TextRun({ text: "\nLimited liability company", size: 20 }), new TextRun({ text: "\nToshkent sh., Chilonzor t., 2-Charx Kamolon MFY, Bunyodkor ko‘chasi, 2-uy", size: 18 }), new TextRun({ text: "\nINN: 311886363, MFO 01041, Toshkent sh., \"Asia Alliance Bank\"", size: 18 }), new TextRun({ text: "\nh/r: 2020 8000 0071 9560 9001, e-mail: wafaleasing@gmail.com", size: 18 })] })] }),
      new TableCell({ width: { size: 38, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "№ " + letter.documentNumber, bold: true, size: 22 })] }), new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: new Date(letter.documentDate).toLocaleDateString("uz-UZ"), size: 20 })] })] })
    ] })] });
    const numberDateLine = new Paragraph({ children: [] });
    const recipient = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: "none" }, bottom: { style: "none" }, left: { style: "none" }, right: { style: "none" }, insideHorizontal: { style: "none" }, insideVertical: { style: "none" } }, rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Kimga: ", bold: true, size: 21 }), new TextRun({ text: letter.counterpartyName, size: 21 })] }), new Paragraph({ children: [new TextRun({ text: "Manzil: ", bold: true, size: 21 }), new TextRun({ text: letter.counterpartyAddress || "—", size: 21 })] })] })] })] });
    const paragraphs = String(letter.bodyText || "").split(/\n+/).map((t: string) => new Paragraph({ spacing: { after: 160, line: 300 }, alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: t.trim(), size: 22, font: "Times New Roman" })] }));

    const warningRows: TableRow[] = [];
    if (letter.type === LetterType.FINAL_WARNING) {
      const money = (n: number) => new Intl.NumberFormat("uz-UZ").format(Math.round(n)) + " so'm";
      const addRow = (label: string, value: string) => warningRows.push(new TableRow({ children: [
        new TableCell({ width: { size: 45, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, font: "Times New Roman" })] })] }),
        new TableCell({ width: { size: 55, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: value, size: 20, font: "Times New Roman" })] })] }),
      ] }));
      if (letter.contractNumber) addRow("Shartnoma raqami:", "№ " + letter.contractNumber + (letter.contractDate ? ", " + new Date(letter.contractDate).toLocaleDateString("uz-UZ") : ""));
      if (letter.monthlyPaymentAmount != null) addRow("Oylik to'lov summasi:", money(letter.monthlyPaymentAmount));
      if (letter.overdueDays != null) addRow("Kechikkan kunlar soni:", String(letter.overdueDays) + " kun");
      if (letter.charityAmount != null) addRow("Xayriya to'lovi summasi:", money(letter.charityAmount));
    }
    const warningTable = warningRows.length > 0
      ? [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: "single", size: 4, color: "CCCCCC" }, bottom: { style: "single", size: 4, color: "CCCCCC" }, left: { style: "none" }, right: { style: "none" }, insideHorizontal: { style: "single", size: 2, color: "E5E5E5" }, insideVertical: { style: "none" } }, rows: warningRows }), new Paragraph({ spacing: { after: 160 }, children: [] })]
      : [];
    const footer = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: "none" }, bottom: { style: "none" }, left: { style: "none" }, right: { style: "none" }, insideHorizontal: { style: "none" }, insideVertical: { style: "none" } }, rows: [new TableRow({ children: [
      new TableCell({ width: { size: 72, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Direktor", bold: true, size: 22 }), new TextRun({ text: "\t\tM. Xudayberganov", bold: true, size: 22 })] })] }),
      new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, children: qr ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new ImageRun({ data: qr, transformation: { width: 95, height: 95 }, type: "png" })] })] : [new Paragraph({})] })
    ] })] });
    const doc = new Document({ sections: [{ properties: { page: { margin: { top: 720, right: 900, bottom: 720, left: 900 } } }, children: [header, numberDateLine, new Paragraph({ spacing: { before: 240, after: 120 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: letter.type === LetterType.FINAL_WARNING ? "ЯКУНИЙ ОГОҲЛАНТИРИШ ХАТИ" : letter.type === LetterType.REFERENCE ? "МАЪЛУМОТНОМА" : "XAT", bold: true, size: 26, font: "Times New Roman" })] }), recipient, ...warningTable, new Paragraph({ spacing: { before: 220, after: 220 }, children: [new TextRun({ text: "Xat mazmuni", bold: true, size: 22, font: "Times New Roman" })] }), ...paragraphs, new Paragraph({ spacing: { before: 280 }, children: [new TextRun({ text: "Hurmat bilan,", size: 22, font: "Times New Roman" })] }), footer, ...(approved ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `QR tasdiq kodi: ${token}`, size: 14, color: "666666" })] })] : [])] }] });
    return Packer.toBuffer(doc);
  }
}
