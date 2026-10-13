import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { BoardService } from "../board/board.service";
import { AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { TelegramService } from "./telegram.service";
import { escapeHtml, normalizeName, parseTaskText } from "./telegram-task-parser";

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
  reply_to_message?: { text?: string; caption?: string };
}

const PRIORITY_LABEL: Record<string, string> = { LOW: "Past", MEDIUM: "O'rta", HIGH: "Yuqori" };
const STATUS_LABEL: Record<string, string> = { TODO: "Rejada", IN_PROGRESS: "Jarayonda", REVIEW: "Tekshiruvda", DONE: "Bajarildi" };

const HELP = [
  "<b>EDO vazifalar boti</b>",
  "",
  "Vazifa qo'shish:",
  "• shaxsiy chatda — vazifa matnini yozing",
  "• guruhda — <code>/vazifa matn</code> yoki biror xabarga javob (reply) qilib <code>/vazifa</code>",
  "",
  "Matn ichida (ixtiyoriy):",
  "<code>!yuqori</code> / <code>!o'rta</code> / <code>!past</code> — muhimlik",
  "<code>#ertaga</code>, <code>#bugun</code>, <code>#2026-10-20</code> — muddat",
  "<code>@Familiya</code> — mas'ul xodim",
  "",
  "Vazifa qo'shilgach, xabar ostidagi tugmalar bilan muhimlikni o'zgartirishingiz mumkin (🔴 Yuqori · 🟡 O'rta · ⚪ Past).",
  "",
  "Buyruqlar: /mening — mening vazifalarim · /vafo — VAFO MOLIYA doskasiga qo'shish · /uzish — Telegram'ni uzish",
].join("\n");

/** Telegram xabarlarini qayta ishlaydi: hisobni ulash va doskaga vazifa qo'shish. */
@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger("TelegramBot");

  constructor(private prisma: PrismaService, private tg: TelegramService, private board: BoardService) {}

  async handleUpdate(update: any): Promise<void> {
    if (update?.callback_query) {
      return this.handleCallback(update.callback_query as TgCallback).catch((err) => this.logger.error(`Tugma bosilganda xato: ${err?.message ?? err}`));
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
    const cmd = this.parseCommand(text);
    if (cmd?.foreign) return; // boshqa botga yo'naltirilgan buyruq
    const chatId = msg.chat.id;

    if (cmd?.name === "start") {
      if (!isPrivate) return;
      if (cmd.args) return this.linkAccount(msg, cmd.args);
      return this.tg.sendMessage(chatId, HELP);
    }
    if (cmd && ["yordam", "help"].includes(cmd.name)) return this.tg.sendMessage(chatId, HELP);

    // Qolgan barcha amallar uchun foydalanuvchi EDO bilan ulangan bo'lishi shart
    const user = await this.prisma.user.findUnique({
      where: { telegramId: String(msg.from!.id) },
      include: { organizations: { include: { organization: { select: { id: true, name: true } } } } },
    });
    if (cmd || isPrivate) {
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
    if (!body) return this.tg.sendMessage(chatId, "Vazifa matnini yozing: <code>/vazifa Shartnomani tayyorlash !yuqori #ertaga</code>");

    const wantVafo = cmd?.name === "vafo";
    const orgs = user.organizations.map((o) => o.organization);
    const org = wantVafo
      ? orgs.find((o) => /vafo/i.test(o.name))
      : orgs.find((o) => /^wafa/i.test(o.name)) ?? orgs[0];
    if (!org) return this.tg.sendMessage(chatId, wantVafo ? "Sizda VAFO MOLIYA tashkilotiga kirish huquqi yo'q." : "Sizga tashkilot biriktirilmagan.");
    const actor: AuthenticatedUser = { id: user.id, email: user.email, role: user.role, organizationId: org.id };

    const parsed = parseTaskText(body, { botUsername: this.tg.getBotUsername() ?? undefined });
    if (!parsed.title) return this.tg.sendMessage(chatId, "Vazifa matni bo'sh.");

    // Mas'ulni ism bo'yicha topish (bir xil topilsa)
    let assignee: { id: string; fullName: string } | undefined;
    let note = "";
    if (parsed.assigneeToken) {
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
      { reply_markup: this.priorityKeyboard(task.id, task.priority), ...(msg.chat.type === "private" ? {} : { reply_to_message_id: msg.message_id }) },
    );
  }

  /** Vazifa kartochkasi matni (yaratilganda ham, muhimlik o'zgarganda ham shu ko'rinishda). */
  private renderTask(task: { title: string; priority: string; dueDate: Date | null; assignee: { fullName: string } | null; boardName: string; orgName: string }, note = "") {
    const details = [
      `Muhimlik: ${PRIORITY_LABEL[task.priority] ?? task.priority}`,
      task.dueDate ? `Muddat: ${new Date(task.dueDate).toISOString().slice(0, 10)}` : null,
      task.assignee ? `Mas'ul: ${escapeHtml(task.assignee.fullName)}` : null,
    ].filter(Boolean).join(" · ");
    return `✅ Vazifa qo'shildi\n<b>${escapeHtml(task.title)}</b>\n${escapeHtml(task.boardName)} · ${escapeHtml(task.orgName)}\n${details}${note}\n<a href="${this.tg.publicBaseUrl()}/board">Doskani ochish</a>`;
  }

  /** Muhimlikni tanlash tugmalari; joriy qiymat ✓ bilan belgilanadi. */
  private priorityKeyboard(taskId: string, current: string) {
    const btn = (p: "HIGH" | "MEDIUM" | "LOW", label: string) => ({ text: `${current === p ? "✓ " : ""}${label}`, callback_data: `p:${taskId}:${p}` });
    return { inline_keyboard: [[btn("HIGH", "🔴 Yuqori"), btn("MEDIUM", "🟡 O'rta"), btn("LOW", "⚪ Past")]] };
  }

  /** Inline tugma bosildi: vazifa muhimligini o'zgartirish. */
  private async handleCallback(cb: TgCallback) {
    const m = (cb.data ?? "").match(/^p:([A-Za-z0-9]{10,40}):(HIGH|MEDIUM|LOW)$/);
    if (!m || cb.from.is_bot) return this.tg.answerCallback(cb.id);
    const [, taskId, priority] = m;
    const user = await this.prisma.user.findUnique({
      where: { telegramId: String(cb.from.id) },
      include: { organizations: { select: { organizationId: true } } },
    });
    if (!user || !user.isActive) return this.tg.answerCallback(cb.id, "Avval Telegram'ni EDO bilan ulang.");
    const row = await this.prisma.boardTask.findUnique({ where: { id: taskId }, select: { organizationId: true } });
    if (!row || !user.organizations.some((o) => o.organizationId === row.organizationId)) return this.tg.answerCallback(cb.id, "Vazifa topilmadi.");

    const actor: AuthenticatedUser = { id: user.id, email: user.email, role: user.role, organizationId: row.organizationId };
    const task = await this.board.update(taskId, { priority } as any, actor);
    await this.tg.answerCallback(cb.id, `Muhimlik: ${PRIORITY_LABEL[priority]}`);
    if (cb.message) {
      const [board, org] = await Promise.all([
        this.prisma.board.findUnique({ where: { id: task.boardId ?? "" }, select: { name: true } }),
        this.prisma.organization.findUnique({ where: { id: task.organizationId }, select: { name: true } }),
      ]);
      await this.tg.editMessage(
        cb.message.chat.id, cb.message.message_id,
        this.renderTask({ ...task, boardName: board?.name ?? "Doska", orgName: org?.name ?? "" }),
        { reply_markup: this.priorityKeyboard(task.id, task.priority) },
      );
    }
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
