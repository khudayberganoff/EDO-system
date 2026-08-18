import { diskStorage } from "multer";
import { extname } from "path";
import { BadRequestException } from "@nestjs/common";

// Faqat .docx - chunki blank Word shablon sifatida ishlatiladi (docxtemplater orqali
// {raqam}, {sana}, {kimga}, {manzil}, {matn} kabi teglar matn bilan almashtiriladi).
// Eski .doc (binar format) dasturiy ravishda shablon sifatida ishlatib bo'lmaydi.
const ALLOWED_EXTENSIONS = [".docx"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const letterheadUploadOptions = {
  storage: diskStorage({
    destination: "./uploads/letterhead",
    filename: (_req: any, file: Express.Multer.File, callback: Function) => {
      // Doim bitta faylni ustidan yozamiz - kompaniyada bitta faol blank bo'ladi
      callback(null, `current${extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req: unknown, file: Express.Multer.File, callback: Function) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      callback(new BadRequestException(`Ruxsat etilmagan fayl turi: ${ext}. Faqat .docx (Word) formatida yuklang.`), false);
      return;
    }
    callback(null, true);
  },
};

