import { Injectable } from "@nestjs/common";
import { AuditAction } from "../common/enums";
import { PrismaService } from "../prisma/prisma.service";

interface RecordAuditInput {
  userId: string;
  action: AuditAction;
  documentId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  /**
   * Har qanday muhim harakatni yozib boradi. Bu yozuvlar hech qachon
   * o'chirilmaydi yoki tahrirlanmaydi - yuridik audit talabi.
   *
   * `metadata` obyekt sifatida qabul qilinadi, lekin SQLite'da native
   * Json turi yo'qligi uchun JSON.stringify() bilan matn sifatida saqlanadi.
   */
  async record(input: RecordAuditInput) {
    return this.prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        documentId: input.documentId,
        metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
      },
    });
  }

  async findForDocument(documentId: string) {
    const logs = await this.prisma.auditLog.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { fullName: true } } },
    });

    // Saqlashda JSON.stringify qilingan metadata'ni o'qishda qayta obyektga aylantiramiz
    return logs.map((log) => ({
      ...log,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
    }));
  }
}
