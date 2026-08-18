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
import { moneyToWordsUz, daysToWordsUz } from "./number-to-words.uz";

const ARCHIVE_DIR = path.resolve(process.cwd(), "uploads", "letters");
const LETTERHEAD_DIR = path.resolve(process.cwd(), "uploads", "letterhead");
const TEMPLATE_PATH = path.resolve(process.cwd(), "..", "..", "templates", "WAFA_LEASING_XAT_NAMUNA.docx");
const FIRST_WARNING_TEMPLATE_PATH = path.resolve(process.cwd(), "..", "..", "templates", "1-OGOHLANTIRISH-NAMUNA.docx");
const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
const formatThousandsUz = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
// Oq (bo'sh) 180x180 PNG - hali tasdiqlanmagan xatlarda QR o'rniga vaqtinchalik bo'sh joy.
// Diqqat: 1x1 shaffof PNG ishlatilsa Word uni qora kvadrat qilib ko'rsatadi, shuning uchun oq rasm.
const BLANK_QR_PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAIAAACyr5FlAAABtUlEQVR4nO3SMQHAIBDAwFL/nh8DZIbhTkGGrJn54OS/HcC7zEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB8kcJHOQzEEyB2kD9eEEZYXaRY4AAAAASUVORK5CYII=",
  "base64",
);

@Injectable()
export class LettersService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private aiAgent: LetterAiAgentService,
  ) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    fs.mkdirSync(LETTERHEAD_DIR, { recursive: true });
    if (!fs.existsSync(TEMPLATE_PATH)) throw new Error("WAFA xat shabloni topilmadi: " + TEMPLATE_PATH);
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

  async getNextDocumentNumber(type: LetterType) {
    const prefix = type === LetterType.FIRST_WARNING ? "OG1" : type === LetterType.FINAL_WARNING ? "OG2" : type === LetterType.REFERENCE ? "MA" : "X";
    const last = await this.prisma.letter.findFirst({ where: { type }, orderBy: { createdAt: "desc" } });
    const n = last ? parseInt(String(last.documentNumber).replace(/\D/g, ""), 10) + 1 : 1;
    return { documentNumber: `${prefix}-${String(n).padStart(4, "0")}` };
  }

  async create(dto: CreateLetterDto, userId: string) {
    // 1-ogohlantirish shabloni faqat jismoniy shaxslar (fuqarolar) uchun mo'ljallangan
    const counterpartyType = dto.type === LetterType.FIRST_WARNING ? "CITIZEN" : (dto.counterpartyType || "ORGANIZATION");
    const number = await this.getNextDocumentNumber(dto.type);
    const body = dto.bodyText?.trim() || (await this.aiAgent.generate(dto)).text;
    const letter = await this.prisma.letter.create({
      data: {
        direction: "OUTGOING", type: dto.type, status: LetterStatus.DRAFT,
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

  // --- QR orqali ochiq (login talab qilinmaydigan) tekshiruv ---

  getPublicBaseUrl(): string {
    const configured = process.env.PUBLIC_APP_URL || process.env.CORS_ORIGIN?.split(",")[0];
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
    // Faqat elektron tasdiqlash uchun zarur bo'lgan xavfsiz maydonlar qaytariladi
    return {
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
    if (letter.type === LetterType.FIRST_WARNING) {
      // 1-ogohlantirish - kompaniya taqdim etgan qat'iy yuridik shablon, doim shu
      // shablon ishlatiladi (umumiy firma blankasidan mustaqil).
      return this.buildFirstWarningDocx(letter, approved, token);
    }
    const letterheadFile = this.findLetterheadFile();
    if (letterheadFile) {
      // Kompaniya o'z Word blankasini yuklagan - AI/inson yozgan xat matni
      // shu blank ichidagi teglar ({raqam}, {sana}, {kimga}, {matn} va h.k.) o'rniga joylashadi.
      return await this.buildDocxFromTemplate(letterheadFile, letter, approved, token);
    }
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
      doc.render({
        raqam: letter.documentNumber ?? "",
        sana: letter.documentDate ? new Date(letter.documentDate).toLocaleDateString("uz-UZ") : "",
        kimga: letter.counterpartyName ?? "",
        manzil: letter.counterpartyAddress ?? "",
        telefon: letter.phoneNumber ?? "",
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
