import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { TelegramService } from "../telegram/telegram.service";
import { escapeHtml } from "../telegram/telegram-task-parser";
import { decryptSecret, encryptSecret, safeEqual } from "../common/secret-box";
import { samePhone } from "../telephony/telephony-parser";
import { DEFAULT_SCOPES, GraphError, dialogBase, graph, graphAll, graphVersion } from "./meta-graph";
import { META_TARGETS, formatTashkent, mapMetaLead, type MetaLeadData, type MetaQuestion } from "./meta-lead-mapper";

const CONFIG_KEY = "meta_app";
const TOKEN_PURPOSE = "meta-token";
const SECRET_PURPOSE = "meta-app-secret";
/** Lid tushishi mumkin bo'lgan bosqichlar (sana talab qiladigan "Uchrashuv" va "Qayta bog'lanish"dan tashqari) */
export const META_STAGES = ["NEW", "INFO_GIVEN", "VISITED", "CONTRACT", "UNQUALIFIED"];
const CLOSED_STAGES = ["CONTRACT", "UNQUALIFIED"];
/** Qayta urinishlar oralig'i (oshib boruvchi): 5 s, 20 s, 1 daq, 3 daq; 5-urinishdan keyin - xato */
const BACKOFF_MS = [5_000, 20_000, 60_000, 180_000];
const MAX_ATTEMPTS = 5;
const STATE_TTL_MS = 10 * 60_000;
const LEAD_FIELDS = "id,created_time,field_data,form_id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,platform,is_organic";
const LEAD_FIELDS_BASIC = "id,created_time,field_data,form_id,ad_id,platform,is_organic";

interface MetaAppConfig {
  appId?: string;
  appSecretEnc?: string;
  /** Facebook Login for Business konfiguratsiyasi ID'si (berilsa, ruxsatlar shundan olinadi) */
  loginConfigId?: string;
  /** Maxfiylik siyosati sahifasida ko'rsatiladigan aloqa emaili */
  contactEmail?: string;
  verifyToken: string;
  /** Shu raqamli ochiq lid bo'lsa, yangisi yaratilmay, mavjudiga izoh qo'shiladi */
  dedupeByPhone: boolean;
  /** Yangi lid haqida Telegram orqali xabar */
  notifyTelegram: boolean;
  /** Call saytining ommaviy manzili (Telegram xabaridagi havola uchun) */
  publicBase?: string;
}

type Actor = { id: string; organizationId: string };

/**
 * Facebook / Instagram Lead Ads integratsiyasi: OAuth orqali ulash, sahifani leadgen webhook'iga obuna qilish,
 * formalar va maydonlar moslamasi, webhook xabarlarini navbat orqali qayta ishlab Call-markazga lid yaratish.
 */
@Injectable()
export class MetaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("MetaLeadAds");
  private cfgCache: { at: number; cfg: MetaAppConfig } | null = null;
  private states = new Map<string, { userId: string; redirectUri: string; returnUrl: string; exp: number }>();
  private timer: NodeJS.Timeout | null = null;
  private draining = false;
  private drainAgain = false;

  constructor(private prisma: PrismaService, private telegram: TelegramService) {}

  onModuleInit() {
    // Navbatdagi (qayta urinish kutayotgan yoki server o'chiq paytda qolib ketgan) xabarlar har 15 soniyada ko'riladi
    this.timer = setInterval(() => void this.drain(), 15_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  // ==================== Sozlama ====================

  private async config(): Promise<MetaAppConfig> {
    if (this.cfgCache && Date.now() - this.cfgCache.at < 30_000) return this.cfgCache.cfg;
    const row = await this.prisma.appSetting.findUnique({ where: { key: CONFIG_KEY } });
    let cfg: MetaAppConfig | null = null;
    if (row) { try { cfg = JSON.parse(row.value); } catch { cfg = null; } }
    if (!cfg?.verifyToken) {
      // Birinchi marta: Verify Token yaratiladi, standart sozlamalar yoqiladi
      cfg = { dedupeByPhone: true, notifyTelegram: true, ...(cfg ?? {}), verifyToken: crypto.randomBytes(18).toString("base64url") };
      await this.saveConfig(cfg);
    }
    this.cfgCache = { at: Date.now(), cfg };
    return cfg;
  }

  private async saveConfig(cfg: MetaAppConfig) {
    const value = JSON.stringify(cfg);
    await this.prisma.appSetting.upsert({ where: { key: CONFIG_KEY }, create: { key: CONFIG_KEY, value }, update: { value } });
    this.cfgCache = { at: Date.now(), cfg };
  }

  /** Muhit o'zgaruvchilari (META_*) saytdan kiritilganidan ustun turadi. */
  private async app() {
    const cfg = await this.config();
    const envId = process.env.META_APP_ID?.trim();
    const envSecret = process.env.META_APP_SECRET?.trim();
    const envVerify = process.env.META_VERIFY_TOKEN?.trim();
    return {
      cfg,
      appId: envId || cfg.appId || null,
      appIdSource: envId ? "env" : cfg.appId ? "db" : null,
      appSecret: envSecret || decryptSecret(cfg.appSecretEnc, SECRET_PURPOSE),
      secretSource: envSecret ? "env" : cfg.appSecretEnc ? "db" : null,
      verifyToken: envVerify || cfg.verifyToken,
      verifySource: envVerify ? "env" : "db",
    };
  }

  async saveApp(dto: { appId?: string; appSecret?: string; loginConfigId?: string; contactEmail?: string; dedupeByPhone?: boolean; notifyTelegram?: boolean }) {
    const cfg = { ...(await this.config()) };
    if (dto.appId !== undefined) {
      if (process.env.META_APP_ID) throw new BadRequestException("App ID server sozlamasida (META_APP_ID) berilgan.");
      const id = dto.appId.trim();
      if (id && !/^\d{5,25}$/.test(id)) throw new BadRequestException("App ID faqat raqamlardan iborat bo'ladi.");
      cfg.appId = id || undefined;
    }
    if (dto.appSecret !== undefined) {
      if (process.env.META_APP_SECRET) throw new BadRequestException("App Secret server sozlamasida (META_APP_SECRET) berilgan.");
      const secret = dto.appSecret.trim();
      if (secret && !/^[a-f0-9]{32}$/i.test(secret)) throw new BadRequestException("App Secret 32 belgili (0-9, a-f) bo'ladi. Meta panelidan qayta nusxalang.");
      cfg.appSecretEnc = secret ? encryptSecret(secret, SECRET_PURPOSE) : undefined;
    }
    if (dto.loginConfigId !== undefined) {
      if (process.env.META_LOGIN_CONFIG_ID) throw new BadRequestException("Configuration ID server sozlamasida (META_LOGIN_CONFIG_ID) berilgan.");
      const id = dto.loginConfigId.trim();
      if (id && !/^\d{5,25}$/.test(id)) throw new BadRequestException("Configuration ID faqat raqamlardan iborat bo'ladi.");
      cfg.loginConfigId = id || undefined;
    }
    if (dto.contactEmail !== undefined) {
      const email = dto.contactEmail.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException("Email noto'g'ri.");
      cfg.contactEmail = email || undefined;
    }
    if (dto.dedupeByPhone !== undefined) cfg.dedupeByPhone = dto.dedupeByPhone;
    if (dto.notifyTelegram !== undefined) cfg.notifyTelegram = dto.notifyTelegram;
    await this.saveConfig(cfg);
  }

  /** Ochiq ma'lumot: maxfiylik siyosati sahifasidagi aloqa emaili */
  async publicContact() {
    const cfg = await this.config();
    return { email: cfg.contactEmail ?? null };
  }

  async regenerateVerifyToken() {
    if (process.env.META_VERIFY_TOKEN) throw new BadRequestException("Verify Token server sozlamasida (META_VERIFY_TOKEN) berilgan.");
    const cfg = { ...(await this.config()), verifyToken: crypto.randomBytes(18).toString("base64url") };
    await this.saveConfig(cfg);
    return cfg.verifyToken;
  }

  private redirectUri(base: string) {
    return process.env.META_REDIRECT_URI?.trim() || `${base}/api/meta/oauth/callback`;
  }

  /** Ommaviy manzilni eslab qoladi (Telegram xabaridagi havola uchun) */
  private async rememberBase(base: string) {
    if (!base.startsWith("https://")) return;
    const cfg = await this.config();
    if (cfg.publicBase !== base) await this.saveConfig({ ...cfg, publicBase: base });
  }

  private async callLink(path: string) {
    const cfg = await this.config();
    const base = process.env.CALL_PUBLIC_URL?.replace(/\/+$/, "") || cfg.publicBase || "";
    return base ? `${base}${path}` : "";
  }

  // ==================== Holat (administrator kartochkasi) ====================

  async status(base: string) {
    await this.rememberBase(base);
    const a = await this.app();
    const conn = await this.prisma.metaConnection.findFirst({ orderBy: { updatedAt: "desc" } });
    const connectedBy = conn?.connectedById ? await this.prisma.user.findUnique({ where: { id: conn.connectedById }, select: { fullName: true } }) : null;
    const pages = await this.prisma.metaPage.findMany({
      orderBy: { pageName: "asc" },
      include: { forms: { select: { enabled: true } } },
    });
    const now = new Date(Date.now() + 5 * 3600_000);
    now.setUTCHours(0, 0, 0, 0);
    const startOfDay = new Date(now.getTime() - 5 * 3600_000); // Toshkent vaqti bo'yicha bugun
    const [today, total, pending, lastErr, orgs, users] = await Promise.all([
      this.prisma.metaWebhookEvent.count({ where: { status: "done", createdAt: { gte: startOfDay } } }),
      this.prisma.callLead.count({ where: { metaLeadgenId: { not: null } } }),
      this.prisma.metaWebhookEvent.count({ where: { status: "new" } }),
      // Qayta ulangandan oldingi eski xatolar ko'rsatilmaydi
      this.prisma.metaWebhookEvent.findFirst({ where: { status: "error", ...(conn ? { updatedAt: { gte: conn.updatedAt } } : {}) }, orderBy: { updatedAt: "desc" }, select: { error: true, updatedAt: true } }),
      this.prisma.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      this.prisma.user.findMany({ where: { isActive: true, role: { in: ["ADMIN", "MANAGER", "EMPLOYEE", "OPERATOR"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, role: true } }),
    ]);
    const lastLeadAt = pages.reduce<Date | null>((m, p) => (p.lastLeadAt && (!m || p.lastLeadAt > m) ? p.lastLeadAt : m), null);
    return {
      app: {
        appId: a.appId, appIdSource: a.appIdSource,
        hasSecret: !!a.appSecret, secretSource: a.secretSource,
        verifyToken: a.verifyToken, verifySource: a.verifySource,
        graphVersion: graphVersion(),
        loginConfigId: process.env.META_LOGIN_CONFIG_ID?.trim() || a.cfg.loginConfigId || null,
        loginConfigSource: process.env.META_LOGIN_CONFIG_ID ? "env" : a.cfg.loginConfigId ? "db" : null,
        contactEmail: a.cfg.contactEmail ?? null,
      },
      urls: { webhook: `${base}/api/meta/webhook`, redirect: this.redirectUri(base), domain: new URL(base).hostname, privacy: `${base}/privacy`, dataDeletion: `${base}/data-deletion` },
      settings: { dedupeByPhone: a.cfg.dedupeByPhone, notifyTelegram: a.cfg.notifyTelegram, telegramEnabled: this.telegram.isEnabled() },
      connection: conn ? { fbUserName: conn.fbUserName, status: conn.status, connectedAt: conn.updatedAt, connectedBy: connectedBy?.fullName ?? null } : null,
      pages: pages.map((p) => ({
        pageId: p.pageId, pageName: p.pageName, subscribed: p.subscribed, allForms: p.allForms,
        stage: p.stage, organizationId: p.organizationId, assigneeId: p.assigneeId,
        lastLeadAt: p.lastLeadAt, lastError: p.lastError, lastErrorAt: p.lastErrorAt,
        formsTotal: p.forms.length, formsEnabled: p.forms.filter((f) => f.enabled === true || (f.enabled !== false && p.allForms)).length,
      })),
      stats: { today, total, pending, lastLeadAt },
      lastError: lastErr ? { message: lastErr.error, at: lastErr.updatedAt } : null,
      stages: META_STAGES,
      organizations: orgs,
      users,
    };
  }

  // ==================== OAuth ====================

  async oauthStart(actor: Actor, base: string, returnUrl: string) {
    const a = await this.app();
    if (!a.appId || !a.appSecret) throw new BadRequestException("Avval Meta ilovasining App ID va App Secret qiymatlarini saqlang.");
    await this.rememberBase(base);
    for (const [k, v] of this.states) if (v.exp < Date.now()) this.states.delete(k);
    const state = crypto.randomBytes(24).toString("base64url");
    const redirectUri = this.redirectUri(base);
    this.states.set(state, { userId: actor.id, redirectUri, returnUrl, exp: Date.now() + STATE_TTL_MS });
    const q = new URLSearchParams({ client_id: a.appId, redirect_uri: redirectUri, state, response_type: "code" });
    // Facebook Login for Business: konfiguratsiya ID berilsa, ruxsatlar shu konfiguratsiyadan olinadi
    const configId = process.env.META_LOGIN_CONFIG_ID?.trim() || a.cfg.loginConfigId;
    if (configId) q.set("config_id", configId);
    else q.set("scope", (process.env.META_SCOPES?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_SCOPES).join(","));
    return { url: `${dialogBase()}/${graphVersion()}/dialog/oauth?${q.toString()}` };
  }

  /** Facebook'dan qaytish: kod -> qisqa token -> uzoq muddatli token -> sahifalar (muddatsiz Page tokenlar). */
  async oauthCallback(query: Record<string, string | undefined>): Promise<string> {
    const st = query.state ? this.states.get(query.state) : undefined;
    if (query.state) this.states.delete(query.state);
    if (!st || st.exp < Date.now()) return this.back(st?.returnUrl, "error", "Sessiya eskirgan, qaytadan \"Ulash\" tugmasini bosing.");
    if (query.error || !query.code) return this.back(st.returnUrl, "error", query.error_description || query.error_reason || "Ruxsat berilmadi.");

    try {
      const a = await this.app();
      if (!a.appId || !a.appSecret) throw new BadRequestException("App ID / App Secret sozlanmagan.");
      const short = await graph("GET", "oauth/access_token", { client_id: a.appId, client_secret: a.appSecret, redirect_uri: st.redirectUri, code: query.code });
      const long = await graph("GET", "oauth/access_token", { grant_type: "fb_exchange_token", client_id: a.appId, client_secret: a.appSecret, fb_exchange_token: short.access_token });
      const userToken: string = long.access_token ?? short.access_token;
      const auth = { token: userToken, appSecret: a.appSecret };
      const me = await graph("GET", "me", { fields: "id,name" }, auth);
      const pages = await graphAll("me/accounts", { fields: "id,name,access_token" }, auth);

      const conn = await this.prisma.metaConnection.upsert({
        where: { fbUserId: String(me.id) },
        create: { fbUserId: String(me.id), fbUserName: me.name ?? null, userToken: encryptSecret(userToken, TOKEN_PURPOSE), connectedById: st.userId, status: "ACTIVE" },
        update: { fbUserName: me.name ?? null, userToken: encryptSecret(userToken, TOKEN_PURPOSE), connectedById: st.userId, status: "ACTIVE" },
      });
      // Bitta akkaunt bilan ishlaymiz: boshqa (eski) ulanishlar o'chiriladi, sahifalari yangisiga o'tadi
      for (const p of pages) {
        if (!p?.id || !p.access_token) continue;
        await this.prisma.metaPage.upsert({
          where: { pageId: String(p.id) },
          create: { connectionId: conn.id, pageId: String(p.id), pageName: p.name ?? String(p.id), pageToken: encryptSecret(p.access_token, TOKEN_PURPOSE) },
          update: { connectionId: conn.id, pageName: p.name ?? String(p.id), pageToken: encryptSecret(p.access_token, TOKEN_PURPOSE), lastError: null, lastErrorAt: null },
        });
      }
      await this.prisma.metaConnection.deleteMany({ where: { id: { not: conn.id } } });
      this.logger.log(`Facebook ulandi: ${me.name ?? me.id}, sahifalar: ${pages.length}`);
      return this.back(st.returnUrl, "connected");
    } catch (e: any) {
      this.logger.warn(`OAuth xatosi: ${e?.message ?? e}`);
      return this.back(st.returnUrl, "error", e?.message ?? "Ulab bo'lmadi.");
    }
  }

  private back(returnUrl: string | undefined, result: string, reason?: string) {
    const url = new URL(returnUrl || "/settings", "http://x");
    url.searchParams.set("tab", "integrations");
    url.searchParams.set("meta", result);
    if (reason) url.searchParams.set("reason", reason.slice(0, 300));
    return returnUrl?.startsWith("http") ? url.toString() : `${url.pathname}${url.search}`;
  }

  /** Butunlay uzish: barcha sahifalar obunadan chiqariladi, tokenlar o'chiriladi. */
  async disconnectAll() {
    const pages = await this.prisma.metaPage.findMany();
    const a = await this.app();
    for (const p of pages) {
      if (p.subscribed) await graph("DELETE", `${p.pageId}/subscribed_apps`, {}, { token: decryptSecret(p.pageToken, TOKEN_PURPOSE), appSecret: a.appSecret }).catch(() => undefined);
    }
    await this.prisma.metaConnection.deleteMany({});
  }

  // ==================== Sahifalar va formalar ====================

  private async page(pageId: string) {
    const p = await this.prisma.metaPage.findUnique({ where: { pageId } });
    if (!p) throw new NotFoundException("Sahifa topilmadi. Facebook'ni qayta ulang.");
    return p;
  }

  private async pageAuth(p: { pageToken: string }) {
    const token = decryptSecret(p.pageToken, TOKEN_PURPOSE);
    if (!token) throw new BadRequestException("Sahifa tokenini o'qib bo'lmadi - Facebook'ni qayta ulang.");
    return { token, appSecret: (await this.app()).appSecret };
  }

  /** Sahifani leadgen webhook'iga obuna qiladi. */
  async connectPage(pageId: string) {
    const p = await this.page(pageId);
    try {
      await graph("POST", `${pageId}/subscribed_apps`, { subscribed_fields: "leadgen" }, await this.pageAuth(p));
    } catch (e) {
      await this.handleGraphError(p.pageId, e);
      throw new BadRequestException((e as Error).message);
    }
    await this.prisma.metaPage.update({ where: { pageId }, data: { subscribed: true, lastError: null, lastErrorAt: null } });
    return { ok: true };
  }

  /** Sahifani uzish: obunadan chiqarish va tokenni o'chirish. */
  async disconnectPage(pageId: string) {
    const p = await this.page(pageId);
    await graph("DELETE", `${pageId}/subscribed_apps`, {}, await this.pageAuth(p).catch(() => ({ token: null, appSecret: null }))).catch((e) => this.logger.warn(`Obunadan chiqarishda xato (${p.pageName}): ${e?.message ?? e}`));
    await this.prisma.metaPage.delete({ where: { pageId } });
    return { ok: true };
  }

  async updatePage(pageId: string, dto: { allForms?: boolean; stage?: string; organizationId?: string | null; assigneeId?: string | null }) {
    await this.page(pageId);
    if (dto.stage !== undefined && !META_STAGES.includes(dto.stage)) throw new BadRequestException("Bosqich noto'g'ri.");
    await this.prisma.metaPage.update({
      where: { pageId },
      data: { allForms: dto.allForms, stage: dto.stage, organizationId: dto.organizationId === undefined ? undefined : dto.organizationId || null, assigneeId: dto.assigneeId === undefined ? undefined : dto.assigneeId || null },
    });
    return { ok: true };
  }

  private toQuestions(raw: any): MetaQuestion[] {
    return Array.isArray(raw) ? raw.filter((q) => q?.key).map((q) => ({ key: String(q.key), label: String(q.label ?? q.key), type: q.type ? String(q.type) : undefined })) : [];
  }

  /** Sahifa formalari: `refresh` bo'lsa Meta'dan qayta olinadi (sozlamalar saqlanib qoladi). */
  async forms(pageId: string, refresh: boolean) {
    const p = await this.page(pageId);
    const existing = await this.prisma.metaForm.count({ where: { pageRefId: p.id } });
    if (refresh || existing === 0) {
      let list: any[];
      try {
        list = await graphAll(`${pageId}/leadgen_forms`, { fields: "id,name,status,questions" }, await this.pageAuth(p));
      } catch (e) {
        await this.handleGraphError(p.pageId, e);
        throw new BadRequestException((e as Error).message);
      }
      for (const f of list) {
        const data = { formName: f.name ?? String(f.id), formStatus: f.status ?? null, questions: this.toQuestions(f.questions) as any, pageRefId: p.id };
        await this.prisma.metaForm.upsert({ where: { formId: String(f.id) }, create: { formId: String(f.id), ...data }, update: data });
      }
    }
    const forms = await this.prisma.metaForm.findMany({ where: { pageRefId: p.id }, orderBy: [{ formStatus: "asc" }, { formName: "asc" }] });
    return {
      page: { pageId: p.pageId, pageName: p.pageName, allForms: p.allForms, stage: p.stage, organizationId: p.organizationId, assigneeId: p.assigneeId, subscribed: p.subscribed },
      forms: forms.map((f) => ({
        formId: f.formId, formName: f.formName, formStatus: f.formStatus, enabled: f.enabled,
        active: f.enabled === true || (f.enabled !== false && p.allForms),
        questions: (f.questions as any) ?? [], mapping: (f.mapping as any) ?? {},
        stage: f.stage, organizationId: f.organizationId, assigneeId: f.assigneeId,
      })),
    };
  }

  async saveForm(formId: string, dto: { enabled?: boolean | null; mapping?: Record<string, string>; stage?: string | null; organizationId?: string | null; assigneeId?: string | null }) {
    const f = await this.prisma.metaForm.findUnique({ where: { formId } });
    if (!f) throw new NotFoundException("Forma topilmadi. Formalarni yangilang.");
    if (dto.stage && !META_STAGES.includes(dto.stage)) throw new BadRequestException("Bosqich noto'g'ri.");
    let mapping: Record<string, string> | undefined;
    if (dto.mapping) {
      mapping = {};
      for (const [k, v] of Object.entries(dto.mapping)) {
        if (!(META_TARGETS as string[]).includes(v)) throw new BadRequestException(`Noto'g'ri moslama: ${k}`);
        mapping[k.slice(0, 100)] = v;
      }
    }
    await this.prisma.metaForm.update({
      where: { formId },
      data: {
        enabled: dto.enabled === undefined ? undefined : dto.enabled,
        mapping: mapping as any,
        stage: dto.stage === undefined ? undefined : dto.stage || null,
        organizationId: dto.organizationId === undefined ? undefined : dto.organizationId || null,
        assigneeId: dto.assigneeId === undefined ? undefined : dto.assigneeId || null,
      },
    });
    return { ok: true };
  }

  // ==================== Webhook ====================

  async verifyWebhook(mode?: string, token?: string): Promise<boolean> {
    const a = await this.app();
    return mode === "subscribe" && safeEqual(token, a.verifyToken);
  }

  /**
   * Meta xabari: imzo (X-Hub-Signature-256, xom tana bo'yicha HMAC-SHA256) tekshiriladi, har bir leadgen
   * navbatga yoziladi va darhol 200 qaytariladi. Lidni o'qish va yaratish fon rejimida bajariladi.
   */
  async receiveWebhook(raw: Buffer | undefined, signature: string | undefined, body: any) {
    const a = await this.app();
    if (!a.appSecret || !raw) throw new ForbiddenException();
    const expected = `sha256=${crypto.createHmac("sha256", a.appSecret).update(raw).digest("hex")}`;
    if (!safeEqual(signature?.trim().toLowerCase(), expected)) throw new ForbiddenException("Imzo noto'g'ri.");
    if (body?.object !== "page") return { ok: true };

    let queued = 0;
    for (const entry of Array.isArray(body.entry) ? body.entry : []) {
      for (const ch of Array.isArray(entry?.changes) ? entry.changes : []) {
        if (ch?.field !== "leadgen" || !ch.value?.leadgen_id) continue;
        const v = ch.value;
        try {
          await this.prisma.metaWebhookEvent.create({
            data: {
              leadgenId: String(v.leadgen_id), pageId: String(v.page_id ?? entry.id ?? ""),
              formId: v.form_id ? String(v.form_id) : null, adId: v.ad_id ? String(v.ad_id) : null,
              rawPayload: v,
            },
          });
          queued++;
        } catch (e: any) {
          if (e?.code !== "P2002") throw e; // P2002 - shu lid allaqachon navbatda (Meta qayta yuborgan) - e'tiborsiz
        }
      }
    }
    if (queued) setImmediate(() => void this.drain());
    return { ok: true };
  }

  // ==================== Navbatni qayta ishlash ====================

  async drain() {
    if (this.draining) { this.drainAgain = true; return; }
    this.draining = true;
    try {
      do {
        this.drainAgain = false;
        for (let round = 0; round < 20; round++) {
          const batch = await this.prisma.metaWebhookEvent.findMany({ where: { status: "new", nextAttemptAt: { lte: new Date() } }, orderBy: { createdAt: "asc" }, take: 20 });
          if (!batch.length) break;
          for (const ev of batch) await this.processEvent(ev);
        }
      } while (this.drainAgain);
    } catch (e: any) {
      this.logger.warn(`Navbatni qayta ishlashda xato: ${e?.message ?? e}`);
    } finally {
      this.draining = false;
    }
  }

  private async finish(id: string, status: "done" | "skipped" | "error", data: { error?: string | null; leadId?: string | null } = {}) {
    await this.prisma.metaWebhookEvent.update({ where: { id }, data: { status, error: data.error ?? null, leadId: data.leadId ?? undefined } });
  }

  private async processEvent(ev: { id: string; leadgenId: string; pageId: string; formId: string | null; attempts: number }) {
    const page = await this.prisma.metaPage.findUnique({ where: { pageId: ev.pageId } });
    if (!page || !page.subscribed) {
      this.logger.log(`Lid ${ev.leadgenId} o'tkazib yuborildi: sahifa ulanmagan`);
      return this.finish(ev.id, "skipped", { error: "Sahifa ulanmagan yoki obuna o'chirilgan" });
    }
    let form = ev.formId ? await this.prisma.metaForm.findUnique({ where: { formId: ev.formId } }) : null;
    const accepted = form?.enabled === true || (form?.enabled !== false && page.allForms);
    if (!accepted) {
      this.logger.log(`Lid ${ev.leadgenId} o'tkazib yuborildi: forma ${ev.formId ?? "?"} tanlanmagan`);
      return this.finish(ev.id, "skipped", { error: "Forma tanlanmagan (yoqilmagan)" });
    }

    try {
      const auth = await this.pageAuth(page).catch(() => { throw new GraphError("Sahifa tokenini o'qib bo'lmadi - qayta ulang", 401, 190); });
      // "Barcha formalar" rejimida yangi forma - nomi va savollarini bir marta olib saqlaymiz
      if (!form && ev.formId) {
        const info = await graph("GET", ev.formId, { fields: "id,name,status,questions" }, auth).catch(() => null);
        if (info) {
          form = await this.prisma.metaForm.upsert({
            where: { formId: ev.formId },
            create: { formId: ev.formId, pageRefId: page.id, formName: info.name ?? ev.formId, formStatus: info.status ?? null, questions: this.toQuestions(info.questions) as any },
            update: {},
          });
        }
      }
      const lead = await this.fetchLead(ev.leadgenId, auth);
      const leadId = await this.createLead(lead, page, form);
      await this.prisma.metaPage.update({ where: { id: page.id }, data: { lastLeadAt: new Date(), lastError: null, lastErrorAt: null } });
      return this.finish(ev.id, "done", { leadId });
    } catch (e: any) {
      const message = String(e?.message ?? e).slice(0, 500);
      const attempts = ev.attempts + 1;
      const fatal = e instanceof GraphError && e.isAuthError;
      if (fatal) await this.handleGraphError(page.pageId, e);
      if (fatal || attempts >= MAX_ATTEMPTS) {
        this.logger.warn(`Lid ${ev.leadgenId} olinmadi (${attempts} urinish): ${message}`);
        await this.prisma.metaPage.update({ where: { id: page.id }, data: { lastError: message, lastErrorAt: new Date() } });
        await this.prisma.metaWebhookEvent.update({ where: { id: ev.id }, data: { status: "error", attempts, error: message } });
      } else {
        await this.prisma.metaWebhookEvent.update({ where: { id: ev.id }, data: { attempts, error: message, nextAttemptAt: new Date(Date.now() + BACKOFF_MS[attempts - 1]) } });
      }
    }
  }

  /** Lidning to'liq ma'lumoti. ads_read ruxsati bo'lmasa, kampaniya/reklama nomlarisiz qayta so'raladi. */
  private async fetchLead(leadgenId: string, auth: { token: string; appSecret: string | null }): Promise<MetaLeadData> {
    try {
      return await graph("GET", leadgenId, { fields: LEAD_FIELDS }, auth);
    } catch (e) {
      if (e instanceof GraphError && e.isPermissionOrField && !e.isAuthError) {
        return await graph("GET", leadgenId, { fields: LEAD_FIELDS_BASIC }, auth);
      }
      throw e;
    }
  }

  private async defaultOrgId(): Promise<string> {
    const tel = await this.prisma.appSetting.findUnique({ where: { key: "telephony" } });
    try {
      const id = tel ? JSON.parse(tel.value).organizationId : null;
      if (id) return id;
    } catch { /* */ }
    const org = await this.prisma.organization.findFirst({ orderBy: { name: "asc" }, select: { id: true } });
    if (!org) throw new Error("Tashkilot topilmadi");
    return org.id;
  }

  /** Lid yaratish (yoki shu raqamli ochiq lidga izoh qo'shish). Qaytaradi: lid ID. */
  private async createLead(
    data: MetaLeadData,
    page: { pageName: string; stage: string; organizationId: string | null; assigneeId: string | null },
    form: { formId: string; formName: string; questions: any; mapping: any; stage: string | null; organizationId: string | null; assigneeId: string | null } | null,
  ): Promise<string> {
    const dup = await this.prisma.callLead.findUnique({ where: { metaLeadgenId: String(data.id) }, select: { id: true } });
    if (dup) return dup.id;

    const cfg = await this.config();
    const m = mapMetaLead(data, { questions: form?.questions as MetaQuestion[] | null, mapping: form?.mapping as Record<string, string> | null, formName: form?.formName ?? null });
    const organizationId = form?.organizationId || page.organizationId || (await this.defaultOrgId());
    const assigneeId = form?.assigneeId || page.assigneeId || null;
    const stage = form?.stage || page.stage || "NEW";
    const metaFields = {
      metaFormId: data.form_id ?? form?.formId ?? null, metaFormName: form?.formName ?? null,
      metaCampaignId: data.campaign_id ?? null, metaCampaignName: data.campaign_name ?? null,
      metaAdsetName: data.adset_name ?? null, metaAdId: data.ad_id ?? null, metaAdName: data.ad_name ?? null,
      metaPlatform: data.platform ?? null,
    };

    // Shu raqamli ochiq lid bo'lsa - yangisi yaratilmaydi, mavjudiga izoh qo'shiladi
    if (cfg.dedupeByPhone && m.phone) {
      const open = await this.prisma.callLead.findMany({ where: { organizationId, phone: { not: null }, stage: { notIn: CLOSED_STAGES } }, select: { id: true, phone: true, note: true, metaLeadgenId: true } });
      const existing = open.find((l) => samePhone(l.phone, m.phone));
      if (existing) {
        const add = `— ${formatTashkent(new Date())}: ${m.source} orqali yana ariza${m.name !== m.phone ? ` (${m.name})` : ""}\n${m.note}`;
        await this.prisma.callLead.update({
          where: { id: existing.id },
          data: { note: [existing.note, add].filter(Boolean).join("\n\n").slice(0, 10_000), ...(existing.metaLeadgenId ? {} : { metaLeadgenId: String(data.id), ...metaFields }) },
        });
        await this.notify(existing.id, m, assigneeId, true);
        return existing.id;
      }
    }

    const clientPhones = m.phone ? await this.prisma.clientPhone.findMany({ select: { phone: true } }) : [];
    const isClient = clientPhones.some((c) => samePhone(c.phone, m.phone));
    const note = [isClient ? "⚠️ Bu raqam CRM mijozlari ro'yxatida bor." : "", m.note].filter(Boolean).join("\n\n");

    try {
      const lead = await this.prisma.callLead.create({
        data: { organizationId, ownerId: assigneeId, name: m.name, phone: m.phone, source: m.source, note: note.slice(0, 10_000), stage, metaLeadgenId: String(data.id), ...metaFields },
      });
      await this.notify(lead.id, m, assigneeId, false);
      return lead.id;
    } catch (e: any) {
      if (e?.code === "P2002") {
        const again = await this.prisma.callLead.findUnique({ where: { metaLeadgenId: String(data.id) }, select: { id: true } });
        if (again) return again.id;
      }
      throw e;
    }
  }

  /** Yangi lid haqida Telegram xabari: mas'ulga, u bo'lmasa operatorlarga (ular ham bo'lmasa administratorlarga). */
  private async notify(leadId: string, m: ReturnType<typeof mapMetaLead>, assigneeId: string | null, repeat: boolean) {
    try {
      const cfg = await this.config();
      if (!cfg.notifyTelegram || !this.telegram.isEnabled()) return;
      let chats: string[] = [];
      if (assigneeId) {
        const u = await this.prisma.user.findUnique({ where: { id: assigneeId }, select: { telegramId: true, isActive: true } });
        if (u?.telegramId && u.isActive) chats = [u.telegramId];
      }
      for (const role of ["OPERATOR", "ADMIN"]) {
        if (chats.length) break;
        const us = await this.prisma.user.findMany({ where: { role, isActive: true, telegramId: { not: null } }, select: { telegramId: true } });
        chats = us.map((u) => u.telegramId!).filter(Boolean);
      }
      if (!chats.length) return;
      const link = await this.callLink("/calls");
      const lines = [
        repeat ? `🔁 <b>Mavjud lid yana ariza qoldirdi</b> · ${escapeHtml(m.source)}` : `🆕 <b>Yangi lid</b> · ${escapeHtml(m.source)}`,
        `<b>${escapeHtml(m.name)}</b>`,
        m.phone ? `📞 ${escapeHtml(m.phone)}` : "",
        ...m.answers.slice(0, 6).map((a) => `• ${escapeHtml(a)}`),
        link ? `<a href="${link}">Call-markazda ochish</a>` : "",
      ].filter(Boolean);
      for (const chat of chats.slice(0, 20)) await this.telegram.sendMessage(chat, lines.join("\n"));
    } catch (e: any) {
      this.logger.warn(`Telegram xabari yuborilmadi (lid ${leadId}): ${e?.message ?? e}`);
    }
  }

  /** Token bekor bo'lsa (190) - "Qayta ulash kerak" holati va administratorlarga xabar. */
  private async handleGraphError(pageId: string, e: unknown) {
    if (!(e instanceof GraphError)) return;
    const page = await this.prisma.metaPage.findUnique({ where: { pageId } });
    if (!page) return;
    await this.prisma.metaPage.update({ where: { id: page.id }, data: { lastError: e.message.slice(0, 500), lastErrorAt: new Date() } });
    if (!e.isAuthError) return;
    const conn = await this.prisma.metaConnection.findUnique({ where: { id: page.connectionId } });
    if (!conn || conn.status === "REAUTH") return;
    await this.prisma.metaConnection.update({ where: { id: conn.id }, data: { status: "REAUTH" } });
    this.logger.warn(`Facebook tokeni bekor bo'ldi (${page.pageName}) - qayta ulash kerak`);
    if (!this.telegram.isEnabled()) return;
    const admins = await this.prisma.user.findMany({ where: { role: "ADMIN", isActive: true, telegramId: { not: null } }, select: { telegramId: true } });
    const link = await this.callLink("/settings?tab=integrations");
    for (const a of admins) {
      await this.telegram.sendMessage(a.telegramId!, `⚠️ <b>Facebook Lead Ads</b>: "${escapeHtml(page.pageName)}" sahifasi tokeni bekor bo'ldi, lidlar tushmayapti. Integratsiyani qayta ulang.${link ? `\n<a href="${link}">Sozlamalarni ochish</a>` : ""}`);
    }
  }

  // ==================== Jurnal ====================

  async events(status?: string) {
    const rows = await this.prisma.metaWebhookEvent.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, leadgenId: true, pageId: true, formId: true, status: true, attempts: true, error: true, leadId: true, createdAt: true, updatedAt: true },
    });
    const pages = await this.prisma.metaPage.findMany({ select: { pageId: true, pageName: true } });
    const forms = await this.prisma.metaForm.findMany({ where: { formId: { in: rows.map((r) => r.formId).filter((x): x is string => !!x) } }, select: { formId: true, formName: true } });
    const leads = await this.prisma.callLead.findMany({ where: { id: { in: rows.map((r) => r.leadId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    return rows.map((r) => ({
      ...r,
      pageName: pages.find((p) => p.pageId === r.pageId)?.pageName ?? r.pageId,
      formName: forms.find((f) => f.formId === r.formId)?.formName ?? r.formId,
      leadName: leads.find((l) => l.id === r.leadId)?.name ?? null,
    }));
  }

  async retryEvent(id: string) {
    const ev = await this.prisma.metaWebhookEvent.findUnique({ where: { id } });
    if (!ev) throw new NotFoundException();
    if (ev.status === "done") throw new BadRequestException("Bu lid allaqachon qabul qilingan.");
    await this.prisma.metaWebhookEvent.update({ where: { id }, data: { status: "new", attempts: 0, error: null, nextAttemptAt: new Date() } });
    await this.drain();
    return this.prisma.metaWebhookEvent.findUnique({ where: { id }, select: { status: true, error: true } });
  }
}
