import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes, createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

export type ApiScope = "hr" | "letters" | "documents";

/**
 * Tashqi tizimlar uchun API kalitlarni boshqaradi.
 *
 * Kalit faqat yaratilgan paytda bir marta ko'rsatiladi - bazada uning
 * SHA-256 xeshi saqlanadi, shuning uchun uni keyin tiklab bo'lmaydi.
 */
@Injectable()
export class ApiKeyService {
  constructor(private prisma: PrismaService) {}

  private hash(key: string): string {
    return createHash("sha256").update(key).digest("hex");
  }

  async list() {
    const keys = await this.prisma.apiKey.findMany({
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { fullName: true } } },
    });
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      // To'liq kalit ko'rsatilmaydi - faqat boshlanishi
      maskedKey: `${k.prefix}••••••••`,
      scopes: k.scopes.split(",").filter(Boolean),
      isActive: k.isActive,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
      createdBy: k.createdBy?.fullName ?? null,
    }));
  }

  /** Yangi kalit yaratadi va uni BIR MARTA to'liq holda qaytaradi. */
  async create(data: { name: string; scopes?: string[]; expiresAt?: string }, userId: string) {
    if (!data.name?.trim()) throw new BadRequestException("Kalit nomini kiriting.");

    const raw = `edo_live_${randomBytes(24).toString("hex")}`;
    const created = await this.prisma.apiKey.create({
      data: {
        name: data.name.trim(),
        prefix: raw.slice(0, 16),
        keyHash: this.hash(raw),
        scopes: (data.scopes?.length ? data.scopes : ["hr", "letters", "documents"]).join(","),
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        createdById: userId,
      },
    });

    return { id: created.id, name: created.name, key: raw, scopes: created.scopes.split(",") };
  }

  async revoke(id: string) {
    await this.prisma.apiKey.update({ where: { id }, data: { isActive: false } });
    return { revoked: true };
  }

  async remove(id: string) {
    await this.prisma.apiKey.delete({ where: { id } });
    return { deleted: true };
  }

  /** So'rovdagi kalitni tekshiradi va ruxsat etilgan bo'limlarni qaytaradi. */
  async validate(rawKey: string): Promise<{ id: string; name: string; scopes: string[] }> {
    if (!rawKey) throw new UnauthorizedException("API kalit ko'rsatilmagan (X-API-Key sarlavhasi).");

    const record = await this.prisma.apiKey.findUnique({ where: { keyHash: this.hash(rawKey) } });
    if (!record || !record.isActive) throw new UnauthorizedException("API kalit yaroqsiz yoki bekor qilingan.");
    if (record.expiresAt && record.expiresAt < new Date()) {
      throw new UnauthorizedException("API kalit muddati tugagan.");
    }

    // Oxirgi foydalanish vaqtini yangilaymiz (so'rovni kutmasdan)
    void this.prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

    return { id: record.id, name: record.name, scopes: record.scopes.split(",").filter(Boolean) };
  }
}
