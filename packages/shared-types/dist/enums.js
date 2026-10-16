"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LetterStatus = exports.LetterType = exports.LetterDirection = exports.AuditAction = exports.SignatureStatus = exports.SignatureProvider = exports.WorkflowType = exports.WorkflowStepStatus = exports.DocumentType = exports.DocumentStatus = exports.UserRole = void 0;
/**
 * Tizimdagi foydalanuvchi rollari.
 * Yangi rol qo'shish kerak bo'lsa — shu yerga qo'shiladi,
 * Prisma schema'dagi Role enum bilan sinxron tutilishi shart.
 */
var UserRole;
(function (UserRole) {
    UserRole["ADMIN"] = "ADMIN";
    UserRole["MANAGER"] = "MANAGER";
    UserRole["EMPLOYEE"] = "EMPLOYEE";
    UserRole["AUDITOR"] = "AUDITOR";
    /** Kuzatuvchi: ikkala korxonaning hamma hujjatini ko'radi, vazifa kiritadi, tekshiruvdagi vazifalarni 1-5 baholaydi */
    UserRole["OBSERVER"] = "OBSERVER";
})(UserRole || (exports.UserRole = UserRole = {}));
/**
 * Hujjatning umumiy hayot sikli.
 * DRAFT -> IN_REVIEW -> PENDING_SIGNATURE -> SIGNED -> ARCHIVED
 * Har qanday bosqichda REJECTED bo'lishi mumkin.
 */
var DocumentStatus;
(function (DocumentStatus) {
    DocumentStatus["DRAFT"] = "DRAFT";
    DocumentStatus["IN_REVIEW"] = "IN_REVIEW";
    DocumentStatus["PENDING_SIGNATURE"] = "PENDING_SIGNATURE";
    DocumentStatus["SIGNED"] = "SIGNED";
    DocumentStatus["REJECTED"] = "REJECTED";
    DocumentStatus["ARCHIVED"] = "ARCHIVED";
})(DocumentStatus || (exports.DocumentStatus = DocumentStatus = {}));
var DocumentType;
(function (DocumentType) {
    DocumentType["CONTRACT"] = "CONTRACT";
    DocumentType["INVOICE"] = "INVOICE";
    DocumentType["ORDER"] = "ORDER";
    DocumentType["APPLICATION"] = "APPLICATION";
    DocumentType["OTHER"] = "OTHER";
})(DocumentType || (exports.DocumentType = DocumentType = {}));
/**
 * Workflow bosqichining holati.
 */
var WorkflowStepStatus;
(function (WorkflowStepStatus) {
    WorkflowStepStatus["PENDING"] = "PENDING";
    WorkflowStepStatus["APPROVED"] = "APPROVED";
    WorkflowStepStatus["REJECTED"] = "REJECTED";
    WorkflowStepStatus["SKIPPED"] = "SKIPPED";
})(WorkflowStepStatus || (exports.WorkflowStepStatus = WorkflowStepStatus = {}));
/**
 * Workflow turi: ketma-ket (har bosqich navbat bilan) yoki parallel (bir vaqtda).
 */
var WorkflowType;
(function (WorkflowType) {
    WorkflowType["SEQUENTIAL"] = "SEQUENTIAL";
    WorkflowType["PARALLEL"] = "PARALLEL";
})(WorkflowType || (exports.WorkflowType = WorkflowType = {}));
var SignatureProvider;
(function (SignatureProvider) {
    SignatureProvider["MOCK"] = "MOCK";
    SignatureProvider["EIMZO"] = "EIMZO";
})(SignatureProvider || (exports.SignatureProvider = SignatureProvider = {}));
var SignatureStatus;
(function (SignatureStatus) {
    SignatureStatus["PENDING"] = "PENDING";
    SignatureStatus["SIGNED"] = "SIGNED";
    SignatureStatus["FAILED"] = "FAILED";
})(SignatureStatus || (exports.SignatureStatus = SignatureStatus = {}));
var AuditAction;
(function (AuditAction) {
    AuditAction["CREATE"] = "CREATE";
    AuditAction["UPDATE"] = "UPDATE";
    AuditAction["STATUS_CHANGE"] = "STATUS_CHANGE";
    AuditAction["SIGN"] = "SIGN";
    AuditAction["DOWNLOAD"] = "DOWNLOAD";
    AuditAction["DELETE"] = "DELETE";
    AuditAction["LOGIN"] = "LOGIN";
})(AuditAction || (exports.AuditAction = AuditAction = {}));
/**
 * Xatlar (kiruvchi/chiquvchi) bo'limi uchun.
 */
var LetterDirection;
(function (LetterDirection) {
    LetterDirection["INCOMING"] = "INCOMING";
    LetterDirection["OUTGOING"] = "OUTGOING";
})(LetterDirection || (exports.LetterDirection = LetterDirection = {}));
var LetterType;
(function (LetterType) {
    LetterType["FIRST_WARNING"] = "FIRST_WARNING";
    LetterType["FINAL_WARNING"] = "FINAL_WARNING";
    LetterType["REFERENCE"] = "REFERENCE";
    LetterType["LETTER"] = "LETTER";
})(LetterType || (exports.LetterType = LetterType = {}));
/**
 * Rang kodlash: NEW -> to'q sariq (orange), APPROVED -> yashil, DELETED -> qora.
 */
var LetterStatus;
(function (LetterStatus) {
    LetterStatus["DRAFT"] = "DRAFT";
    LetterStatus["PENDING_APPROVAL"] = "PENDING_APPROVAL";
    LetterStatus["APPROVED"] = "APPROVED";
    LetterStatus["REJECTED"] = "REJECTED";
    LetterStatus["ARCHIVED"] = "ARCHIVED";
    LetterStatus["DELETED"] = "DELETED";
})(LetterStatus || (exports.LetterStatus = LetterStatus = {}));
