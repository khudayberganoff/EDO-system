import { BadRequestException, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { decryptSecret, encryptSecret, safeEqual } from "../common/secret-box";
import { siteMode } from "../common/site-mode";
import { TelegramService } from "./telegram.service";
import { escapeHtml } from "./telegram-task-parser";

const TOKEN_KEY = "call_telegram_bot_token";
const BASE_KEY = "call_telegram_base";
const LAST_KEY = "call_telegram_last";
const PURPOSE = "call-telegram-token";
const apiBase = () => (process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/+$/, "");

interface TgUser { id: number; username?: string; first_name?: string }
interface TgMessage { message_id: number; chat: { id: number; type: string }; from?: TgUser; text?: string }

/**
 * Call-markazning o'z Telegram boti ("WAFA Call-markaz"): yangi lidlar va Facebook ogohlantirishlari shu bot
 * orqali keladi. EDO boti (vazifalar doskasi) bilan aralashmaydi. Token Sozlamalar -> Integratsiyalar'dan
 * kiritiladi va bazada shifrlangan holda saqlanadi. Bot sozlanmagan bo'lsa, xabarlar avvalgidek EDO boti orqali ketadi.
 */
@Injectable()
export class CallTelegramService implements OnApplicationBootstrap {
  private readonly logger = new Logger("CallTelegram");
  private token: string | null = null;
  private botUsername: string | null = null;
  private botName: string | null = null;

  constructor(private prisma: PrismaService, private main: TelegramService) {}

  onApplicationBootstrap() {
    if (siteMode() === "edo") return; // alohida EDO serverida Call-markaz yo'q
    void this.init(0);
  }

  private async init(attempt: number) {
    try {
      const row = await this.prisma.appSetting.findUnique({ where: { key: TOKEN_KEY } });
      this.token = decryptSecret(row?.value, PURPOSE);
      if (this.token) await this.setup();
    } catch (err: any) {
      if (attempt < 6) setTimeout(() => void this.init(attempt + 1), 20_000);
      else this.logger.warn(`Call-markaz boti sozlanmadi: ${err?.message ?? err}`);
    }
  }

  isEnabled() { return !!this.token; }

  /** Xabar yuborish mumkinmi: o'z boti yoki (u bo'lmasa) EDO boti */
  canNotify() { return this.isEnabled() || this.main.isEnabled(); }

  // ---------- Bot API ----------

  private async callWith(token: string, method: string, body?: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${apiBase()}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(10_000),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!json.ok) {
      const err: any = new BadRequestException(`Telegram: ${json.description ?? res.status}`);
      err.tgCode = json.error_code ?? res.status;
      throw err;
    }
    return json.result;
  }

  private call(method: string, body?: Record<string, unknown>) {
    if (!this.token) throw new BadRequestException("Call-markaz boti sozlanmagan.");
    return this.callWith(this.token, method, body);
  }

  webhookSecret(): string {
    return crypto.createHash("sha256").update(`${this.token ?? ""}:call-telegram-webhook`).digest("hex").slice(0, 48);
  }

  verifyWebhookSecret(header: string | undefined): boolean {
    return !!this.token && safeEqual(header, this.webhookSecret());
  }

  private async publicBase(): Promise<string> {
    const env = (process.env.CALL_PUBLIC_URL || "").trim().replace(/\/+$/, "");
    if (env) return env;
    const row = await this.prisma.appSetting.findUnique({ where: { key: BASE_KEY } });
    return (row?.value ?? "").replace(/\/+$/, "");
  }

  /** Bot nomini aniqlaydi, webhook va buyruqlar menyusini ulaydi. */
  private async setup() {
    const me = await this.call("getMe");
    this.botUsername = me.username ?? null;
    this.botName = me.first_name ?? null;
    const base = await this.publicBase();
    if (!base.startsWith("https://")) {
      this.logger.warn(`Call-markaz boti @${this.botUsername}: webhook ulanmadi (sayt manzili https:// emas: "${base}")`);
      return;
    }
    await this.call("setWebhook", {
      url: `${base}/api/calls/telegram/webhook`,
      secret_token: this.webhookSecret(),
      allowed_updates: ["message"],
    });
    await this.call("setMyCommands", {
      commands: [
        { command: "start", description: "Botni ishga tushirish" },
        { command: "uzish", description: "Xabarlarni o'chirish" },
      ],
    }).catch(() => undefined);
    this.logger.log(`Call-markaz boti @${this.botUsername} ulandi.`);
  }

  // ---------- Administrator: tokenni sozlash ----------

  async config() {
    let webhook: { url: string | null; pending: number; lastError: string | null } | null = null;
    if (this.token) {
      try {
        const i = await this.call("getWebhookInfo");
        webhook = { url: i.url || null, pending: i.pending_update_count ?? 0, lastError: i.last_error_message ?? null };
      } catch { /* tarmoq xatosi - holat ko'rsatilmaydi */ }
    }
    return {
      configured: this.isEnabled(),
      botUsername: this.botUsername,
      botName: this.botName,
      webhook,
      publicUrl: await this.publicBase(),
      linkedUsers: await this.prisma.user.count({ where: { telegramCallBot: true, telegramId: { not: null }, isActive: true } }),
      // Bot sozlanmagan bo'lsa xabarlar EDO boti orqali ketadi
      fallbackBot: !this.isEnabled() && this.main.isEnabled() ? this.main.getBotUsername() : null,
      // Lid xabarlari boradigan xodimlar (lidga mas'ul biriktirilmagan bo'lsa) va oxirgi xabar natijasi
      recipients: await this.recipientNames(),
      lastNotify: await this.lastLeadNotify(),
    };
  }

  async saveToken(token: string, name: string | undefined, base: string) {
    const me = await this.callWith(token, "getMe").catch(() => null);
    if (!me?.username) throw new BadRequestException("Token noto'g'ri: Telegram uni qabul qilmadi.");
    // Bitta bot ikki joyda bo'lsa EDO'dagi vazifa buyruqlari to'xtab qoladi
    if (this.main.getBotUsername() && this.main.getBotUsername() === me.username) {
      throw new BadRequestException(`@${me.username} - bu EDO boti. Call-markaz uchun @BotFather'da yangi bot yarating.`);
    }
    if (name?.trim() && name.trim() !== me.first_name) {
      await this.callWith(token, "setMyName", { name: name.trim().slice(0, 64) }).catch((e) => this.logger.warn(`Bot nomi o'zgarmadi: ${e?.message ?? e}`));
    }
    await this.callWith(token, "setMyShortDescription", { short_description: "WAFA Call-markaz: yangi lidlar haqida xabarlar" }).catch(() => undefined);
    await this.prisma.appSetting.upsert({ where: { key: TOKEN_KEY }, create: { key: TOKEN_KEY, value: encryptSecret(token, PURPOSE) }, update: { value: encryptSecret(token, PURPOSE) } });
    await this.prisma.appSetting.upsert({ where: { key: BASE_KEY }, create: { key: BASE_KEY, value: base }, update: { value: base } });
    // Yangi botga hali hech kim Start bosmagan
    await this.prisma.user.updateMany({ where: { telegramCallBot: true }, data: { telegramCallBot: false } });
    this.token = token;
    await this.setup();
    return this.config();
  }

  async removeToken() {
    if (this.token) await this.call("deleteWebhook").catch(() => undefined);
    await this.prisma.appSetting.deleteMany({ where: { key: { in: [TOKEN_KEY, BASE_KEY] } } });
    await this.prisma.user.updateMany({ where: { telegramCallBot: true }, data: { telegramCallBot: false } });
    this.token = null; this.botUsername = null; this.botName = null;
    return this.config();
  }

  // ---------- Xodim: o'z Telegram'ini ulash ----------

  async status(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { telegramId: true, telegramUsername: true, telegramCallBot: true } });
    return {
      enabled: this.isEnabled(),
      botUsername: this.botUsername,
      linked: this.isEnabled() && !!u?.telegramId && !!u.telegramCallBot,
      username: u?.telegramUsername ?? null,
    };
  }

  async createLink(userId: string) {
    if (!this.isEnabled() || !this.botUsername) throw new BadRequestException("Call-markaz Telegram boti hali sozlanmagan (Sozlamalar → Integratsiyalar).");
    await this.prisma.telegramLinkCode.deleteMany({ where: { OR: [{ userId }, { expiresAt: { lt: new Date() } }] } });
    const code = crypto.randomBytes(18).toString("base64url");
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await this.prisma.telegramLinkCode.create({ data: { codeHash: crypto.createHash("sha256").update(code).digest("hex"), userId, expiresAt } });
    return { url: `https://t.me/${this.botUsername}?start=${code}`, expiresAt };
  }

  async unlink(userId: string) {
    // Alohida Call-markaz serverida Telegram hisobi faqat shu bot uchun; umumiy serverda EDO ulanishi saqlanadi
    const data = siteMode() === "call" ? { telegramCallBot: false, telegramId: null, telegramUsername: null } : { telegramCallBot: false };
    await this.prisma.user.update({ where: { id: userId }, data });
    return { linked: false };
  }

  // ---------- Webhook ----------

  async handleUpdate(update: any) {
    const msg: TgMessage | undefined = update?.message;
    if (!msg?.from || msg.chat.type !== "private") return;
    const chatId = msg.chat.id;
    const text = (msg.text ?? "").trim();
    const tgId = String(msg.from.id);

    const start = text.match(/^\/start(?:@\w+)?\s+(\S+)/);
    if (start) return this.linkAccount(msg, start[1]);

    const user = await this.prisma.user.findUnique({ where: { telegramId: tgId }, select: { id: true, fullName: true, isActive: true, telegramCallBot: true } });
    if (/^\/uzish/.test(text)) {
      if (user) await this.prisma.user.update({ where: { id: user.id }, data: { telegramCallBot: false } });
      return this.send(chatId, "🔕 Xabarlar o'chirildi. Qayta yoqish uchun /start bosing.");
    }
    if (user?.isActive) {
      if (!user.telegramCallBot) await this.prisma.user.update({ where: { id: user.id }, data: { telegramCallBot: true } });
      return this.send(chatId, `✅ Salom, <b>${escapeHtml(user.fullName)}</b>!\nYangi lidlar haqidagi xabarlar shu yerga keladi.`);
    }
    return this.send(chatId, "Bu <b>WAFA Call-markaz</b> boti.\nUlash uchun Call-markaz saytida <b>Telegram</b> tugmasini bosing va ochilgan havoladan <b>Start</b> ni bosing.");
  }

  private async linkAccount(msg: TgMessage, code: string) {
    const chatId = msg.chat.id;
    const hash = crypto.createHash("sha256").update(code.trim()).digest("hex");
    const row = await this.prisma.telegramLinkCode.findUnique({ where: { codeHash: hash }, include: { user: { select: { id: true, fullName: true, isActive: true } } } });
    if (!row || row.expiresAt < new Date() || !row.user.isActive) {
      return this.send(chatId, "Havola eskirgan yoki noto'g'ri. Call-markaz saytida <b>Telegram</b> tugmasini bosib, yangi havola oling.");
    }
    const tgId = String(msg.from!.id);
    const holder = await this.prisma.user.findUnique({ where: { telegramId: tgId }, select: { id: true, fullName: true } });
    if (holder && holder.id !== row.user.id) {
      return this.send(chatId, `Bu Telegram hisobi allaqachon boshqa xodimga (${escapeHtml(holder.fullName)}) ulangan. Avval u yerda uzing.`);
    }
    await this.prisma.user.update({ where: { id: row.user.id }, data: { telegramId: tgId, telegramUsername: msg.from!.username ?? null, telegramCallBot: true } });
    await this.prisma.telegramLinkCode.deleteMany({ where: { userId: row.user.id } });
    await this.send(chatId, `✅ Ulandi: <b>${escapeHtml(row.user.fullName)}</b>\nYangi lidlar haqidagi xabarlar shu yerga keladi. O'chirish: /uzish`);
  }

  private async send(chatId: number | string, html: string) {
    return this.call("sendMessage", { chat_id: chatId, text: html.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true }).catch((e) => {
      this.logger.warn(`Xabar yuborilmadi (${chatId}): ${e?.message ?? e}`);
      return undefined;
    });
  }

  // ---------- Bildirishnomalar (lidlar, Facebook) ----------

  /**
   * Telegram ulangan xodimlar orasidan shu rollardagilarni (birinchi bo'sh bo'lmagan guruh) qaytaradi.
   * O'z boti bo'lsa - faqat unda Start bosganlar (bot boshqalarga yoza olmaydi).
   */
  async recipients(opts: { userId?: string | null; roles: string[] }): Promise<string[]> {
    const own = this.isEnabled();
    const base = { isActive: true, telegramId: { not: null }, ...(own ? { telegramCallBot: true } : {}) };
    if (opts.userId) {
      const u = await this.prisma.user.findFirst({ where: { id: opts.userId, ...base }, select: { telegramId: true } });
      if (u?.telegramId) return [u.telegramId];
    }
    for (const role of opts.roles) {
      const us = await this.prisma.user.findMany({ where: { role, ...base }, select: { telegramId: true } });
      const ids = us.map((u) => u.telegramId!).filter(Boolean);
      if (ids.length) return ids;
    }
    return [];
  }

  /** Xabar yuboradi: o'z boti orqali, u sozlanmagan bo'lsa EDO boti orqali. */
  async notify(chatId: string, html: string): Promise<boolean> {
    if (!this.isEnabled()) return !!(await this.main.sendMessage(chatId, html));
    try {
      await this.call("sendMessage", { chat_id: chatId, text: html.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true });
      return true;
    } catch (e: any) {
      this.lastError = String(e?.message ?? e).slice(0, 300);
      // Xodim botni bloklagan yoki hali Start bosmagan - keyingi safar unga yozilmaydi
      if (e?.tgCode === 403 || /chat not found/i.test(String(e?.message))) {
        await this.prisma.user.updateMany({ where: { telegramId: chatId }, data: { telegramCallBot: false } }).catch(() => undefined);
      }
      this.logger.warn(`Xabar yuborilmadi (${chatId}): ${e?.message ?? e}`);
      return false;
    }
  }

  /** Oxirgi xato (sababini sozlamalarda ko'rsatish uchun) */
  private lastError: string | null = null;

  /**
   * Lid haqidagi oxirgi xabar natijasi: Sozlamalarda "nega xabar kelmadi" savoliga javob.
   * result: sent - yuborildi, off - sozlamada o'chirilgan, noBot - bot yo'q, noRecipients - hech kim ulanmagan, failed - Telegram rad etdi.
   */
  async rememberLeadNotify(entry: { lead: string; result: "sent" | "off" | "noBot" | "noRecipients" | "failed"; sent?: number; total?: number }) {
    const value = JSON.stringify({ ...entry, at: new Date().toISOString(), error: entry.result === "failed" ? this.lastError : null });
    this.lastError = null;
    await this.prisma.appSetting.upsert({ where: { key: LAST_KEY }, create: { key: LAST_KEY, value }, update: { value } }).catch(() => undefined);
  }

  private async lastLeadNotify() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: LAST_KEY } });
    try { return row ? JSON.parse(row.value) : null; } catch { return null; }
  }

  /** Sinov xabari - administrator o'ziga yuboradi (bot va ulanish ishlayotganini tekshirish uchun). */
  async sendTest(userId: string) {
    if (!this.isEnabled()) throw new BadRequestException("Call-markaz boti hali ulanmagan.");
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, telegramId: true, telegramCallBot: true } });
    if (!u?.telegramId || !u.telegramCallBot) throw new BadRequestException("Avval o'z Telegram'ingizni botga ulang (\"Telegram'ni ulash\" tugmasi, keyin botda Start).");
    const ok = await this.notify(u.telegramId, `🔔 <b>Sinov xabari</b>\nWAFA Call-markaz boti ishlayapti. Yangi lidlar haqidagi xabarlar shu yerga keladi.`);
    if (!ok) throw new BadRequestException(`Telegram xabarni qabul qilmadi${this.lastError ? `: ${this.lastError}` : ""}. Botda /start ni qayta bosing.`);
    return { ok: true };
  }

  /** Lid xabarlari kimlarga boradi (Sozlamalarda ko'rsatish uchun) */
  private async recipientNames() {
    const own = this.isEnabled();
    const users = await this.prisma.user.findMany({
      where: { isActive: true, telegramId: { not: null }, role: { in: ["OPERATOR", "ADMIN"] }, ...(own ? { telegramCallBot: true } : {}) },
      select: { fullName: true, role: true },
    });
    const ops = users.filter((u) => u.role === "OPERATOR");
    return (ops.length ? ops : users.filter((u) => u.role === "ADMIN")).map((u) => u.fullName);
  }
}
