import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import { SignatureProviderPort, SignResult } from "./signature-provider.interface";

/**
 * Development uchun soxta imzo provideri.
 * Haqiqiy E-IMZO ulanmaguncha shu ishlatiladi - to'liq workflow'ni
 * (frontend, DB, audit) haqiqiy E-IMZO SDK'siz test qilish imkonini beradi.
 */
@Injectable()
export class MockSignatureProvider implements SignatureProviderPort {
  async sign(input: { documentVersionId: string; fileUrl: string; signerId: string }): Promise<SignResult> {
    const hash = createHash("sha256")
      .update(`${input.documentVersionId}:${input.signerId}:${Date.now()}`)
      .digest("hex");

    return {
      success: true,
      certificateSerial: `MOCK-${randomUUID()}`,
      signatureHash: hash,
    };
  }
}
