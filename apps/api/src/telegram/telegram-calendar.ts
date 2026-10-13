import { todayTashkent } from "./telegram-task-parser";

const MONTHS_UZ = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"];
const WEEKDAYS_UZ = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

export interface InlineButton { text: string; callback_data: string }

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** "2026-10" yoki "2026-10-20" -> {y, m}; noto'g'ri bo'lsa null. */
export function parseMonth(s: string): { y: number; m: number } | null {
  const mt = s.match(/^(\d{4})-(\d{2})/);
  if (!mt) return null;
  const y = +mt[1], m = +mt[2];
  return m >= 1 && m <= 12 && y >= 2000 && y <= 2100 ? { y, m } : null;
}

/** Bugundan (Toshkent) N kun keyingi sana, YYYY-MM-DD. */
export function addDaysFromToday(days: number, now: Date = new Date()): string {
  const t = todayTashkent(now);
  const d = new Date(Date.UTC(t.y, t.m - 1, t.d + days));
  return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Inline kalendar (oy ko'rinishi, hafta Dushanbadan). O'tib ketgan kunlar bosilmaydi ("·"),
 * bugun - [13], tanlangan muddat - ✓13. Callback'lar:
 *   n - hech narsa, c:<id>:YYYY-MM - oy almashtirish, d:<id>:YYYY-MM-DD - sanani tanlash,
 *   x:<id> - muddatni olib tashlash, k:<id> - orqaga.
 */
export function buildCalendar(taskId: string, y: number, m: number, selected: string | null, now: Date = new Date()): { inline_keyboard: InlineButton[][] } {
  const today = todayTashkent(now);
  const todayIso = isoDate(today.y, today.m, today.d);
  const noop = (text: string): InlineButton => ({ text, callback_data: "n" });

  const prev = new Date(Date.UTC(y, m - 2, 1));
  const next = new Date(Date.UTC(y, m, 1));
  const canGoBack = prev.getUTCFullYear() * 12 + prev.getUTCMonth() >= today.y * 12 + (today.m - 1);
  const monthKey = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;

  const rows: InlineButton[][] = [
    [
      canGoBack ? { text: "◀", callback_data: `c:${taskId}:${monthKey(prev)}` } : noop(" "),
      noop(`📅 ${MONTHS_UZ[m - 1]} ${y}`),
      { text: "▶", callback_data: `c:${taskId}:${monthKey(next)}` },
    ],
    WEEKDAYS_UZ.map(noop),
  ];

  const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // 0 = Dushanba
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let week: InlineButton[] = Array.from({ length: firstDow }, () => noop(" "));
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = isoDate(y, m, d);
    let btn: InlineButton;
    if (iso < todayIso) btn = noop("·");
    else {
      const label = iso === selected ? `✓${d}` : iso === todayIso ? `[${d}]` : String(d);
      btn = { text: label, callback_data: `d:${taskId}:${iso}` };
    }
    week.push(btn);
    if (week.length === 7) { rows.push(week); week = []; }
  }
  if (week.length) { while (week.length < 7) week.push(noop(" ")); rows.push(week); }

  rows.push([
    { text: "🚫 Muddatsiz", callback_data: `x:${taskId}` },
    { text: "↩ Orqaga", callback_data: `k:${taskId}` },
  ]);
  return { inline_keyboard: rows };
}
