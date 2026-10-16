import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { BoardService } from "../board/board.service";
import { AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { TelegramService } from "./telegram.service";
import { escapeHtml, normalizeName, parseTaskText, todayTashkent } from "./telegram-task-parser";
import { addDaysFromToday, buildCalendar, isoDate, parseMonth } from "./telegram-calendar";

interface TgCallback {
  id: string;
  from: { id: number; is_bot?: boolean };
  data?: string;
  message?: { message_id: number; chat: { id: number; type: string } };
}

interface TgMessage {
  message_id: number;
  from?: { id: number; is_bot?: boolean; username?: string };
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  reply_to_message?: { message_id?: number; text?: string; caption?: string };
}

/** "Kimga vazifa?" bosqichlari: 1) xodimni tanlash, 2) vazifa matnini yozish (10 daqiqa ichida). */
interface PendingTask {
  orgId: string;
  orgName: string;
  /** Foydalanuvchi kira oladigan barcha tashkilotlar (bittadan ko'p bo'lsa - ro'yxatda tanlash tugmalari chiqadi) */
  orgs: { id: string; name: string }[];
  assigneeId: string | null;
  assigneeName: string | null;
  /** Oldindan yozilgan vazifa matni (bo'lsa - xodim tanlangach vazifa darhol yaratiladi) */
  text?: string;
  step: "pick" | "text";
  promptMessageId?: number;
  expires: number;
}
const PENDING_TTL_MS = 10 * 60_000;

/** Shaxsiy chatda doimiy turadigan tugmalar (pastki panel). */
const BTN_NEW = "➕ Yangi vazifa";
const BTN_MINE = "📋 Mening vazifalarim";
const MENU_KEYBOARD = { keyboard: [[{ text: BTN_NEW }, { text: BTN_MINE }]], resize_keyboard: true, is_persistent: true };
const PAGE_SIZE = 8;

const PRIORITY_LABEL: Record<string, string> = { LOW: "Past", MEDIUM: "O'rta", HIGH: "Yuqori" };
const STATUS_LABEL: Record<string, string> = { TODO: "Rejada", IN_PROGRESS: "Jarayonda", REVIEW: "Tekshiruvda", DONE: "Bajarildi" };

const HELP = [
  "<b>EDO vazifalar boti</b>",
  "",
  "Vazifa qo'shish:",
  "• <b>➕ Yangi vazifa</b> tugmasi yoki <code>/vazifa</code> — avval <b>kimga</b> ekanini tanlaysiz, keyin matnni yozasiz",
  "• vazifa matnini to'g'ridan-to'g'ri yozsangiz ham bot avval <b>kimga</b> ekanini so'raydi",
  "• guruhda — <code>/vazifa matn</code> yoki biror xabarga javob (reply) qilib <code>/vazifa</code>",
  "",
  "Matn ichida (ixtiyoriy):",
  "<code>!yuqori</code> / <code>!o'rta</code> / <code>!past</code> — muhimlik",
  "<code>#ertaga</code>, <code>#bugun</code>, <code>#2026-10-20</code> — muddat",
  "<code>@Familiya</code> — mas'ul xodim",
  "",
  "Vazifa qo'shilgach, xabar ostidagi tugmalar bilan muhimlikni (🔴 🟡 ⚪) va muddatni (Bugun, Ertaga, 📅 Kalendar) tanlashingiz mumkin.",
  "",
  "Buyruqlar: /mening — mening vazifalarim · /vafo — VAFO MOLIYA doskasiga qo'shish · /uzish — Telegram'ni uzish",
].join("\n");

/** Telegram xabarlarini qayta ishlaydi: hisobni ulash va doskaga vazifa qo'shish. */
@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger("TelegramBot");
  /** Suhbat bo'yicha (chat + foydalanuvchi) kutilayotgan vazifalar. Server qayta ishga tushsa, boshidan boshlanadi. */
  private pending = new Map<string, PendingTask>();
  private pendingKey = (chatId: number, userId: number) => `${chatId}:${userId}`;
  private getPending(chatId: number, userId: number): PendingTask | undefined {
    const key = this.pendingKey(chatId, userId);
    const p = this.pending.get(key);
    if (p && p.expires < Date.now()) { this.pending.delete(key); return undefined; }
    return p;
  }

  constructor(private prisma: PrismaService, private tg: TelegramService, private board: BoardService) {}

  async handleUpdate(update: any): Promise<void> {
    if (update?.callback_query) {
      try {
        await this.handleCallback(update.callback_query as TgCallback);
      } catch (err: any) {
        this.logger.error(`Tugma bosilganda xato: ${err?.message ?? err}`);
      }
      return;
    }
    const msg: TgMessage | undefined = update?.message;
    if (!msg?.chat || !msg.from || msg.from.is_bot) return;
    try {
      await this.handleMessage(msg);
    } catch (err: any) {
      this.logger.error(`Xabarni qayta ishlashda xato: ${err?.message ?? err}`);
      await this.tg.sendMessage(msg.chat.id, "⚠️ Xatolik yuz berdi, keyinroq qayta urinib ko'ring.");
    }
  }

  private parseCommand(text: string): { name: string; args: string; foreign: boolean } | null {
    const m = text.match(/^\/([A-Za-z_]+)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/);
    if (!m) return null;
    const bot = this.tg.getBotUsername()?.toLowerCase();
    return { name: m[1].toLowerCase(), args: (m[3] ?? "").trim(), foreign: !!m[2] && !!bot && m[2].toLowerCase() !== bot };
  }

  private async handleMessage(msg: TgMessage) {
    const text = (msg.text ?? msg.caption ?? "").trim();
    if (!text) return;
    const isPrivate = msg.chat.type === "private";
    // Pastki paneldagi tugmalar buyruqqa tenglashtiriladi
    const cmd = text === BTN_NEW ? { name: "vazifa", args: "", foreign: false }
      : text === BTN_MINE ? { name: "mening", args: "", foreign: false }
      : this.parseCommand(text);
    if (cmd?.foreign) return; // boshqa botga yo'naltirilgan buyruq
    const chatId = msg.chat.id;

    if (cmd?.name === "start") {
      if (!isPrivate) return;
      if (cmd.args) return this.linkAccount(msg, cmd.args);
      return this.tg.sendMessage(chatId, HELP, { reply_markup: MENU_KEYBOARD });
    }
    if (cmd && ["yordam", "help"].includes(cmd.name)) return this.tg.sendMessage(chatId, HELP, isPrivate ? { reply_markup: MENU_KEYBOARD } : {});

    // Qolgan barcha amallar uchun foydalanuvchi EDO bilan ulangan bo'lishi shart
    const user = await this.prisma.user.findUnique({
      where: { telegramId: String(msg.from!.id) },
      include: { organizations: { include: { organization: { select: { id: true, name: true } } } } },
    });
    const pendingNow = this.getPending(chatId, msg.from!.id);
    if (cmd || isPrivate || pendingNow) {
      if (!user || !user.isActive) {
        return this.tg.sendMessage(chatId, `Avval Telegram'ni EDO bilan ulang: EDO → Vazifalar doskasi → <b>Telegram</b> tugmasi.\n${this.tg.publicBaseUrl()}/board`);
      }
    } else {
      return; // guruhdagi oddiy suhbatga aralashmaymiz
    }
    if (!user) return;

    if (cmd?.name === "uzish") {
      if (!isPrivate) return;
      await this.prisma.user.update({ where: { id: user.id }, data: { telegramId: null, telegramUsername: null } });
      return this.tg.sendMessage(chatId, "Telegram EDO'dan uzildi.");
    }
    if (cmd?.name === "mening") return this.myTasks(chatId, user.id);

    if (cmd && !["vazifa", "vafo", "task"].includes(cmd.name)) {
      return this.tg.sendMessage(chatId, "Noma'lum buyruq. /yordam");
    }

    // ---- vazifa yaratish ----
    const replied = (msg.reply_to_message?.text ?? msg.reply_to_message?.caption ?? "").trim();
    const body = cmd ? [cmd.args, replied].filter(Boolean).join("\n") : text;

    const wantVafo = cmd?.name === "vafo";
    const orgs = user.organizations.map((o) => o.organization);
    const org = wantVafo
      ? orgs.find((o) => /vafo/i.test(o.name))
      : orgs.find((o) => /^wafa/i.test(o.name)) ?? orgs[0];

    // "Kimga?" bosqichidan keyin yozilgan matn: tanlangan xodim bilan vazifa yaratiladi
    if (!cmd && pendingNow?.step === "text") {
      this.pending.delete(this.pendingKey(chatId, msg.from!.id));
      const pOrg = user.organizations.map((o) => o.organization).find((o) => o.id === pendingNow.orgId);
      if (!pOrg) return this.tg.sendMessage(chatId, "Tashkilot topilmadi. /vazifa dan qaytadan boshlang.");
      return this.createTask(msg, user, pOrg, text, pendingNow.assigneeId ? { id: pendingNow.assigneeId, fullName: pendingNow.assigneeName ?? "" } : undefined);
    }

    // Matnsiz /vazifa (yoki /vafo): avval kimga ekanini tanlash
    if (cmd && !body) {
      if (!org) return this.tg.sendMessage(chatId, wantVafo ? "Sizda VAFO MOLIYA tashkilotiga kirish huquqi yo'q." : "Sizga tashkilot biriktirilmagan.");
      return this.startGuided(msg, org, orgs);
    }
    if (!org) return this.tg.sendMessage(chatId, wantVafo ? "Sizda VAFO MOLIYA tashkilotiga kirish huquqi yo'q." : "Sizga tashkilot biriktirilmagan.");
    // Matnda @Familiya bilan mas'ul ko'rsatilgan bo'lsa - darhol yaratiladi, aks holda avval "Kimga?" so'raladi
    if (parseTaskText(body, { botUsername: this.tg.getBotUsername() ?? undefined }).assigneeToken) return this.createTask(msg, user, org, body);
    return this.startGuided(msg, org, orgs, body);
  }

  /** Vazifani matndan yaratadi; `forcedAssignee` berilsa (Kimga? bosqichi), @belgi e'tiborga olinmaydi. */
  private async createTask(
    msg: TgMessage,
    user: { id: string; email: string; role: string; fullName: string },
    org: { id: string; name: string },
    body: string,
    forcedAssignee?: { id: string; fullName: string },
  ) {
    const chatId = msg.chat.id;
    const actor: AuthenticatedUser = { id: user.id, email: user.email, role: user.role, organizationId: org.id };

    const parsed = parseTaskText(body, { botUsername: this.tg.getBotUsername() ?? undefined });
    if (!parsed.title) return this.tg.sendMessage(chatId, "Vazifa matni bo'sh.");

    // Mas'ulni ism bo'yicha topish (bir xil topilsa)
    let assignee: { id: string; fullName: string } | undefined = forcedAssignee;
    let note = "";
    if (!forcedAssignee && parsed.assigneeToken) {
      const token = normalizeName(parsed.assigneeToken);
      const candidates = (await this.board.users(org.id)).filter((u) => normalizeName(u.fullName).split(/\s+/).some((w) => w.startsWith(token)));
      if (candidates.length === 1) assignee = candidates[0];
      else note = candidates.length === 0 ? `\n⚠️ Mas'ul topilmadi: «${escapeHtml(parsed.assigneeToken)}»` : `\n⚠️ «${escapeHtml(parsed.assigneeToken)}» bo'yicha bir nechta xodim topildi, mas'ul belgilanmadi`;
    }

    const boards = await this.board.listBoards(actor);
    const shared = boards.find((b) => b.ownerId === null) ?? boards[0];
    const task = await this.board.create(
      { boardId: shared.id, title: parsed.title, description: parsed.description, priority: parsed.priority, dueDate: parsed.dueDate, assigneeId: assignee?.id } as any,
      actor,
    );

    await this.tg.sendMessage(
      chatId,
      this.renderTask({ ...task, boardName: shared.name, orgName: org.name }, note),
      { reply_markup: this.mainKeyboard(task.id, task.priority, task.dueDate), ...(msg.chat.type === "private" ? {} : { reply_to_message_id: msg.message_id }) },
    );
  }

  // ---------- "Kimga?" - xodimni tanlab vazifa yozish ----------

  private employeeKeyboard(users: { id: string; fullName: string }[], page: number, orgs: { id: string; name: string }[] = [], currentOrgId = "") {
    const pages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
    const p = Math.min(Math.max(page, 0), pages - 1);
    const slice = users.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
    const rows: { text: string; callback_data: string }[][] = [];
    // Bir nechta tashkilot bo'lsa - qaysi korxona uchun ekani yuqorida tanlanadi
    if (orgs.length > 1) {
      for (const o of orgs) rows.push([{ text: `${o.id === currentOrgId ? "✓ " : ""}🏢 ${o.name}`, callback_data: `o:${o.id}` }]);
    }
    for (let i = 0; i < slice.length; i += 2) {
      rows.push(slice.slice(i, i + 2).map((u) => ({ text: u.fullName.length > 28 ? `${u.fullName.slice(0, 27)}…` : u.fullName, callback_data: `a:${u.id}` })));
    }
    if (pages > 1) {
      rows.push([
        p > 0 ? { text: "◀", callback_data: `ap:${p - 1}` } : { text: " ", callback_data: "n" },
        { text: `${p + 1}/${pages}`, callback_data: "n" },
        p < pages - 1 ? { text: "▶", callback_data: `ap:${p + 1}` } : { text: " ", callback_data: "n" },
      ]);
    }
    rows.push([{ text: "👤 Mas'ulsiz (umumiy)", callback_data: "a:-" }, { text: "✖ Bekor qilish", callback_data: "ax" }]);
    return { inline_keyboard: rows };
  }

  private pickText(p: { orgName: string; text?: string }) {
    const preview = p.text ? `\n«${escapeHtml(p.text.replace(/\s+/g, " ").slice(0, 120))}${p.text.length > 120 ? "…" : ""}»` : "";
    return `🏢 <b>${escapeHtml(p.orgName)}</b>\n👥 <b>Vazifa kimga?</b>${preview}\nXodimni tanlang:`;
  }

  private async startGuided(msg: TgMessage, org: { id: string; name: string }, orgs: { id: string; name: string }[], text?: string) {
    const users = await this.board.users(org.id);
    const p: PendingTask = { orgId: org.id, orgName: org.name, orgs, assigneeId: null, assigneeName: null, text, step: "pick", expires: Date.now() + PENDING_TTL_MS };
    this.pending.set(this.pendingKey(msg.chat.id, msg.from!.id), p);
    await this.tg.sendMessage(
      msg.chat.id,
      this.pickText(p),
      { reply_markup: this.employeeKeyboard(users, 0, p.orgs, p.orgId), ...(msg.chat.type === "private" ? {} : { reply_to_message_id: msg.message_id }) },
    );
  }

  /** a:<userId|-> | ap:<sahifa> | ax - "Kimga?" ro'yxati tugmalari. Faqat suhbatni boshlagan foydalanuvchi bosa oladi. */
  private async handlePickCallback(cb: TgCallback, data: string) {
    if (!cb.message) return this.tg.answerCallback(cb.id);
    const chatId = cb.message.chat.id;
    const p = this.getPending(chatId, cb.from.id);
    if (!p || p.step !== "pick") return this.tg.answerCallback(cb.id, "Bu ro'yxat sizniki emas yoki eskirgan. /vazifa dan qaytadan boshlang.");

    if (data === "ax") {
      this.pending.delete(this.pendingKey(chatId, cb.from.id));
      await this.tg.answerCallback(cb.id, "Bekor qilindi");
      return this.tg.editMessage(chatId, cb.message.message_id, "✖ Bekor qilindi.");
    }
    // Korxonani almashtirish: xodimlar ro'yxati tanlangan korxonaniki bo'ladi
    if (data.startsWith("o:")) {
      const target = p.orgs.find((o) => o.id === data.slice(2));
      if (!target) return this.tg.answerCallback(cb.id, "Korxona topilmadi.");
      p.orgId = target.id;
      p.orgName = target.name;
      p.expires = Date.now() + PENDING_TTL_MS;
      await this.tg.answerCallback(cb.id, target.name);
      const orgUsers = await this.board.users(p.orgId);
      return this.tg.editMessage(chatId, cb.message.message_id, this.pickText(p), { reply_markup: this.employeeKeyboard(orgUsers, 0, p.orgs, p.orgId) });
    }
    const users = await this.board.users(p.orgId);
    if (data.startsWith("ap:")) {
      await this.tg.answerCallback(cb.id);
      return this.tg.editMessage(chatId, cb.message.message_id, this.pickText(p), { reply_markup: this.employeeKeyboard(users, parseInt(data.slice(3), 10) || 0, p.orgs, p.orgId) });
    }
    const id = data.slice(2);
    const chosen = id === "-" ? null : users.find((u) => u.id === id);
    if (id !== "-" && !chosen) return this.tg.answerCallback(cb.id, "Xodim topilmadi.");
    p.assigneeId = chosen?.id ?? null;
    p.assigneeName = chosen?.fullName ?? null;
    p.expires = Date.now() + PENDING_TTL_MS;
    await this.tg.answerCallback(cb.id, chosen ? chosen.fullName : "Mas'ulsiz");
    await this.tg.editMessage(chatId, cb.message.message_id, `🏢 <b>${escapeHtml(p.orgName)}</b>\n👤 Mas'ul: <b>${chosen ? escapeHtml(chosen.fullName) : "belgilanmagan (umumiy)"}</b>`);

    // Matn oldindan yozilgan bo'lsa - vazifa darhol yaratiladi
    if (p.text) {
      this.pending.delete(this.pendingKey(chatId, cb.from.id));
      const user = await this.prisma.user.findUnique({ where: { telegramId: String(cb.from.id) }, select: { id: true, email: true, role: true, fullName: true, isActive: true } });
      if (!user || !user.isActive) return;
      return this.createTask(
        { message_id: cb.message.message_id, chat: cb.message.chat, from: { id: cb.from.id } },
        user, { id: p.orgId, name: p.orgName }, p.text,
        chosen ? { id: chosen.id, fullName: chosen.fullName } : undefined,
      );
    }
    p.step = "text";
    // Guruhda faqat javob (reply) xabarlari yetib keladi, shuning uchun majburiy javob (force_reply) so'raladi
    const prompt = await this.tg.sendMessage(
      chatId,
      `✍️ Endi vazifa matnini yozing (🏢 <b>${escapeHtml(p.orgName)}</b>).\n<i>Birinchi qator — sarlavha. Ixtiyoriy: !yuqori, #ertaga, #2026-10-20</i>`,
      { reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Vazifa matni..." }, reply_to_message_id: cb.message.message_id },
    );
    p.promptMessageId = prompt?.message_id;
  }

  /** Vazifa kartochkasi matni (yaratilganda ham, tugmalar bosilganda ham shu ko'rinishda). */
  private renderTask(task: { title: string; priority: string; dueDate: Date | null; assignee: { fullName: string } | null; creator?: { fullName: string } | null; boardName: string; orgName: string }, note = "") {
    const details = [
      `Muhimlik: ${PRIORITY_LABEL[task.priority] ?? task.priority}`,
      `Muddat: ${task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "belgilanmagan"}`,
    ].join(" · ");
    const people = [
      task.assignee ? `Mas'ul: ${escapeHtml(task.assignee.fullName)}` : null,
      task.creator ? `Yozdi: ${escapeHtml(task.creator.fullName)}` : null,
    ].filter(Boolean).join(" · ");
    return `✅ Vazifa qo'shildi\n🏢 <b>${escapeHtml(task.orgName)}</b> · ${escapeHtml(task.boardName)}\n<b>${escapeHtml(task.title)}</b>\n${details}${people ? "\n" + people : ""}${note}\n<a href="${this.tg.publicBaseUrl()}/board">Doskani ochish</a>`;
  }

  /** Asosiy tugmalar: muhimlik, tez muddatlar (Bugun / Ertaga / 3 kun / Hafta) va kalendar. */
  private mainKeyboard(taskId: string, priority: string, dueDate: Date | null) {
    const pr = (p: "HIGH" | "MEDIUM" | "LOW", label: string) => ({ text: `${priority === p ? "✓ " : ""}${label}`, callback_data: `p:${taskId}:${p}` });
    const due = dueDate ? new Date(dueDate).toISOString().slice(0, 10) : null;
    const quick = (days: number, label: string) => ({ text: `${due === addDaysFromToday(days) ? "✓ " : ""}${label}`, callback_data: `q:${taskId}:${days}` });
    return {
      inline_keyboard: [
        [pr("HIGH", "🔴 Yuqori"), pr("MEDIUM", "🟡 O'rta"), pr("LOW", "⚪ Past")],
        [quick(0, "Bugun"), quick(1, "Ertaga"), quick(3, "3 kun"), quick(7, "Hafta")],
        [{ text: due ? `📅 Kalendar (${due})` : "📅 Kalendar", callback_data: `c:${taskId}:${(due ?? addDaysFromToday(0)).slice(0, 7)}` }],
      ],
    };
  }

  /** Inline tugmalar: muhimlik (p), tez muddat (q), kalendar (c, d, x, k), xodim tanlash (a, ap, ax). */
  private async handleCallback(cb: TgCallback) {
    const data = cb.data ?? "";
    if (cb.from.is_bot) return;
    if (data === "n") return this.tg.answerCallback(cb.id);
    if (/^(a:[0-9a-fA-F-]{1,36}|a:-|ap:\d{1,3}|ax|o:[A-Za-z0-9]{10,40})$/.test(data)) return this.handlePickCallback(cb, data);

    const m = data.match(/^([pqcdxk]):([A-Za-z0-9]{10,40})(?::([A-Za-z0-9-]{1,10}))?$/);
    if (!m) return this.tg.answerCallback(cb.id);
    const [, kind, taskId, arg] = m;

    const user = await this.prisma.user.findUnique({
      where: { telegramId: String(cb.from.id) },
      include: { organizations: { select: { organizationId: true } } },
    });
    if (!user || !user.isActive) return this.tg.answerCallback(cb.id, "Avval Telegram'ni EDO bilan ulang.");
    const row = await this.prisma.boardTask.findUnique({ where: { id: taskId }, select: { organizationId: true } });
    if (!row || !user.organizations.some((o) => o.organizationId === row.organizationId)) return this.tg.answerCallback(cb.id, "Vazifa topilmadi.");
    const actor: AuthenticatedUser = { id: user.id, email: user.email, role: user.role, organizationId: row.organizationId };

    let answer: string | undefined;
    let view: "main" | { y: number; m: number } = "main";
    let task: Awaited<ReturnType<BoardService["update"]>>;

    if (kind === "p" && (arg === "HIGH" || arg === "MEDIUM" || arg === "LOW")) {
      task = await this.board.update(taskId, { priority: arg } as any, actor);
      answer = `Muhimlik: ${PRIORITY_LABEL[arg]}`;
    } else if (kind === "q" && arg && /^\d{1,3}$/.test(arg)) {
      const date = addDaysFromToday(parseInt(arg, 10));
      task = await this.board.update(taskId, { dueDate: date } as any, actor);
      answer = `Muddat: ${date}`;
    } else if (kind === "d" && arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) && parseMonth(arg)) {
      task = await this.board.update(taskId, { dueDate: arg } as any, actor);
      answer = `Muddat: ${arg}`;
    } else if (kind === "x") {
      task = await this.board.update(taskId, { dueDate: null } as any, actor);
      answer = "Muddat olib tashlandi";
    } else if (kind === "c" && arg && parseMonth(arg)) {
      // faqat kalendarni ko'rsatish - vazifa o'zgarmaydi
      const pm = parseMonth(arg)!;
      const now = todayTashkent();
      view = pm.y * 12 + pm.m < now.y * 12 + now.m ? { y: now.y, m: now.m } : pm;
      task = (await this.board.update(taskId, {} as any, actor));
    } else if (kind === "k") {
      task = await this.board.update(taskId, {} as any, actor);
    } else {
      return this.tg.answerCallback(cb.id);
    }

    await this.tg.answerCallback(cb.id, answer);
    if (!cb.message) return;
    const [board, org] = await Promise.all([
      this.prisma.board.findUnique({ where: { id: task.boardId ?? "" }, select: { name: true } }),
      this.prisma.organization.findUnique({ where: { id: task.organizationId }, select: { name: true } }),
    ]);
    const due = task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : null;
    await this.tg.editMessage(
      cb.message.chat.id, cb.message.message_id,
      this.renderTask({ ...task, boardName: board?.name ?? "Doska", orgName: org?.name ?? "" }),
      { reply_markup: view === "main" ? this.mainKeyboard(task.id, task.priority, task.dueDate) : buildCalendar(task.id, view.y, view.m, due) },
    );
  }

  private async linkAccount(msg: TgMessage, code: string) {
    const chatId = msg.chat.id;
    const hash = crypto.createHash("sha256").update(code.trim()).digest("hex");
    const row = await this.prisma.telegramLinkCode.findUnique({ where: { codeHash: hash }, include: { user: { select: { id: true, fullName: true, isActive: true } } } });
    if (!row || row.expiresAt < new Date() || !row.user.isActive) {
      return this.tg.sendMessage(chatId, "Havola eskirgan yoki noto'g'ri. EDO'da <b>Telegram</b> tugmasini bosib, yangi havola oling.");
    }
    const tgId = String(msg.from!.id);
    const holder = await this.prisma.user.findUnique({ where: { telegramId: tgId }, select: { id: true, fullName: true } });
    if (holder && holder.id !== row.user.id) {
      return this.tg.sendMessage(chatId, `Bu Telegram hisobi allaqachon boshqa foydalanuvchiga (${escapeHtml(holder.fullName)}) ulangan. Avval u yerda uzing.`);
    }
    await this.prisma.user.update({ where: { id: row.user.id }, data: { telegramId: tgId, telegramUsername: msg.from!.username ?? null } });
    await this.prisma.telegramLinkCode.deleteMany({ where: { userId: row.user.id } });
    await this.tg.sendMessage(chatId, `✅ Ulandi: <b>${escapeHtml(row.user.fullName)}</b>\n\n${HELP}`);
  }

  private async myTasks(chatId: number, userId: string) {
    const tasks = await this.prisma.boardTask.findMany({
      where: { assigneeId: userId, status: { not: "DONE" } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 10,
    });
    if (!tasks.length) return this.tg.sendMessage(chatId, "Sizga biriktirilgan ochiq vazifa yo'q 🎉");
    const lines = tasks.map((t) => {
      const due = t.dueDate ? ` — ${t.dueDate.toISOString().slice(0, 10)}` : "";
      return `• ${escapeHtml(t.title.slice(0, 120))} <i>(${STATUS_LABEL[t.status] ?? t.status}${due})</i>`;
    });
    await this.tg.sendMessage(chatId, `<b>Mening vazifalarim</b>\n${lines.join("\n")}`);
  }
}
