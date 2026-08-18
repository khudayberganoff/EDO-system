import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, ImageRun, VerticalAlign } from "docx";
import * as QRCode from "qrcode";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { AuditAction, LetterStatus, LetterType, Role } from "../common/enums";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { CreateLetterDto } from "./dto/create-letter.dto";
import { QueryLettersDto } from "./dto/query-letters.dto";
import { LetterAiAgentService } from "./letter-ai-agent.service";

const ARCHIVE_DIR = path.resolve(process.cwd(), "uploads", "letters");
const TEMPLATE_PATH = path.resolve(process.cwd(), "..", "..", "templates", "WAFA_LEASING_XAT_NAMUNA.docx");

@Injectable()
export class LettersService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private aiAgent: LetterAiAgentService,
  ) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    if (!fs.existsSync(TEMPLATE_PATH)) throw new Error("WAFA xat shabloni topilmadi: " + TEMPLATE_PATH);
  }

  async getNextDocumentNumber(type: LetterType) {
    const prefix = type === LetterType.WARNING ? "OG" : type === LetterType.REFERENCE ? "MA" : "X";
    const last = await this.prisma.letter.findFirst({ where: { type }, orderBy: { createdAt: "desc" } });
    const n = last ? parseInt(String(last.documentNumber).replace(/\D/g, ""), 10) + 1 : 1;
    return { documentNumber: `${prefix}-${String(n).padStart(4, "0")}` };
  }

  async create(dto: CreateLetterDto, userId: string) {
    const number = await this.getNextDocumentNumber(dto.type);
    const body = dto.bodyText?.trim() || (await this.aiAgent.generate(dto)).text;
    const letter = await this.prisma.letter.create({
      data: {
        direction: "OUTGOING", type: dto.type, status: LetterStatus.DRAFT,
        documentNumber: number.documentNumber, documentDate: new Date(dto.documentDate),
        counterpartyType: dto.counterpartyType || "ORGANIZATION", counterpartyName: dto.counterpartyName,
        counterpartyAddress: dto.counterpartyAddress, phoneNumber: dto.phoneNumber, summary: dto.summary,
        bodyText: body, aiGenerated: dto.aiGenerated ?? false, createdById: userId,
        contractNumber: dto.contractNumber,
        contractDate: dto.contractDate ? new Date(dto.contractDate) : undefined,
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

  async findAll(query: QueryLettersDto) {
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

  async submitForApproval(id: string, userId: string) {
    const letter = await this.findOne(id);
    if (![LetterStatus.DRAFT].includes(letter.status as LetterStatus)) throw new BadRequestException("Faqat qoralama xatni rahbariyatga yuborish mumkin.");
    await this.generateDraftFile(id);
    const updated = await this.prisma.letter.update({ where: { id }, data: { status: LetterStatus.PENDING_APPROVAL, submittedAt: new Date() } });
    await this.auditLog.record({ userId, action: AuditAction.STATUS_CHANGE, metadata: { letterId: id, to: LetterStatus.PENDING_APPROVAL } });
    return updated;
  }

  async approve(id: string, user: { id: string; role: string }) {
    if (![Role.ADMIN, Role.MANAGER].includes(user.role as Role)) throw new ForbiddenException("Faqat rahbariyat xatni tasdiqlashi mumkin.");
    const letter = await this.findOne(id);
    if (letter.status !== LetterStatus.PENDING_APPROVAL) throw new BadRequestException("Xat rahbariyat tasdig'iga yuborilmagan.");
    const token = randomUUID();
    const finalFile = await this.generateFinalFile(id, token);
    const updated = await this.prisma.letter.update({ where: { id }, data: { status: LetterStatus.ARCHIVED, approvedAt: new Date(), approvedById: user.id, qrToken: token, finalFileUrl: finalFile } });
    await this.auditLog.record({ userId: user.id, action: AuditAction.STATUS_CHANGE, metadata: { letterId: id, to: LetterStatus.ARCHIVED, qrToken: token } });
    return updated;
  }

  async softDelete(id: string, userId: string) {
    await this.findOne(id);
    const updated = await this.prisma.letter.update({ where: { id }, data: { status: LetterStatus.DELETED } });
    await this.auditLog.record({ userId, action: AuditAction.DELETE, metadata: { letterId: id, kind: "letter" } });
    return updated;
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
    const url = kind === "final" ? letter.finalFileUrl : letter.draftFileUrl;
    if (!url) throw new NotFoundException("Fayl hali yaratilmagan.");
    const full = path.resolve(process.cwd(), url.replace(/^\//, ""));
    if (!fs.existsSync(full)) throw new NotFoundException("Fayl topilmadi.");
    return { full, name: path.basename(full) };
  }

  async archiveList() {
    return this.prisma.letter.findMany({
      where: { status: { in: [LetterStatus.ARCHIVED, LetterStatus.DELETED] } },
      orderBy: [{ approvedAt: "desc" }, { updatedAt: "desc" }],
      include: { createdBy: { select: { fullName: true } } },
    });
  }

  private async buildDocx(letter: any, approved: boolean, token?: string): Promise<Buffer> {
    const qr = approved && token ? await QRCode.toBuffer(`EDO-WAFA|LETTER|${letter.id}|${token}`, { width: 130, margin: 1 }) : undefined;
    const header = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: "none" }, bottom: { style: "none" }, left: { style: "none" }, right: { style: "none" }, insideHorizontal: { style: "none" }, insideVertical: { style: "none" } }, rows: [new TableRow({ children: [
      new TableCell({ width: { size: 62, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "«WAFA LEASING»", bold: true, size: 28 }), new TextRun({ text: "\nMas’uliyati cheklangan jamiyat", size: 20 }), new TextRun({ text: "\n«WAFA LEASING»", bold: true, size: 22 }), new TextRun({ text: "\nLimited liability company", size: 20 }), new TextRun({ text: "\nToshkent sh., Chilonzor t., 2-Charx Kamolon MFY, Bunyodkor ko‘chasi, 2-uy", size: 18 }), new TextRun({ text: "\nINN: 311886363, MFO 01041, Toshkent sh., \"Asia Alliance Bank\"", size: 18 }), new TextRun({ text: "\nh/r: 2020 8000 0071 9560 9001, e-mail: wafaleasing@gmail.com", size: 18 })] })] }),
      new TableCell({ width: { size: 38, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "№ " + letter.documentNumber, bold: true, size: 22 })] }), new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: new Date(letter.documentDate).toLocaleDateString("uz-UZ"), size: 20 })] })] })
    ] })] });
    const recipient = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: "none" }, bottom: { style: "none" }, left: { style: "none" }, right: { style: "none" }, insideHorizontal: { style: "none" }, insideVertical: { style: "none" } }, rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Kimga: ", bold: true, size: 21 }), new TextRun({ text: letter.counterpartyName, size: 21 })] }), new Paragraph({ children: [new TextRun({ text: "Manzil: ", bold: true, size: 21 }), new TextRun({ text: letter.counterpartyAddress || "—", size: 21 })] })] })] })] });
    const paragraphs = String(letter.bodyText || "").split(/\n+/).map((t: string) => new Paragraph({ spacing: { after: 160, line: 300 }, alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: t.trim(), size: 22, font: "Times New Roman" })] }));

    const warningRows: TableRow[] = [];
    if (letter.type === LetterType.WARNING) {
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
    const doc = new Document({ sections: [{ properties: { page: { margin: { top: 720, right: 900, bottom: 720, left: 900 } } }, children: [header, new Paragraph({ spacing: { before: 240, after: 120 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: letter.type === LetterType.WARNING ? "ОГОҲЛАНТИРИШ ХАТИ" : letter.type === LetterType.REFERENCE ? "МАЪЛУМОТНОМА" : "XAT", bold: true, size: 26, font: "Times New Roman" })] }), recipient, ...warningTable, new Paragraph({ spacing: { before: 220, after: 220 }, children: [new TextRun({ text: "Xat mazmuni", bold: true, size: 22, font: "Times New Roman" })] }), ...paragraphs, new Paragraph({ spacing: { before: 280 }, children: [new TextRun({ text: "Hurmat bilan,", size: 22, font: "Times New Roman" })] }), footer, ...(approved ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `QR tasdiq kodi: ${token}`, size: 14, color: "666666" })] })] : [])] }] });
    return Packer.toBuffer(doc);
  }
}
