import { diskStorage } from "multer";
import { extname } from "path";
import { v4 as uuidv4 } from "uuid";
import { BadRequestException } from "@nestjs/common";

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"];
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export const documentFileUploadOptions = {
  storage: diskStorage({
    destination: "./uploads/documents",
    filename: (_req, file, callback) => {
      const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
      callback(null, uniqueName);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req: unknown, file: Express.Multer.File, callback: Function) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      callback(new BadRequestException(`Ruxsat etilmagan fayl turi: ${ext}`), false);
      return;
    }
    callback(null, true);
  },
};
