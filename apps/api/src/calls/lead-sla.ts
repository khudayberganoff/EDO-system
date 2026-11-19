/**
 * Lidlar bo'yicha ish muddatlari (SLA). Vaqt faqat ISH VAQTIDA hisoblanadi (Toshkent vaqti):
 * ish kunlari (dushanba-juma, ish kuniga ko'chirilgan kunlar bilan), bayram kunlarisiz, kuniga ish soatlari
 * oralig'ida (standart 09:00-18:00). Muddatlar:
 *  - yangi lidga javob (bosqich o'zgartirildi yoki qo'ng'iroq qilindi) - standart 8 ish soati (1 ish kuni);
 *  - natija: uchrashuv belgilanishi (yoki undan keyingi bosqich) yoki "Sifatsiz lead" - standart 72 ish soati.
 * "Ma'lumot berildi" bosqichidagi lidlarga muddat qo'llanmaydi: ular uchun qayta aloqa vaqti belgilanadi.
 */
export const PAUSED_STAGES = ["INFO_GIVEN"];
export const RESOLVED_STAGES = ["MEETING", "VISITED", "CONTRACT", "UNQUALIFIED"];

export interface SlaConfig {
  /** Ish boshlanishi va tugashi, "HH:MM" */
  workStart: string;
  workEnd: string;
  /** Javob muddati (ish soatlarida) */
  responseHours: number;
  /** Natija muddati (ish soatlarida) */
  resolveHours: number;
}

export const DEFAULT_SLA: SlaConfig = { workStart: "09:00", workEnd: "18:00", responseHours: 8, resolveHours: 72 };

/** Ish kalendari: ish soatlari va bayram / ko'chirilgan ish kunlari ("YYYY-MM-DD") */
export interface WorkCalendar {
  startMin: number;
  endMin: number;
  holidays: Set<string>;
  workdays: Set<string>;
}

const TZ_OFFSET = 5 * 3600_000; // Asia/Tashkent, yozgi vaqt yo'q
const MIN = 60_000;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function makeCalendar(cfg: SlaConfig, holidays: { date: Date; type: string }[]): WorkCalendar {
  const key = (d: Date) => d.toISOString().slice(0, 10);
  return {
    startMin: toMin(cfg.workStart),
    endMin: toMin(cfg.workEnd),
    holidays: new Set(holidays.filter((h) => h.type !== "WORKDAY").map((h) => key(h.date))),
    workdays: new Set(holidays.filter((h) => h.type === "WORKDAY").map((h) => key(h.date))),
  };
}

/** Mahalliy (Toshkent) kun boshlanishi (UTC ms) */
const dayStart = (ms: number) => {
  const local = ms + TZ_OFFSET;
  return local - (local % DAY) - TZ_OFFSET;
};
const dayKey = (ms: number) => new Date(ms + TZ_OFFSET).toISOString().slice(0, 10);

function isWorkingDay(ms: number, cal: WorkCalendar) {
  const k = dayKey(ms);
  if (cal.holidays.has(k)) return false;
  if (cal.workdays.has(k)) return true;
  const wd = new Date(ms + TZ_OFFSET).getUTCDay();
  return wd !== 0 && wd !== 6;
}

/** Shu kundagi ish vaqti oralig'i [boshi, oxiri] (UTC ms) yoki null (ish kuni emas) */
function workWindow(ms: number, cal: WorkCalendar): [number, number] | null {
  if (!isWorkingDay(ms, cal) || cal.endMin <= cal.startMin) return null;
  const d = dayStart(ms);
  return [d + cal.startMin * MIN, d + cal.endMin * MIN];
}

/** Hozir ish vaqtimi */
export function isWorkingTime(at: Date, cal: WorkCalendar): boolean {
  const w = workWindow(at.getTime(), cal);
  return !!w && at.getTime() >= w[0] && at.getTime() < w[1];
}

/** Boshlanish vaqtiga ish soatlarini qo'shadi (ish vaqtidan tashqari, dam olish va bayram kunlari o'tkazib yuboriladi). */
export function addBusinessHours(start: Date, hours: number, cal: WorkCalendar): Date {
  let t = start.getTime();
  let left = hours * HOUR;
  for (let guard = 0; left > 0 && guard < 2000; guard++) {
    const w = workWindow(t, cal);
    if (w && t < w[1]) {
      if (t < w[0]) t = w[0];
      const step = Math.min(left, w[1] - t);
      t += step;
      left -= step;
      if (left <= 0) break;
    }
    t = dayStart(t) + DAY; // keyingi kun boshi
  }
  return new Date(t);
}

/** Ikki vaqt orasidagi ish soatlari. */
export function businessHoursBetween(from: Date, to: Date, cal: WorkCalendar): number {
  let t = from.getTime();
  const stop = to.getTime();
  let total = 0;
  for (let guard = 0; t < stop && guard < 4000; guard++) {
    const w = workWindow(t, cal);
    if (w) {
      const a = Math.max(t, w[0]);
      const b = Math.min(stop, w[1]);
      if (b > a) total += b - a;
    }
    t = dayStart(t) + DAY;
  }
  return Math.round((total / HOUR) * 10) / 10;
}

export interface LeadSla {
  responseDueAt: string;
  resolveDueAt: string;
  responded: boolean;
  resolved: boolean;
  /** Javob muddati o'tgan va hali javob berilmagan */
  responseOverdue: boolean;
  /** Natija muddati o'tgan, lekin uchrashuv belgilanmagan va sifatsiz deb topilmagan */
  resolveOverdue: boolean;
  /** Javob muddatigacha qolgan ish soatlari (manfiy - shuncha kechikkan); javob berilgan bo'lsa null */
  responseLeftHours: number | null;
  /** Natija muddatigacha qolgan ish soatlari (manfiy - kechikkan); hal qilingan bo'lsa null */
  resolveLeftHours: number | null;
  /** Javob berishga ketgan ish soatlari */
  responseHours: number | null;
  /** Natijaga yetishga ketgan ish soatlari */
  resolveHours: number | null;
}

export function leadSla(
  lead: { createdAt: Date; stage: string; stageChangedAt: Date; respondedAt: Date | null; resolvedAt: Date | null },
  cfg: SlaConfig,
  cal: WorkCalendar,
  now = new Date(),
): LeadSla {
  // Eski lidlarda (vaqtlar yozilmagan paytdan) bosqichning o'zi asos bo'ladi
  const respondedAt = lead.respondedAt ?? (lead.stage !== "NEW" ? lead.stageChangedAt : null);
  const resolvedAt = lead.resolvedAt ?? (RESOLVED_STAGES.includes(lead.stage) ? lead.stageChangedAt : null);
  const responseDue = addBusinessHours(lead.createdAt, cfg.responseHours, cal);
  const resolveDue = addBusinessHours(lead.createdAt, cfg.resolveHours, cal);
  const left = (due: Date) => (now <= due ? businessHoursBetween(now, due, cal) : -businessHoursBetween(due, now, cal));
  const paused = PAUSED_STAGES.includes(lead.stage);
  return {
    responseDueAt: responseDue.toISOString(),
    resolveDueAt: resolveDue.toISOString(),
    responded: !!respondedAt,
    resolved: !!resolvedAt,
    responseOverdue: !paused && !respondedAt && now > responseDue,
    resolveOverdue: !paused && !resolvedAt && now > resolveDue,
    responseLeftHours: paused || respondedAt ? null : left(responseDue),
    resolveLeftHours: paused || resolvedAt ? null : left(resolveDue),
    responseHours: respondedAt ? businessHoursBetween(lead.createdAt, respondedAt, cal) : null,
    resolveHours: resolvedAt ? businessHoursBetween(lead.createdAt, resolvedAt, cal) : null,
  };
}

/** O'zbekistonning sanasi o'zgarmas bayramlari (hayitlar har yili e'lon qilinadi - qo'lda qo'shiladi) */
export const UZ_FIXED_HOLIDAYS: { md: string; name: string }[] = [
  { md: "01-01", name: "Yangi yil" },
  { md: "03-08", name: "Xotin-qizlar kuni" },
  { md: "03-21", name: "Navro'z" },
  { md: "05-09", name: "Xotira va qadrlash kuni" },
  { md: "09-01", name: "Mustaqillik kuni" },
  { md: "10-01", name: "O'qituvchi va murabbiylar kuni" },
  { md: "12-08", name: "Konstitutsiya kuni" },
];
