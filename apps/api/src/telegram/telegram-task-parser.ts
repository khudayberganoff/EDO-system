/**
 * Telegram xabaridan vazifa tuzish: matndagi belgilar ajratib olinadi.
 *   !yuqori / !o'rta / !past  - muhimlik
 *   #2026-10-20, #20.10.2026, #bugun, #ertaga  - muddat
 *   @Familiya  - mas'ul (EDO foydalanuvchisi ismi bo'yicha qidiriladi)
 * Qolgan matn: birinchi qator - sarlavha, keyingilari - tavsif.
 */
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

export interface ParsedTask {
  title: string;
  description?: string;
  priority?: TaskPriority;
  /** YYYY-MM-DD */
  dueDate?: string;
  /** "@belgi"dan keyingi so'z (mas'ul qidirish uchun) */
  assigneeToken?: string;
}

const PRIORITY_WORDS: Record<string, TaskPriority> = {
  yuqori: "HIGH", tez: "HIGH", high: "HIGH", muhim: "HIGH",
  orta: "MEDIUM", "o'rta": "MEDIUM", "o‘rta": "MEDIUM", medium: "MEDIUM",
  past: "LOW", low: "LOW",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Toshkent vaqti bo'yicha bugungi sana (UTC+5, yozgi vaqt yo'q). */
export function todayTashkent(now: Date = new Date()): { y: number; m: number; d: number } {
  const t = new Date(now.getTime() + 5 * 3_600_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function addDays(y: number, m: number, d: number, days: number): string {
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

function validDate(y: number, m: number, d: number): string | undefined {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return undefined;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseTaskText(raw: string, opts: { botUsername?: string; now?: Date } = {}): ParsedTask {
  let text = raw.replace(/\r/g, "");
  let priority: TaskPriority | undefined;
  let dueDate: string | undefined;
  let assigneeToken: string | undefined;
  const today = todayTashkent(opts.now);

  // !muhimlik
  text = text.replace(/(^|\s)!([\p{L}'‘’]+)/gu, (whole, pre: string, word: string) => {
    const p = PRIORITY_WORDS[word.toLowerCase().replace(/[‘’]/g, "'")];
    if (!p) return whole;
    priority = priority ?? p;
    return pre;
  });

  // #muddat
  text = text.replace(/(^|\s)#([\p{L}\d.\-]+)/gu, (whole, pre: string, word: string) => {
    const w = word.toLowerCase();
    let found: string | undefined;
    if (w === "bugun") found = addDays(today.y, today.m, today.d, 0);
    else if (w === "ertaga") found = addDays(today.y, today.m, today.d, 1);
    else {
      const iso = w.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const dmy = w.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (iso) found = validDate(+iso[1], +iso[2], +iso[3]);
      else if (dmy) found = validDate(+dmy[3], +dmy[2], +dmy[1]);
    }
    if (!found) return whole;
    dueDate = dueDate ?? found;
    return pre;
  });

  // @mas'ul (botning o'z nomi hisobga olinmaydi)
  const bot = opts.botUsername?.toLowerCase();
  text = text.replace(/(^|\s)@([\p{L}\d_'‘’\-]{3,})/gu, (whole, pre: string, word: string) => {
    if (bot && word.toLowerCase() === bot) return pre;
    assigneeToken = assigneeToken ?? word;
    return pre;
  });

  const lines = text.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim());
  const firstIdx = lines.findIndex((l) => l.length > 0);
  if (firstIdx === -1) return { title: "", priority, dueDate, assigneeToken };
  let title = lines[firstIdx];
  let rest = lines.slice(firstIdx + 1).join("\n").trim();
  if (title.length > 300) {
    rest = `${title.slice(300)}${rest ? "\n" + rest : ""}`.trim();
    title = `${title.slice(0, 299)}…`;
  }
  return { title, description: rest ? rest.slice(0, 5000) : undefined, priority, dueDate, assigneeToken };
}

/** Ism bo'yicha qidirish uchun: kichik harf, apostrof turlari bir xil. */
export const normalizeName = (s: string) => s.toLowerCase().replace(/[‘’`ʻʼ]/g, "'");

/** Telegram HTML rejimi uchun maxsus belgilarni almashtiradi. */
export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
