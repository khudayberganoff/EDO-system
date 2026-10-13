import { Injectable, Logger, OnApplicationBootstrap, BadRequestException } from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { escapeHtml } from "./telegram-task-parser";

const TOKEN_SETTING = "telegram_bot_token";
/** Odatda api.telegram.org; sinov yoki mahalliy Bot API serveri uchun TELEGRAM_API_BASE bilan almashtiriladi. */
const apiBase = () => (process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/+$/, "");

/**
 * Telegram Bot API bilan ishlash (so'rov yuborish, webhook sozlash, bildirishnoma).
 * Bot tokeni: avval `TELEGRAM_BOT_TOKEN` muhit o'zgaruvchisi, bo'lmasa saytdan (Integratsiyalar
 * sahifasi) kiritilib, bazada SHIFRLANGAN holda saqlanadi. Token hech qachon javoblarda qaytmaydi.
 */
@Injectable()
export class TelegramService implements OnApplicationBootstrap {
  private readonly logger = new Logger("Telegram");
  private token: string | null = process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
  private source: "env" | "db" | null = this.token ? "env" : null;
  private botUsername: string | null = null;

  constructor(private prisma: PrismaService) {}

  onApplicationBootstrap() {
    // Baza sxemasi server ishga tushgandan keyin yangilanadi, shuning uchun urinish takrorlanadi
    void this.init(0);
  }

  private async init(attempt: number) {
    try {
      if (!this.token) await this.loadStoredToken();
      if (this.token) await this.setup();
    } catch (err: any) {
      if (attempt < 6) setTimeout(() => void this.init(attempt + 1), 20_000);
      else this.logger.warn(`Telegram sozlanmadi: ${err?.message ?? err}`);
    }
  }

  isEnabled(): boolean { return !!this.token; }
  getBotUsername(): string | null { return this.botUsername; }
  getSource() { return this.source; }

  /** Webhook so'rovini tasdiqlash uchun maxfiy qiymat (token'dan hosil qilinadi, alohida sozlash shart emas). */
  webhookSecret(): string {
    return crypto.createHash("sha256").update(`${this.token ?? ""}:edo-telegram-webhook`).digest("hex").slice(0, 48);
  }

  verifyWebhookSecret(header: string | undefined): boolean {
    if (!this.token || !header) return false;
    const a = Buffer.from(header);
    const b = Buffer.from(this.webhookSecret());
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  publicBaseUrl(): string {
    const configured = process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || process.env.CORS_ORIGIN?.split(",")[0];
    return (configured || "http://localhost:5173").replace(/\/+$/, "");
  }

  // ---------- token saqlash (shifrlangan) ----------

  private key() {
    return crypto.createHash("sha256").update(`${process.env.JWT_SECRET ?? "edo"}:telegram-token`).digest();
  }
  private encrypt(plain: string): string {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", this.key(), iv);
    const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
    return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
  }
  private decrypt(stored: string): string | null {
    try {
      const [v, iv, tag, data] = stored.split(":");
      if (v !== "v1") return null;
      const d = crypto.createDecipheriv("aes-256-gcm", this.key(), Buffer.from(iv, "base64"));
      d.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
    } catch { return null; }
  }

  private async loadStoredToken() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: TOKEN_SETTING } });
    const plain = row ? this.decrypt(row.value) : null;
    if (plain) { this.token = plain; this.source = "db"; }
  }

  /** Saytdan kiritilgan tokenni tekshirib (getMe), shifrlab saqlaydi va webhook'ni ulaydi. */
  async saveToken(token: string): Promise<string> {
    if (this.source === "env") throw new BadRequestException("Token server sozlamasida (TELEGRAM_BOT_TOKEN) berilgan, saytdan o'zgartirib bo'lmaydi.");
    const me = await this.callWith(token, "getMe");
    if (!me?.username) throw new BadRequestException("Token noto'g'ri: Telegram uni qabul qilmadi.");
    await this.prisma.appSetting.upsert({
      where: { key: TOKEN_SETTING },
      create: { key: TOKEN_SETTING, value: this.encrypt(token) },
      update: { value: this.encrypt(token) },
    });
    this.token = token; this.source = "db"; this.botUsername = me.username;
    await this.setup();
    return me.username;
  }

  async removeToken() {
    if (this.source === "env") throw new BadRequestException("Token server sozlamasida berilgan, saytdan o'chirib bo'lmaydi.");
    if (this.token) await this.call("deleteWebhook").catch(() => undefined);
    await this.prisma.appSetting.deleteMany({ where: { key: TOKEN_SETTING } });
    this.token = null; this.source = null; this.botUsername = null;
  }

  // ---------- Telegram Bot API ----------

  private async callWith(token: string, method: string, body?: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${apiBase()}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(10_000),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!json.ok) throw new BadRequestException(`Telegram: ${json.description ?? res.status}`);
    return json.result;
  }

  call(method: string, body?: Record<string, unknown>) {
    if (!this.token) throw new BadRequestException("Telegram bot sozlanmagan.");
    return this.callWith(this.token, method, body);
  }

  /** Bot nomini aniqlaydi va webhook'ni ulaydi (ommaviy HTTPS manzil bo'lsa). */
  async setup() {
    const me = await this.call("getMe");
    this.botUsername = me.username ?? null;
    const base = this.publicBaseUrl();
    if (!base.startsWith("https://")) {
      this.logger.warn(`Webhook ulanmadi: PUBLIC_APP_URL https:// bilan boshlanishi kerak (hozir: ${base})`);
      return;
    }
    await this.call("setWebhook", {
      url: `${base}/api/telegram/webhook`,
      secret_token: this.webhookSecret(),
      allowed_updates: ["message"],
    });
    this.logger.log(`Telegram bot @${this.botUsername} webhook'i ulandi.`);
  }

  async webhookInfo() {
    if (!this.token) return null;
    try {
      const i = await this.call("getWebhookInfo");
      return { url: i.url || null, pending: i.pending_update_count ?? 0, lastError: i.last_error_message ?? null };
    } catch { return null; }
  }

  async sendMessage(chatId: number | string, html: string, extra: Record<string, unknown> = {}) {
    if (!this.token) return;
    try {
      await this.call("sendMessage", { chat_id: chatId, text: html.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true, ...extra });
    } catch (err: any) {
      this.logger.warn(`Xabar yuborilmadi (${chatId}): ${err?.message ?? err}`);
    }
  }

  /** Mas'ul qilib tayinlangan xodimga (agar Telegram ulangan bo'lsa) shaxsiy xabar. */
  async notifyAssigned(assigneeId: string, task: { title: string; dueDate?: Date | string | null }, byName: string) {
    if (!this.token) return;
    try {
      const u = await this.prisma.user.findUnique({ where: { id: assigneeId }, select: { telegramId: true, isActive: true } });
      if (!u?.telegramId || !u.isActive) return;
      const due = task.dueDate ? ` · muddat: ${new Date(task.dueDate).toISOString().slice(0, 10)}` : "";
      const link = `${this.publicBaseUrl()}/board`;
      await this.sendMessage(u.telegramId, `📌 Sizga vazifa biriktirildi\n<b>${escapeHtml(task.title.slice(0, 200))}</b>${due}\nKim tomonidan: ${escapeHtml(byName)}\n<a href="${link}">Doskani ochish</a>`);
    } catch (err: any) {
      this.logger.warn(`Bildirishnoma yuborilmadi: ${err?.message ?? err}`);
    }
  }
}
