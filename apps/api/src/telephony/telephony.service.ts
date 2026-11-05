import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { parseCall, samePhone, type ParsedCall } from "./telephony-parser";

const CONFIG_KEY = "telephony";
const LAST_KEY = "telephony_last";

export interface TelephonyConfig {
  token: string;
  /** Qo'ng'iroqlar va avtomatik lidlar qaysi tashkilotga yoziladi */
  organizationId: string | null;
  /** Bazada yo'q kiruvchi raqamdan avtomatik "Yangi lead" yaratish */
  autoLead: boolean;
}

const STATUS_UZ: Record<string, string> = { ANSWERED: "javob berildi", MISSED: "javob berilmadi", BUSY: "band", FAILED: "ulanmadi" };

@Injectable()
export class TelephonyService {
  private readonly logger = new Logger(TelephonyService.name);
  /** Bir raqamdan bir vaqtda kelgan hodisalar ketma-ket qayta ishlanadi (ikki marta lid yaratilmasligi uchun) */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private prisma: PrismaService) {}

  async getConfig(defaultOrgId?: string): Promise<TelephonyConfig> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: CONFIG_KEY } });
    if (row) {
      try { return JSON.parse(row.value) as TelephonyConfig; } catch { /* qayta yaratiladi */ }
    }
    const cfg: TelephonyConfig = { token: crypto.randomBytes(24).toString("base64url"), organizationId: defaultOrgId ?? null, autoLead: true };
    await this.save(cfg);
    return cfg;
  }

  private async save(cfg: TelephonyConfig) {
    const value = JSON.stringify(cfg);
    await this.prisma.appSetting.upsert({ where: { key: CONFIG_KEY }, create: { key: CONFIG_KEY, value }, update: { value } });
  }

  async updateConfig(input: { organizationId?: string; autoLead?: boolean }, defaultOrgId: string) {
    const cfg = await this.getConfig(defaultOrgId);
    if (input.organizationId !== undefined) {
      const org = await this.prisma.organization.findUnique({ where: { id: input.organizationId } });
      if (!org) throw new BadRequestException("Tashkilot topilmadi.");
      cfg.organizationId = org.id;
    }
    if (input.autoLead !== undefined) cfg.autoLead = input.autoLead;
    await this.save(cfg);
    return cfg;
  }

  async regenerateToken(defaultOrgId: string) {
    const cfg = await this.getConfig(defaultOrgId);
    cfg.token = crypto.randomBytes(24).toString("base64url");
    await this.save(cfg);
    return cfg;
  }

  async lastPayload() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: LAST_KEY } });
    try { return row ? JSON.parse(row.value) : null; } catch { return null; }
  }

  private async remember(info: { ok: boolean; error?: string; raw: unknown }) {
    const raw = JSON.stringify(info.raw ?? null);
    const value = JSON.stringify({ at: new Date().toISOString(), ok: info.ok, error: info.error ?? null, raw: raw.length > 8000 ? raw.slice(0, 8000) + "…" : JSON.parse(raw) });
    await this.prisma.appSetting.upsert({ where: { key: LAST_KEY }, create: { key: LAST_KEY, value }, update: { value } }).catch(() => undefined);
  }

  verifyToken(provided: string | undefined, cfg: TelephonyConfig): boolean {
    if (!provided) return false;
    const a = crypto.createHash("sha256").update(provided).digest();
    const b = crypto.createHash("sha256").update(cfg.token).digest();
    return crypto.timingSafeEqual(a, b);
  }

  /** ATS hodisasini qabul qiladi: qo'ng'iroqni saqlaydi/yangilaydi, kerak bo'lsa lid yaratadi. */
  async ingest(body: Record<string, any>, token: string | undefined) {
    const cfg = await this.getConfig();
    if (!this.verifyToken(token, cfg)) throw new ForbiddenException();

    const run = async () => {
      const parsed = parseCall(body);
      if (!parsed) {
        await this.remember({ ok: false, error: "Telefon raqami topilmadi (maydon nomlarini tekshiring)", raw: body });
        throw new BadRequestException("Telefon raqami topilmadi.");
      }
      const result = await this.store(parsed, body, cfg);
      await this.remember({ ok: true, raw: body });
      return result;
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async store(p: ParsedCall, raw: Record<string, any>, cfg: TelephonyConfig) {
    const orgId = cfg.organizationId ?? (await this.prisma.organization.findFirst({ orderBy: { name: "asc" }, select: { id: true } }))?.id;
    if (!orgId) throw new BadRequestException("Tashkilot sozlanmagan.");

    const existing = await this.prisma.phoneCall.findUnique({ where: { externalId: p.externalId } });
    let leadId = existing?.leadId ?? null;

    if (!leadId) {
      const leads = await this.prisma.callLead.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true } });
      leadId = leads.find((l) => samePhone(l.phone, p.phone))?.id ?? null;
    }
    if (!leadId && p.direction === "IN" && cfg.autoLead) {
      const lead = await this.prisma.callLead.create({
        data: {
          organizationId: orgId,
          name: p.phone,
          phone: p.phone,
          source: "IP-telefoniya",
          note: `Kiruvchi qo'ng'iroq (${STATUS_UZ[p.status]}), ${p.startedAt.toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent", dateStyle: "short", timeStyle: "short" })}`,
          stage: "NEW",
        },
      });
      leadId = lead.id;
    }

    const data = {
      organizationId: orgId,
      direction: p.direction,
      status: p.status,
      phone: p.phone,
      ourNumber: p.ourNumber,
      extension: p.extension,
      startedAt: p.startedAt,
      durationSec: p.durationSec,
      recordingUrl: p.recordingUrl,
      leadId,
      raw: JSON.stringify(raw).length > 20000 ? { truncated: true } : raw,
    };
    // Keyingi hodisa (masalan qo'ng'iroq tugadi) avvalgi ma'lumotni to'ldiradi: bo'sh qiymat mavjudini o'chirmaydi
    const saved = existing
      ? await this.prisma.phoneCall.update({
          where: { externalId: p.externalId },
          data: {
            ...data,
            ourNumber: data.ourNumber ?? existing.ourNumber,
            extension: data.extension ?? existing.extension,
            recordingUrl: data.recordingUrl ?? existing.recordingUrl,
            durationSec: Math.max(data.durationSec, existing.durationSec),
            // Javob berilgan qo'ng'iroq keyingi "tugadi" hodisasida "javobsiz"ga aylanib qolmasin
            status: existing.status === "ANSWERED" ? "ANSWERED" : data.status,
          },
        })
      : await this.prisma.phoneCall.create({ data: { externalId: p.externalId, ...data } });
    this.logger.log(`Qo'ng'iroq ${existing ? "yangilandi" : "saqlandi"}: ${p.direction} ${p.phone} ${p.status}`);
    return { ok: true, id: saved.id, leadId };
  }
}
