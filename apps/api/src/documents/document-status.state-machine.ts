import { DocumentStatus } from "../common/enums";

/**
 * Hujjat holatlari orasidagi ruxsat etilgan o'tishlar.
 * Yangi holat qo'shish kerak bo'lsa - shu jadvalni yangilang,
 * boshqa joyda status tekshiruvini qo'lda yozmang.
 *
 *   DRAFT -> IN_REVIEW -> PENDING_SIGNATURE -> SIGNED -> ARCHIVED
 *              |                |
 *              v                v
 *          REJECTED         REJECTED
 */
export const ALLOWED_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  DRAFT: [DocumentStatus.IN_REVIEW],
  IN_REVIEW: [DocumentStatus.PENDING_SIGNATURE, DocumentStatus.REJECTED],
  PENDING_SIGNATURE: [DocumentStatus.SIGNED, DocumentStatus.REJECTED],
  SIGNED: [DocumentStatus.ARCHIVED],
  REJECTED: [DocumentStatus.DRAFT],
  ARCHIVED: [],
};

/**
 * `from`/`to` parametrlari `string` qabul qilinadi, chunki Prisma'dan
 * qaytadigan `document.status` maydoni SQLite'da native enum yo'qligi
 * uchun oddiy String turida keladi. Funksiya ichida qiymat baribir
 * DocumentStatus enum'idagi ro'yxat bilan solishtiriladi - noto'g'ri
 * qiymat kelsa (masalan bazada buzilgan holat bo'lsa), false qaytaradi.
 */
export function canTransition(from: string, to: DocumentStatus | string): boolean {
  const allowed = ALLOWED_TRANSITIONS[from as DocumentStatus];
  return allowed?.includes(to as DocumentStatus) ?? false;
}
