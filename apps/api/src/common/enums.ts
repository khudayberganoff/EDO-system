/**
 * SQLite Prisma enum'larni qo'llab-quvvatlamagani uchun (schema.prisma'da
 * bu qiymatlar String sifatida saqlanadi), ruxsat etilgan qiymatlar shu
 * yerda TypeScript enum sifatida belgilanadi va butun backend shu yerdan
 * import qiladi — oldin "@prisma/client"dan import qilingan joylarning
 * barchasi shu faylga ishora qiladi.
 *
 * MUHIM: bu yerdagi qiymatlar packages/shared-types/src/enums.ts dagi
 * qiymatlar bilan bir xil bo'lishi shart (frontend va backend mos kelishi uchun).
 */

export enum Role {
  ADMIN = "ADMIN",
  MANAGER = "MANAGER",
  EMPLOYEE = "EMPLOYEE",
  AUDITOR = "AUDITOR",
}

export enum DocumentStatus {
  DRAFT = "DRAFT",
  IN_REVIEW = "IN_REVIEW",
  PENDING_SIGNATURE = "PENDING_SIGNATURE",
  SIGNED = "SIGNED",
  REJECTED = "REJECTED",
  ARCHIVED = "ARCHIVED",
}

export enum DocumentType {
  CONTRACT = "CONTRACT",
  INVOICE = "INVOICE",
  ORDER = "ORDER",
  APPLICATION = "APPLICATION",
  OTHER = "OTHER",
}

export enum WorkflowStepStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  SKIPPED = "SKIPPED",
}

export enum WorkflowType {
  SEQUENTIAL = "SEQUENTIAL",
  PARALLEL = "PARALLEL",
}

export enum SignatureProvider {
  MOCK = "MOCK",
  EIMZO = "EIMZO",
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
  INCOMING = "INCOMING",
  OUTGOING = "OUTGOING",
}

export enum LetterType {
  FIRST_WARNING = "FIRST_WARNING",
  FINAL_WARNING = "FINAL_WARNING",
  REFERENCE = "REFERENCE",
  LETTER = "LETTER",
}

export enum LetterStatus {
  DRAFT = "DRAFT",
  PENDING_APPROVAL = "PENDING_APPROVAL",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  ARCHIVED = "ARCHIVED",
  DELETED = "DELETED",
}
