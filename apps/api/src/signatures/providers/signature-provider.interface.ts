/**
 * Barcha imzo provayderlari shu interfeysni amalga oshiradi.
 * Hozircha MockSignatureProvider ishlatiladi (development uchun).
 * E-IMZO tayyor bo'lganda: EimzoSignatureProvider yaratiladi va
 * signatures.module.ts ichida provider almashtiriladi - boshqa hech narsa o'zgarmaydi.
 */
export interface SignResult {
  success: boolean;
  certificateSerial?: string;
  signatureHash?: string;
  errorMessage?: string;
}

export interface SignatureProviderPort {
  sign(input: { documentVersionId: string; fileUrl: string; signerId: string }): Promise<SignResult>;
}

export const SIGNATURE_PROVIDER = "SIGNATURE_PROVIDER";
