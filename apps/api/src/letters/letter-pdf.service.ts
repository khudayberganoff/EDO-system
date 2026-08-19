import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import PizZip from "pizzip";
import PDFDocument from "pdfkit";

const FONT_DIR = path.resolve(__dirname, "..", "..", "assets", "fonts");
const FONT_REGULAR = path.join(FONT_DIR, "DejaVuSerif.ttf");
const FONT_BOLD = path.join(FONT_DIR, "DejaVuSerif-Bold.ttf");

/**
 * Word shablonidan xatning HAQIQIY matnini ajratib oladi va PDF hosil qiladi.
 *
 * Nima uchun kerak: 1-ogohlantirish xatining matni kodda emas, Word shablonida
 * saqlanadi. QR orqali ochilgan sahifada va PDF nusxada aynan o'sha matn
 * ko'rinishi kerak - AI yozgan umumiy matn emas.
 */
@Injectable()
export class LetterPdfService {
  /** .docx ichidagi document.xml dan oddiy matn abzatslarini ajratadi. */
  extractParagraphs(docxBuffer: Buffer): string[] {
    const zip = new PizZip(docxBuffer);
    const xml = zip.file("word/document.xml")?.asText() ?? "";

    // Har bir <w:p> - alohida abzats. Ichidagi <w:t> teglari matn bo'laklari.
    const paragraphs: string[] = [];
    for (const pMatch of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
      const block = pMatch[0];
      let text = "";
      for (const tMatch of block.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) {
        text += tMatch[1];
      }
      // <w:tab/> va <w:br/> ni bo'shliqqa aylantiramiz
      if (/<w:tab\/>/.test(block) && text) text = text.replace(/^/, "");
      const clean = this.decodeXmlEntities(text).replace(/\s+/g, " ").trim();
      if (clean) paragraphs.push(clean);
    }
    return paragraphs;
  }

  private decodeXmlEntities(s: string): string {
    return s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  /**
   * Tayyor (teglari to'ldirilgan) .docx dan matnni olib, PDF hosil qiladi.
   * QR kod rasmi ham qo'shiladi (agar berilgan bo'lsa).
   */
  async docxToPdf(docxBuffer: Buffer, options?: { qrPng?: Buffer }): Promise<Buffer> {
    const paragraphs = this.extractParagraphs(docxBuffer);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 56, left: 64, right: 64 } });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.registerFont("serif", FONT_REGULAR);
      doc.registerFont("serif-bold", FONT_BOLD);

      // Kompaniya sarlavhasi
      doc.font("serif-bold").fontSize(13).text("«WAFA LEASING» MCHJ", { align: "center" });
      doc.font("serif").fontSize(9).fillColor("#555")
        .text("Toshkent sh., Chilonzor t., 2-Charx Kamolon MFY, Bunyodkor ko'chasi, 2-uy", { align: "center" })
        .text("INN: 311886363, MFO 01041, \"Asia Alliance Bank\" ATB", { align: "center" });
      doc.moveDown(1.2).fillColor("#000");

      for (const p of paragraphs) {
        // Sarlavhaga o'xshash qisqa, katta harfli qatorlarni markazlashtiramiz
        const isHeading = p.length < 60 && p === p.toUpperCase() && /[A-ZА-ЯЎҚҒҲ]/.test(p);
        if (isHeading) {
          doc.moveDown(0.6).font("serif-bold").fontSize(12).text(p, { align: "center" }).moveDown(0.4);
        } else {
          doc.font("serif").fontSize(10.5).text(p, { align: "justify", lineGap: 2 }).moveDown(0.35);
        }
      }

      if (options?.qrPng) {
        doc.moveDown(1);
        const y = doc.y;
        doc.image(options.qrPng, doc.page.width / 2 - 40, y, { width: 80, height: 80 });
        doc.y = y + 88;
        doc.font("serif").fontSize(8).fillColor("#666")
          .text("Hujjat haqiqiyligini tekshirish uchun QR kodni skanerlang", { align: "center" });
      }

      doc.end();
    });
  }
}
