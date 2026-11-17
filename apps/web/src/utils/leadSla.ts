/** Lid muddatlari (server bilan bir xil): Toshkent vaqti, shanba-yakshanba hisobga olinmaydi. */
const TZ_OFFSET = 5 * 3600_000;
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const isWeekend = (ms: number) => { const d = new Date(ms + TZ_OFFSET).getUTCDay(); return d === 0 || d === 6; };
const nextMidnight = (ms: number) => { const local = ms + TZ_OFFSET; return local - (local % DAY) + DAY - TZ_OFFSET; };

/** Ikki vaqt orasidagi ish soatlari (dam olish kunlarisiz) */
export function businessHoursBetween(from: number, to: number): number {
  let t = from, total = 0;
  for (let guard = 0; t < to && guard < 4000; guard++) {
    const end = Math.min(nextMidnight(t), to);
    if (!isWeekend(t)) total += end - t;
    t = end;
  }
  return total / HOUR;
}

/** "5 soat" / "1 kun 3 soat" ko'rinishi uchun soat va kun */
export function splitHours(hours: number) {
  const h = Math.max(0, Math.round(hours));
  return { days: Math.floor(h / 24), hours: h % 24 };
}
