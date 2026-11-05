import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { parseCall, samePhone, type ParsedCall } from "./telephony-parser";

export const RECORDINGS_DIR = path.resolve(process.cwd(), "uploads", ".private", "recordings");
export const AUDIO_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".opus": "audio/ogg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".flac": "audio/flac", ".webm": "audio/webm",
};
const LINK_TTL_MS = 15 * 60_000;
const CONFIG_KEY = "telephony";
const LAST_KEY = "telephony_last";

export interface TelephonyConfig {
  token: string;
  /** Qo'ng'iroqlar va avtomatik lidlar qaysi tashkilotga yoziladi */
  organizationId: string | null;
  /** Bazada yo'q kiruvchi raqamdan avtomatik "Yangi lead" yaratish */
  autoLead: boolean;
  /** Yozuvlar necha kun saqlanadi (0 = doimiy). Muddati o'tgan yozuv fayllari o'chiriladi, qo'ng'iroq yozuvi qoladi */
  retentionDays?: number;
}

const STATUS_UZ: Record<string, string> = { ANSWERED: "javob berildi", MISSED: "javob berilmadi", BUSY: "band", FAILED: "ulanmadi" };

@Injectable()
export class TelephonyService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private readonly logger = new Logger(TelephonyService.name);
  /** Bir raqamdan bir vaqtda kelgan hodisalar ketma-ket qayta ishlanadi (ikki marta lid yaratilmasligi uchun) */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    // Disk to'lib qolmasligi uchun muddati o'tgan yozuvlar har 6 soatda tozalanadi
    setTimeout(() => void this.cleanupRecordings(), 60_000).unref();
    this.timer = setInterval(() => void this.cleanupRecordings(), 6 * 3600_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async cleanupRecordings(): Promise<number> {
    try {
      const cfg = await this.getConfig();
      const days = cfg.retentionDays ?? 0;
      if (days <= 0) return 0;
      const old = await this.prisma.phoneCall.findMany({ where: { recordingFile: { not: null }, startedAt: { lt: new Date(Date.now() - days * 86_400_000) } }, select: { id: true, recordingFile: true } });
      for (const c of old) {
        try { fs.unlinkSync(path.join(RECORDINGS_DIR, path.basename(c.recordingFile!))); } catch { /* fayl allaqachon yo'q */ }
        await this.prisma.phoneCall.update({ where: { id: c.id }, data: { recordingFile: null, recordingMime: null, recordingSize: null } });
      }
      if (old.length) this.logger.log(`Muddati o'tgan ${old.length} ta yozuv o'chirildi (${days} kundan eski).`);
      return old.length;
    } catch (e: any) {
      this.logger.warn(`Yozuvlarni tozalashda xato: ${e.message}`);
      return 0;
    }
  }

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

  async updateConfig(input: { organizationId?: string; autoLead?: boolean; retentionDays?: number }, defaultOrgId: string) {
    const cfg = await this.getConfig(defaultOrgId);
    if (input.organizationId !== undefined) {
      const org = await this.prisma.organization.findUnique({ where: { id: input.organizationId } });
      if (!org) throw new BadRequestException("Tashkilot topilmadi.");
      cfg.organizationId = org.id;
    }
    if (input.autoLead !== undefined) cfg.autoLead = input.autoLead;
    if (input.retentionDays !== undefined) cfg.retentionDays = input.retentionDays;
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

  // ---------- Qo'ng'iroq yozuvlari ----------

  /** ATS yuklagan yozuv faylini qo'ng'iroqqa biriktiradi (qo'ng'iroq webhook orqali oldin kelgan bo'lishi kerak). */
  async attachRecording(externalId: string, file: Express.Multer.File) {
    const call = await this.prisma.phoneCall.findUnique({ where: { externalId } });
    if (!call) {
      try { fs.unlinkSync(file.path); } catch { /* */ }
      throw new NotFoundException("Bu ID bilan qo'ng'iroq topilmadi: avval qo'ng'iroq haqidagi webhook yuborilsin, so'ng yozuv.");
    }
    const old = call.recordingFile;
    await this.prisma.phoneCall.update({
      where: { id: call.id },
      data: { recordingFile: path.basename(file.path), recordingMime: AUDIO_TYPES[path.extname(file.path).toLowerCase()] ?? file.mimetype, recordingSize: file.size },
    });
    if (old && old !== path.basename(file.path)) { try { fs.unlinkSync(path.join(RECORDINGS_DIR, old)); } catch { /* */ } }
    this.logger.log(`Yozuv biriktirildi: ${externalId} (${Math.round(file.size / 1024)} KB)`);
    return { ok: true, id: call.id, size: file.size };
  }

  private signKey() { return process.env.JWT_SECRET ?? "change_me_in_production"; }
  private sign(id: string, exp: number) { return crypto.createHmac("sha256", this.signKey()).update(`${id}.${exp}`).digest("hex"); }

  /** Qisqa muddatli imzolangan havola (brauzer <audio> sarlavha yubora olmagani uchun). `/api` ga nisbatan yo'l qaytaradi. */
  signedRecordingPath(id: string) {
    const exp = Date.now() + LINK_TTL_MS;
    return `/telephony/recording/${id}?exp=${exp}&sig=${this.sign(id, exp)}`;
  }

  async openRecording(id: string, exp: string, sig: string) {
    const expNum = Number(exp);
    const good = sig && /^[0-9a-f]{64}$/.test(sig) && crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(this.sign(id, expNum), "hex"));
    if (!good || !(expNum > Date.now())) throw new ForbiddenException("Havola eskirgan. Sahifani yangilab qayta urinib ko'ring.");
    const call = await this.prisma.phoneCall.findUnique({ where: { id }, select: { recordingFile: true, recordingMime: true, phone: true, startedAt: true } });
    if (!call?.recordingFile) throw new NotFoundException("Yozuv topilmadi.");
    const full = path.join(RECORDINGS_DIR, path.basename(call.recordingFile));
    if (!fs.existsSync(full)) throw new NotFoundException("Yozuv fayli topilmadi.");
    const ext = path.extname(full);
    const stamp = new Date(call.startedAt.getTime() + 5 * 3600_000).toISOString().slice(0, 16).replace(/[-:T]/g, ""); // Toshkent vaqti
    return { full, mime: call.recordingMime ?? AUDIO_TYPES[ext.toLowerCase()] ?? "application/octet-stream", name: `qongiroq-${call.phone.replace(/\D/g, "")}-${stamp}${ext}` };
  }
}
