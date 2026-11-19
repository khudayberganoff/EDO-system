import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CallTelegramService } from "../telegram/call-telegram.service";
import { escapeHtml } from "../telegram/telegram-task-parser";
import { siteMode } from "../common/site-mode";

/** Qayta aloqa belgilanadigan bosqichlar */
const STAGES: Record<string, string> = { INFO_GIVEN: "Ma'lumot berildi", CALLBACK: "Qayta bog'lanish" };
/** Server o'chib turgan bo'lsa ham shuncha vaqt ichidagi o'tkazib yuborilgan eslatmalar yuboriladi (eskilari emas) */
const CATCH_UP_MS = 12 * 3600_000;

/**
 * Qayta aloqa eslatmalari: "Ma'lumot berildi" va "Qayta bog'lanish" bosqichidagi lidning qayta aloqa vaqti kelganda
 * Call-markaz Telegram boti mas'ul xodimga (u bo'lmasa operatorlarga, ular ham bo'lmasa administratorlarga) xabar yuboradi.
 */
@Injectable()
export class LeadRemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("LeadReminders");
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private prisma: PrismaService, private telegram: CallTelegramService) {}

  onModuleInit() {
    if (siteMode() === "edo") return; // alohida EDO serverida Call-markaz yo'q
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick(now = new Date()) {
    if (this.running || !this.telegram.canNotify()) return 0;
    this.running = true;
    let sent = 0;
    try {
      const due = await this.prisma.callLead.findMany({
        where: {
          stage: { in: Object.keys(STAGES) },
          callbackAt: { lte: now, gte: new Date(now.getTime() - CATCH_UP_MS) },
          callbackRemindedAt: null,
        },
        orderBy: { callbackAt: "asc" },
        take: 50,
      });
      if (!due.length) return 0;
      const base = await this.telegram.publicBase();
      for (const l of due) {
        // Avval belgilanadi - xato bo'lsa ham bir eslatma qayta-qayta yuborilmaydi
        await this.prisma.callLead.update({ where: { id: l.id }, data: { callbackRemindedAt: now } });
        const chats = await this.telegram.recipients({ userId: l.ownerId, roles: ["OPERATOR", "ADMIN"] });
        const time = new Date(l.callbackAt!.getTime() + 5 * 3600_000).toISOString().slice(11, 16); // Toshkent vaqti
        const text = [
          `⏰ <b>Qayta aloqa vaqti</b> · ${time}`,
          `<b>${escapeHtml(l.name)}</b>`,
          l.phone ? `📞 ${escapeHtml(l.phone)}` : "",
          `Bosqich: ${STAGES[l.stage]}`,
          l.note ? `📝 ${escapeHtml(l.note.split("\n")[0].slice(0, 200))}` : "",
          base ? `<a href="${base}/calls">Call-markazda ochish</a>` : "",
        ].filter(Boolean).join("\n");
        for (const chat of chats.slice(0, 20)) if (await this.telegram.notify(chat, text)) sent++;
      }
      return sent;
    } catch (e: any) {
      this.logger.warn(`Eslatmalar yuborilmadi: ${e?.message ?? e}`);
      return sent;
    } finally {
      this.running = false;
    }
  }
}
