import { Injectable, Logger, InternalServerErrorException } from "@nestjs/common";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { promisify } from "util";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PizZip = require("pizzip");

const execFileAsync = promisify(execFile);

/**
 * To'ldirilgan Word shablonini AYNAN o'z ko'rinishida PDF ga aylantiradi
 * (LibreOffice orqali). Shu sababli PDF va DOCX bir xil chiqadi - jadvallar,
 * logotip, shriftlar va joylashuv saqlanadi.
 */
@Injectable()
export class LetterPdfService {
  private readonly logger = new Logger(LetterPdfService.name);

  /** LibreOffice ishga tushirish buyrug'i (turli tizimlarda nomi har xil). */
  private resolveSofficeBinary(): string {
    const absolute = ["/usr/bin/soffice", "/usr/bin/libreoffice"];
    for (const c of absolute) {
      if (fs.existsSync(c)) return c;
    }
    return "soffice";
  }

  /**
   * DOCX buferini PDF buferiga aylantiradi.
   * Har bir konversiya alohida vaqtinchalik papkada bajariladi, shuning uchun
   * bir vaqtda kelgan so'rovlar bir-biriga xalaqit bermaydi.
   */
  async docxToPdf(docxBuffer: Buffer): Promise<Buffer> {
    const workDir = path.join(os.tmpdir(), `edo-pdf-${randomUUID()}`);
    fs.mkdirSync(workDir, { recursive: true });
    const docxPath = path.join(workDir, "letter.docx");
    const pdfPath = path.join(workDir, "letter.pdf");

    try {
      fs.writeFileSync(docxPath, docxBuffer);

      await execFileAsync(
        this.resolveSofficeBinary(),
        [
          "--headless",
          "--norestore",
          `-env:UserInstallation=file://${path.join(workDir, "lo-profile")}`,
          "--convert-to",
          "pdf:writer_pdf_Export",
          "--outdir",
          workDir,
          docxPath,
        ],
        { timeout: 90_000 },
      );

      if (!fs.existsSync(pdfPath)) {
        throw new Error("LibreOffice PDF fayl yaratmadi");
      }
      return fs.readFileSync(pdfPath);
    } catch (err: any) {
      this.logger.error(`PDF konversiyasi muvaffaqiyatsiz: ${err?.message ?? err}`);
      throw new InternalServerErrorException(
        "PDF yaratib bo'lmadi. Iltimos, keyinroq qayta urinib ko'ring.",
      );
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }

  /**
   * .docx ichidagi matn abzatslarini ajratadi (QR sahifasida xat mazmunini
   * fayl yuklamasdan o'qish uchun).
   */
  extractParagraphs(docxBuffer: Buffer): string[] {
    const zip = new PizZip(docxBuffer);
    const xml = zip.file("word/document.xml")?.asText() ?? "";

    const paragraphs: string[] = [];
    for (const pMatch of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
      let text = "";
      for (const tMatch of pMatch[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) {
        text += tMatch[1];
      }
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
}
