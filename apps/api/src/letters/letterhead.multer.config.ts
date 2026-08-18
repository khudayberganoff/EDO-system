import { diskStorage } from "multer";
import { extname } from "path";
import { BadRequestException } from "@nestjs/common";

// Faqat rasm formatlari - chunki bu rasm to'g'ridan-to'g'ri DOCX hujjat
// sarlavhasiga (header) joylashtiriladi.
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png"];
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

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
      callback(new BadRequestException(`Ruxsat etilmagan fayl turi: ${ext}. Faqat JPG/PNG.`), false);
      return;
    }
    callback(null, true);
  },
};
