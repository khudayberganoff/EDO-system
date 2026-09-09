import {
  UserRole,
  DocumentStatus,
  DocumentType,
  WorkflowStepStatus,
  WorkflowType,
  SignatureProvider,
  SignatureStatus,
  AuditAction,
  LetterDirection,
  LetterType,
  LetterStatus,
} from "./enums";

export interface UserDto {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  /// Keyingi kirishda parolni majburiy almashtirish kerakmi
  mustChangePassword?: boolean;
}

export interface DocumentVersionDto {
  id: string;
  documentId: string;
  versionNumber: number;
  fileUrl: string;
  fileName: string;
  fileSizeBytes: number;
  createdById: string;
  createdAt: string;
  note?: string;
}

export interface WorkflowStepDto {
  id: string;
  workflowId: string;
  order: number;
  approverId: string;
  approverName?: string;
  status: WorkflowStepStatus;
  comment?: string;
  decidedAt?: string;
}

export interface WorkflowDto {
  id: string;
  documentId: string;
  type: WorkflowType;
  steps: WorkflowStepDto[];
  createdAt: string;
  completedAt?: string;
}

export interface SignatureDto {
  id: string;
  documentVersionId: string;
  signerId: string;
  provider: SignatureProvider;
  status: SignatureStatus;
  signedAt?: string;
  certificateSerial?: string;
  signatureHash?: string;
}

export interface DocumentDto {
  id: string;
  title: string;
  type: DocumentType;
  status: DocumentStatus;
  ownerId: string;
  contractRefId?: string; // WAFA GROUP CRM'dagi shartnoma ID'siga bog'lanish uchun
  createdAt: string;
  updatedAt: string;
  currentVersion?: DocumentVersionDto;
  workflow?: WorkflowDto;
}

export interface AuditLogDto {
  id: string;
  documentId?: string;
  userId: string;
  userName?: string;
  action: AuditAction;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface LetterDto {
  id: string;
  direction: LetterDirection;
  type: LetterType;
  status: LetterStatus;
  documentNumber: string;
  documentDate: string;
  counterpartyName: string; // kimgaligi - nomi
  counterpartyAddress?: string; // kimgaligi - adresi
  phoneNumber?: string;
  summary: string; // qisqacha mazmuni
  createdById: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
