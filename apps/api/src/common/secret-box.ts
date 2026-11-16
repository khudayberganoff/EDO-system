import * as crypto from "crypto";

/**
 * Maxfiy qiymatlarni (tokenlar, App Secret) bazada shifrlab saqlash: AES-256-GCM.
 * Kalit JWT_SECRET va `purpose` dan hosil qilinadi - har bir maqsad uchun alohida kalit.
 * JWT_SECRET o'zgarsa, eski qiymatlar o'qilmaydi (qayta kiritish/ulash kerak bo'ladi).
 */
function key(purpose: string) {
  return crypto.createHash("sha256").update(`${process.env.JWT_SECRET ?? "edo"}:${purpose}`).digest();
}

export function encryptSecret(plain: string, purpose: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(purpose), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(stored: string | null | undefined, purpose: string): string | null {
  if (!stored) return null;
  try {
    const [v, iv, tag, data] = stored.split(":");
    if (v !== "v1") return null;
    const d = crypto.createDecipheriv("aes-256-gcm", key(purpose), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Ikki satrni vaqt bo'yicha xavfsiz solishtirish */
export function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
