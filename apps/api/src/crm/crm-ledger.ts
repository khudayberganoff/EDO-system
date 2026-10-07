/**
 * CRM'ning Monitoring -> Portfel hisob-kitobi (crm.html: mon_buildChain, mon_computeLedger,
 * mon_monthCloseDates, mon_daysOverdue, mon_oylik) - aynan shu mantiq: "months" (oylik reja)
 * va "payments" (to'lovlar) bo'yicha xronologik FIFO. CRM'dagi natija bilan bir xil chiqishi shart.
 *
 * Sanalar butun "kun raqami" (UTC yarim tun / 86400000) sifatida: CRM brauzerda mahalliy
 * yarim tun bilan solishtirgani uchun bu bilan bir xil natija beradi.
 */
export interface PlanMonth { year: number; month: number; planUstama?: number; planAsosiy?: number; tulov?: number }
export interface Extra { day: number; amount: number; year: number; month: number }
export interface LedgerResult {
  principalLeft: number;
  profitLeft: number;
  overdue: number;
  dpd: number;
  monthly: number;
  endDay: number | null;
}

export const dayOf = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);
export const isoOfDay = (day: number) => new Date(day * 86400000).toISOString().slice(0, 10);

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function buildChain(months: PlanMonth[], N: number, extra: Extra[], vafo: boolean) {
  if (!months.length) return [];
  const extraByMonth: Record<string, number> = {};
  for (const p of extra) {
    const key = `${p.year}-${p.month}`;
    extraByMonth[key] = (extraByMonth[key] || 0) + p.amount;
  }
  const firstKey = `${months[0].year}-${months[0].month}`;
  const firstTotal = months[0].year * 12 + months[0].month;
  let before = 0;
  for (const key of Object.keys(extraByMonth)) {
    const [y, m] = key.split("-").map(Number);
    if (y * 12 + m < firstTotal) { before += extraByMonth[key]; delete extraByMonth[key]; }
  }
  if (before > 0) extraByMonth[firstKey] = (extraByMonth[firstKey] || 0) + before;

  const last = months[months.length - 1];
  const lastKey = `${last.year}-${last.month}`;
  const lastTotal = last.year * 12 + last.month;
  let after = 0;
  for (const key of Object.keys(extraByMonth)) {
    const [y, m] = key.split("-").map(Number);
    if (y * 12 + m > lastTotal) { after += extraByMonth[key]; delete extraByMonth[key]; }
  }
  if (after > 0) extraByMonth[lastKey] = (extraByMonth[lastKey] || 0) + after;

  let otganUstama = 0, otganAsosiy = 0;
  let remainingN = vafo ? 0 : N;
  const chain: { year: number; month: number; ustamaAfter: number; asosiyAfter: number; netTulov: number }[] = [];
  for (const m of months) {
    const key = `${m.year}-${m.month}`;
    let netTulov = n(m.tulov);
    if (extraByMonth[key]) netTulov += extraByMonth[key];

    const payN = Math.min(Math.max(netTulov, 0), remainingN);
    remainingN -= payN; netTulov -= payN;

    let remaining = netTulov;
    const payOtganUstama = Math.min(Math.max(remaining, 0), otganUstama);
    remaining -= payOtganUstama; const newOtganUstama = otganUstama - payOtganUstama;

    const payOtganAsosiy = Math.min(Math.max(remaining, 0), otganAsosiy);
    remaining -= payOtganAsosiy; const newOtganAsosiy = otganAsosiy - payOtganAsosiy;

    const thisUstamaPlan = n(m.planUstama);
    const payThisUstama = Math.min(Math.max(remaining, 0), thisUstamaPlan);
    remaining -= payThisUstama; const newThisUstama = thisUstamaPlan - payThisUstama;

    const thisAsosiyPlan = n(m.planAsosiy);
    const payThisAsosiy = Math.min(Math.max(remaining, 0), thisAsosiyPlan);
    remaining -= payThisAsosiy; const newThisAsosiy = thisAsosiyPlan - payThisAsosiy;

    otganUstama = newOtganUstama + newThisUstama;
    otganAsosiy = newOtganAsosiy + newThisAsosiy;
    if (remaining > 0) otganAsosiy -= remaining;

    chain.push({ year: m.year, month: m.month, ustamaAfter: otganUstama, asosiyAfter: otganAsosiy, netTulov });
  }
  return chain;
}

function monthCloseDays(months: PlanMonth[], N: number, extra: Extra[], vafo: boolean, today: number) {
  if (!months.length) return [];
  const sorted = extra.filter((p) => p.day <= today).sort((a, b) => a.day - b.day);
  let remainingN = vafo ? 0 : N;
  const st = months.map((m) => ({ year: m.year, month: m.month, u: n(m.planUstama), a: n(m.planAsosiy), closedAt: null as number | null, real: n(m.planUstama) > 0 || n(m.planAsosiy) > 0 }));
  const apply = (amount: number, d: number) => {
    let rem = amount;
    const payN = Math.min(Math.max(rem, 0), remainingN); remainingN -= payN; rem -= payN;
    for (const ms of st) {
      if (!ms.real) continue;
      if (rem <= 0) break;
      const pu = Math.min(rem, ms.u); ms.u -= pu; rem -= pu;
      if (rem <= 0) { if (ms.u <= 0 && ms.a <= 0 && ms.closedAt === null) ms.closedAt = d; break; }
      const pa = Math.min(rem, ms.a); ms.a -= pa; rem -= pa;
      if (ms.u <= 0 && ms.a <= 0 && ms.closedAt === null) ms.closedAt = d;
    }
  };
  for (const p of sorted) apply(p.amount, p.day);
  return st;
}

export function computeLedger(input: { months: PlanMonth[]; N: number; paydey: number; extra: Extra[]; vafo: boolean; today: number }): LedgerResult {
  const { months, N, extra, vafo, today } = input;
  const payday = input.paydey || 20;
  const chain = buildChain(months, N, extra, vafo);

  let jamiPlanAsosiy = 0;
  for (const m of months) jamiPlanAsosiy += n(m.planAsosiy);
  const lastLink = chain.length ? chain[chain.length - 1] : { ustamaAfter: 0, asosiyAfter: Math.max(jamiPlanAsosiy, 0) };

  let matched: { ustamaAfter: number; asosiyAfter: number } | null = null;
  for (const link of chain) {
    const due = dayOf(link.year, link.month, payday);
    if (due <= today) { matched = link; }
    else if (link.netTulov > 0) {
      const md = months.find((m) => m.year === link.year && m.month === link.month);
      const ownU = md ? n(md.planUstama) : 0;
      const ownA = md ? n(md.planAsosiy) : 0;
      const adj = { ustamaAfter: Math.max(link.ustamaAfter - ownU, 0), asosiyAfter: Math.max(link.asosiyAfter - ownA, 0) };
      if (!matched || adj.ustamaAfter + adj.asosiyAfter < matched.ustamaAfter + matched.asosiyAfter) matched = adj;
      break;
    } else break;
  }
  const overdue = (matched ? Math.max(matched.ustamaAfter, 0) : 0) + (matched ? Math.max(matched.asosiyAfter, 0) : 0);

  let dpd = 0;
  for (const ms of monthCloseDays(months, N, extra, vafo, today)) {
    if (!ms.real) continue;
    const due = dayOf(ms.year, ms.month, payday);
    if (due > today) { dpd = 0; break; }
    const closed = ms.closedAt !== null && ms.closedAt <= today;
    if (!closed) { dpd = Math.max(0, today - due); break; }
  }

  let monthly = 0;
  for (const m of months) { const s = n(m.planUstama) + n(m.planAsosiy); if (s > 0) { monthly = s; break; } }

  const real = months.filter((m) => n(m.planUstama) + n(m.planAsosiy) > 0);
  const endDay = real.length ? dayOf(real[real.length - 1].year, real[real.length - 1].month, payday) : null;

  return {
    principalLeft: Math.max(lastLink.asosiyAfter, 0),
    profitLeft: Math.max(lastLink.ustamaAfter, 0),
    overdue,
    dpd,
    monthly,
    endDay,
  };
}
