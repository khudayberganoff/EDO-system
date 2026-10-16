/**
 * Tizimdagi foydalanuvchi rollari.
 * Yangi rol qo'shish kerak bo'lsa — shu yerga qo'shiladi,
 * Prisma schema'dagi Role enum bilan sinxron tutilishi shart.
 */
export declare enum UserRole {
    ADMIN = "ADMIN",
    MANAGER = "MANAGER",
    EMPLOYEE = "EMPLOYEE",
    AUDITOR = "AUDITOR",
    /** Kuzatuvchi: ikkala korxonaning hamma hujjatini ko'radi, vazifa kiritadi, tekshiruvdagi vazifalarni 1-5 baholaydi */
    OBSERVER = "OBSERVER"
}
/**
 * Hujjatning umumiy hayot sikli.
 * DRAFT -> IN_REVIEW -> PENDING_SIGNATURE -> SIGNED -> ARCHIVED
 * Har qanday bosqichda REJECTED bo'lishi mumkin.
 */
export declare enum DocumentStatus {
    DRAFT = "DRAFT",
    IN_REVIEW = "IN_REVIEW",
    PENDING_SIGNATURE = "PENDING_SIGNATURE",
    SIGNED = "SIGNED",
    REJECTED = "REJECTED",
    ARCHIVED = "ARCHIVED"
}
export declare enum DocumentType {
    CONTRACT = "CONTRACT",// shartnoma
    INVOICE = "INVOICE",// hisob-faktura
    ORDER = "ORDER",// buyruq
    APPLICATION = "APPLICATION",// ariza
    OTHER = "OTHER"
}
/**
 * Workflow bosqichining holati.
 */
export declare enum WorkflowStepStatus {
    PENDING = "PENDING",
    APPROVED = "APPROVED",
    REJECTED = "REJECTED",
    SKIPPED = "SKIPPED"
}
/**
 * Workflow turi: ketma-ket (har bosqich navbat bilan) yoki parallel (bir vaqtda).
 */
export declare enum WorkflowType {
    SEQUENTIAL = "SEQUENTIAL",
    PARALLEL = "PARALLEL"
}
export declare enum SignatureProvider {
    MOCK = "MOCK",// dastlabki ishlab chiqish uchun soxta provider
    EIMZO = "EIMZO"
}
export declare enum SignatureStatus {
    PENDING = "PENDING",
    SIGNED = "SIGNED",
    FAILED = "FAILED"
}
export declare enum AuditAction {
    CREATE = "CREATE",
    UPDATE = "UPDATE",
    STATUS_CHANGE = "STATUS_CHANGE",
    SIGN = "SIGN",
    DOWNLOAD = "DOWNLOAD",
    DELETE = "DELETE",
    LOGIN = "LOGIN"
}
/**
 * Xatlar (kiruvchi/chiquvchi) bo'limi uchun.
 */
export declare enum LetterDirection {
    INCOMING = "INCOMING",// kiruvchi
    OUTGOING = "OUTGOING"
}
export declare enum LetterType {
    FIRST_WARNING = "FIRST_WARNING",// 1-ogohlantirish
    FINAL_WARNING = "FINAL_WARNING",// yakuniy ogohlantirish
    REFERENCE = "REFERENCE",// ma'lumotnoma
    LETTER = "LETTER"
}
/**
 * Rang kodlash: NEW -> to'q sariq (orange), APPROVED -> yashil, DELETED -> qora.
 */
export declare enum LetterStatus {
    DRAFT = "DRAFT",
    PENDING_APPROVAL = "PENDING_APPROVAL",
    APPROVED = "APPROVED",
    REJECTED = "REJECTED",
    ARCHIVED = "ARCHIVED",
    DELETED = "DELETED"
}
