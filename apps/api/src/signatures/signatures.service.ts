import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, DocumentStatus } from "../common/enums";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { SIGNATURE_PROVIDER, SignatureProviderPort } from "./providers/signature-provider.interface";

@Injectable()
export class SignaturesService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    @Inject(SIGNATURE_PROVIDER) private signatureProvider: SignatureProviderPort,
  ) {}

  async signLatestVersion(documentId: string, signerId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });

    if (!document) {
      throw new NotFoundException("Hujjat topilmadi.");
    }
    if (document.status !== DocumentStatus.PENDING_SIGNATURE) {
      throw new BadRequestException(
        "Hujjat imzolash uchun tayyor emas (avval workflow to'liq tasdiqlanishi kerak).",
      );
    }
    const latestVersion = document.versions[0];
    if (!latestVersion) {
      throw new BadRequestException("Hujjatda fayl versiyasi topilmadi.");
    }

    const pendingSignature = await this.prisma.signature.create({
      data: {
        documentVersionId: latestVersion.id,
        signerId,
        provider: "MOCK",
        status: "PENDING",
      },
    });

    const result = await this.signatureProvider.sign({
      documentVersionId: latestVersion.id,
      fileUrl: latestVersion.fileUrl,
      signerId,
    });

    const updatedSignature = await this.prisma.signature.update({
      where: { id: pendingSignature.id },
      data: result.success
        ? {
            status: "SIGNED",
            signedAt: new Date(),
            certificateSerial: result.certificateSerial,
            signatureHash: result.signatureHash,
          }
        : { status: "FAILED" },
    });

    await this.auditLog.record({
      userId: signerId,
      documentId,
      action: AuditAction.SIGN,
      metadata: { signatureId: updatedSignature.id, success: result.success },
    });

    if (!result.success) {
      throw new BadRequestException(result.errorMessage ?? "Imzolashda xatolik yuz berdi.");
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.SIGNED },
    });

    return updatedSignature;
  }
}
