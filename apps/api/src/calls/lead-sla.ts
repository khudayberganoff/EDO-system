/**
 * Lidlar bo'yicha ish muddatlari (SLA), Toshkent vaqti bo'yicha, shanba va yakshanba hisobga olinmaydi:
 *  - yangi lidga 24 soat ichida javob berilishi kerak (bosqich o'zgartirildi yoki qo'ng'iroq qilindi);
 *  - 72 soat ichida natija: uchrashuv belgilanishi (yoki undan keyingi bosqich) yoki "Sifatsiz lead".
 */
export const RESPONSE_HOURS = 24;
export const RESOLVE_HOURS = 72;
/** Shu bosqichlarga yetgan lid "hal qilingan" (uchrashuv belgilangan yoki sifatsiz deb topilgan) hisoblanadi */
export const RESOLVED_STAGES = ["MEETING", "VISITED", "CONTRACT", "UNQUALIFIED"];

const TZ_OFFSET = 5 * 3600_000; // Asia/Tashkent, yozgi vaqt yo'q
const HOUR = 3600_000;
const DAY = 24 * HOUR;

const isWeekend = (ms: number) => {
  const d = new Date(ms + TZ_OFFSET).getUTCDay();
  return d === 0 || d === 6;
};
/** Mahalliy (Toshkent) keyingi yarim tun */
const nextMidnight = (ms: number) => {
  const local = ms + TZ_OFFSET;
  return local - (local % DAY) + DAY - TZ_OFFSET;
};

/** Boshlanish vaqtiga ish soatlari (dam olish kunlarisiz) qo'shadi. */
export function addBusinessHours(start: Date, hours: number): Date {
  let t = start.getTime();
  let left = hours * HOUR;
  for (let guard = 0; left > 0 && guard < 400; guard++) {
    const end = nextMidnight(t);
    if (isWeekend(t)) { t = end; continue; }
    const step = Math.min(left, end - t);
    t += step;
    left -= step;
  }
  return new Date(t);
}

/** Ikki vaqt orasidagi ish soatlari (dam olish kunlarisiz). */
export function businessHoursBetween(from: Date, to: Date): number {
  let t = from.getTime();
  const stop = to.getTime();
  let total = 0;
  for (let guard = 0; t < stop && guard < 4000; guard++) {
    const end = Math.min(nextMidnight(t), stop);
    if (!isWeekend(t)) total += end - t;
    t = end;
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
  /** 72 soat o'tgan, lekin uchrashuv belgilanmagan va sifatsiz deb topilmagan */
  resolveOverdue: boolean;
  /** Javob berishga ketgan ish soatlari (javob berilgan bo'lsa) */
  responseHours: number | null;
  /** Natijaga yetishga ketgan ish soatlari */
  resolveHours: number | null;
}

export function leadSla(
  lead: { createdAt: Date; stage: string; stageChangedAt: Date; respondedAt: Date | null; resolvedAt: Date | null },
  now = new Date(),
): LeadSla {
  // Eski lidlarda (vaqtlar yozilmagan paytdan) bosqichning o'zi asos bo'ladi
  const respondedAt = lead.respondedAt ?? (lead.stage !== "NEW" ? lead.stageChangedAt : null);
  const resolvedAt = lead.resolvedAt ?? (RESOLVED_STAGES.includes(lead.stage) ? lead.stageChangedAt : null);
  const responseDue = addBusinessHours(lead.createdAt, RESPONSE_HOURS);
  const resolveDue = addBusinessHours(lead.createdAt, RESOLVE_HOURS);
  return {
    responseDueAt: responseDue.toISOString(),
    resolveDueAt: resolveDue.toISOString(),
    responded: !!respondedAt,
    resolved: !!resolvedAt,
    responseOverdue: !respondedAt && now > responseDue,
    resolveOverdue: !resolvedAt && now > resolveDue,
    responseHours: respondedAt ? businessHoursBetween(lead.createdAt, respondedAt) : null,
    resolveHours: resolvedAt ? businessHoursBetween(lead.createdAt, resolvedAt) : null,
  };
}
