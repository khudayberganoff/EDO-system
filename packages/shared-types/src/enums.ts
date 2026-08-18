/**
 * Tizimdagi foydalanuvchi rollari.
 * Yangi rol qo'shish kerak bo'lsa — shu yerga qo'shiladi,
 * Prisma schema'dagi Role enum bilan sinxron tutilishi shart.
 */
export enum UserRole {
  ADMIN = "ADMIN",
  MANAGER = "MANAGER",
  EMPLOYEE = "EMPLOYEE",
  AUDITOR = "AUDITOR",
}

/**
 * Hujjatning umumiy hayot sikli.
 * DRAFT -> IN_REVIEW -> PENDING_SIGNATURE -> SIGNED -> ARCHIVED
 * Har qanday bosqichda REJECTED bo'lishi mumkin.
 */
export enum DocumentStatus {
  DRAFT = "DRAFT",
  IN_REVIEW = "IN_REVIEW",
  PENDING_SIGNATURE = "PENDING_SIGNATURE",
  SIGNED = "SIGNED",
  REJECTED = "REJECTED",
  ARCHIVED = "ARCHIVED",
}

export enum DocumentType {
  CONTRACT = "CONTRACT", // shartnoma
  INVOICE = "INVOICE", // hisob-faktura
  ORDER = "ORDER", // buyruq
  APPLICATION = "APPLICATION", // ariza
  OTHER = "OTHER",
}

/**
 * Workflow bosqichining holati.
 */
export enum WorkflowStepStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  SKIPPED = "SKIPPED",
}

/**
 * Workflow turi: ketma-ket (har bosqich navbat bilan) yoki parallel (bir vaqtda).
 */
export enum WorkflowType {
  SEQUENTIAL = "SEQUENTIAL",
  PARALLEL = "PARALLEL",
}

export enum SignatureProvider {
  MOCK = "MOCK", // dastlabki ishlab chiqish uchun soxta provider
  EIMZO = "EIMZO", // O'zbekiston E-IMZO
}

export enum SignatureStatus {
  PENDING = "PENDING",
  SIGNED = "SIGNED",
  FAILED = "FAILED",
}

export enum AuditAction {
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  STATUS_CHANGE = "STATUS_CHANGE",
  SIGN = "SIGN",
  DOWNLOAD = "DOWNLOAD",
  DELETE = "DELETE",
  LOGIN = "LOGIN",
}

/**
 * Xatlar (kiruvchi/chiquvchi) bo'limi uchun.
 */
export enum LetterDirection {
  INCOMING = "INCOMING", // kiruvchi
  OUTGOING = "OUTGOING", // chiquvchi
}

export enum LetterType {
  WARNING = "WARNING", // ogohlantirish
  REFERENCE = "REFERENCE", // ma'lumotnoma
  LETTER = "LETTER", // xat
}

/**
 * Rang kodlash: NEW -> to'q sariq (orange), APPROVED -> yashil, DELETED -> qora.
 */
export enum LetterStatus {
  DRAFT = "DRAFT",
  PENDING_APPROVAL = "PENDING_APPROVAL",
  APPROVED = "APPROVED",
  ARCHIVED = "ARCHIVED",
  DELETED = "DELETED",
}
