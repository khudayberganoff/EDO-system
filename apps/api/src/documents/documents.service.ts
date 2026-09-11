import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditAction, DocumentStatus } from "../common/enums";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { CreateWorkflowDto } from "./dto/create-workflow.dto";
import { canTransition } from "./document-status.state-machine";

interface UploadedFileInfo {
  fileUrl: string;
  fileName: string;
  fileSizeBytes: number;
}

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async create(dto: CreateDocumentDto, ownerId: string, organizationId: string) {
    const document = await this.prisma.document.create({
      data: {
        title: dto.title,
        type: dto.type,
        contractRefId: dto.contractRefId,
        ownerId,
        organizationId,
        status: DocumentStatus.DRAFT,
      },
    });

    await this.auditLog.record({
      userId: ownerId,
      documentId: document.id,
      action: AuditAction.CREATE,
    });

    return document;
  }

  async findAll(params: { status?: DocumentStatus; contractRefId?: string; page: number; pageSize: number; organizationId: string }) {
    const where: Prisma.DocumentWhereInput = { organizationId: params.organizationId };
    if (params.status) where.status = params.status;
    if (params.contractRefId) where.contractRefId = params.contractRefId;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: { updatedAt: "desc" },
        include: {
          owner: { select: { fullName: true } },
          versions: { orderBy: { versionNumber: "desc" }, take: 1 },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  /** `organizationId` berilsa - boshqa tashkilotga tegishli hujjat "topilmadi" deb qaytariladi. */
  async findOne(id: string, organizationId?: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
        versions: { orderBy: { versionNumber: "desc" } },
        workflow: {
          include: {
            steps: {
              orderBy: { order: "asc" },
              include: { approver: { select: { id: true, fullName: true } } },
            },
          },
        },
      },
    });

    if (!document || (organizationId && document.organizationId !== organizationId)) {
      throw new NotFoundException("Hujjat topilmadi.");
    }
    return document;
  }

  async addVersion(documentId: string, file: UploadedFileInfo, userId: string, note: string | undefined, organizationId: string) {
    const document = await this.findOne(documentId, organizationId);

    if (document.status === DocumentStatus.SIGNED || document.status === DocumentStatus.ARCHIVED) {
      throw new BadRequestException("Imzolangan yoki arxivlangan hujjatga yangi versiya qo'shib bo'lmaydi.");
    }

    const lastVersion = document.versions[0];
    const nextVersionNumber = lastVersion ? lastVersion.versionNumber + 1 : 1;

    const version = await this.prisma.documentVersion.create({
      data: {
        documentId,
        versionNumber: nextVersionNumber,
        fileUrl: file.fileUrl,
        fileName: file.fileName,
        fileSizeBytes: file.fileSizeBytes,
        note,
        createdById: userId,
      },
    });

    await this.auditLog.record({
      userId,
      documentId,
      action: AuditAction.UPDATE,
      metadata: { versionNumber: nextVersionNumber },
    });

    return version;
  }

  async createWorkflow(documentId: string, dto: CreateWorkflowDto, userId: string, organizationId: string) {
    const document = await this.findOne(documentId, organizationId);
    if (document.workflow) {
      throw new BadRequestException("Bu hujjat uchun workflow allaqachon yaratilgan.");
    }

    const workflow = await this.prisma.workflow.create({
      data: {
        documentId,
        type: dto.type,
        steps: {
          create: dto.approverIds.map((approverId, index) => ({
            order: index + 1,
            approverId,
          })),
        },
      },
      include: { steps: true },
    });

    await this.transitionStatus(documentId, DocumentStatus.IN_REVIEW, userId);

    return workflow;
  }

  /**
   * Bitta workflow bosqichini tasdiqlash yoki rad etish.
   * SEQUENTIAL turida faqat navbatdagi bosqich tasdiqlanishi mumkin.
   * Barcha bosqichlar APPROVED bo'lsa - hujjat avtomatik PENDING_SIGNATURE ga o'tadi.
   */
  async decideStep(stepId: string, approve: boolean, userId: string, comment?: string) {
    const step = await this.prisma.workflowStep.findUnique({
      where: { id: stepId },
      include: { workflow: { include: { steps: { orderBy: { order: "asc" } }, document: true } } },
    });

    if (!step) {
      throw new NotFoundException("Tasdiqlash bosqichi topilmadi.");
    }
    if (step.approverId !== userId) {
      throw new ForbiddenException("Bu bosqichni faqat tayinlangan tasdiqlovchi hal qilishi mumkin.");
    }
    if (step.status !== "PENDING") {
      throw new BadRequestException("Bu bosqich allaqachon hal qilingan.");
    }

    if (step.workflow.type === "SEQUENTIAL") {
      const isNext = step.workflow.steps
        .filter((s) => s.status === "PENDING")
        .sort((a, b) => a.order - b.order)[0]?.id === step.id;
      if (!isNext) {
        throw new BadRequestException("Navbatdagi bosqichgacha tasdiqlash mumkin emas (ketma-ket workflow).");
      }
    }

    await this.prisma.workflowStep.update({
      where: { id: stepId },
      data: {
        status: approve ? "APPROVED" : "REJECTED",
        comment,
        decidedAt: new Date(),
      },
    });

    await this.auditLog.record({
      userId,
      documentId: step.workflow.documentId,
      action: AuditAction.STATUS_CHANGE,
      metadata: { stepId, decision: approve ? "APPROVED" : "REJECTED" },
    });

    if (!approve) {
      await this.transitionStatus(step.workflow.documentId, DocumentStatus.REJECTED, userId);
      return;
    }

    const allSteps = await this.prisma.workflowStep.findMany({ where: { workflowId: step.workflowId } });
    const allApproved = allSteps.every((s) => s.status === "APPROVED");

    if (allApproved) {
      await this.prisma.workflow.update({
        where: { id: step.workflowId },
        data: { completedAt: new Date() },
      });
      await this.transitionStatus(step.workflow.documentId, DocumentStatus.PENDING_SIGNATURE, userId);
    }
  }

  async transitionStatus(documentId: string, to: DocumentStatus, userId: string, organizationId?: string) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document || (organizationId && document.organizationId !== organizationId)) {
      throw new NotFoundException("Hujjat topilmadi.");
    }

    if (!canTransition(document.status, to)) {
      throw new BadRequestException(
        `"${document.status}" holatidan "${to}" holatiga o'tish mumkin emas.`,
      );
    }

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: { status: to },
    });

    await this.auditLog.record({
      userId,
      documentId,
      action: AuditAction.STATUS_CHANGE,
      metadata: { from: document.status, to },
    });

    return updated;
  }
}
