import * as XLSX from "xlsx";
import { businessHoursBetween, type WorkCalendar } from "./lead-sla";

/**
 * Lidlar hisoboti: Excel (bir nechta varaq) va Power BI uchun CSV. Ikkalasida ham "Lidlar" jadvali bir xil -
 * har bir lid bitta qator (Power BI shu jadvaldan diagrammalar quradi). Vaqtlar Toshkent vaqtida.
 */

export const STAGE_UZ: Record<string, string> = {
  NEW: "Yangi lead", INFO_GIVEN: "Ma'lumot berildi", CALLBACK: "Qayta bog'lanish", MEETING: "Uchrashuv belgilandi",
  VISITED: "Ofisga keldi", REVIEW: "Loyiha o'rganish jarayonida", CONTRACT: "Shartnoma qilindi", UNQUALIFIED: "Sifatsiz lead",
};
export const LOSS_UZ: Record<string, string> = {
  COLLATERAL: "Garov to'g'ri kelmadi", MARKUP: "Ustama qimmatlik qildi", ISLAMIC: "Islomiy moliya xohlamadi",
  PHONE_OFF: "Telefon o'chirilgan", FOLLOWUP: "Qayta aloqaga chiqildi", TERM: "Muddat", OTHER: "Boshqa",
};
export const CATEGORY_UZ: Record<string, string> = { RAW: "Xom-ashyo", CAR: "Mashina", REAL_ESTATE: "Turar / noturar joy", SPECIAL: "Maxsus texnika" };
/** Natijaga yetgan (uchrashuv va undan keyingi) bosqichlar */
const MEETING_PLUS = ["MEETING", "VISITED", "REVIEW", "CONTRACT"];

export interface ReportLead {
  id: string; createdAt: Date; name: string; phone: string | null; source: string | null; stage: string;
  respondedAt: Date | null; resolvedAt: Date | null; meetingAt: Date | null; callbackAt: Date | null; callbackCount: number;
  lossReasons: string[]; lossTerm: string | null; lossNote: string | null;
  projectCategories: string[]; projectRawCollateral: boolean | null; projectAsset: string | null; projectPurpose: string | null;
  projectAmount: number | null; projectTermMonths: number | null; projectHasDownPayment: boolean | null; projectDownPayment: number | null;
  metaPlatform: string | null; metaCampaignName: string | null; metaFormName: string | null;
  owner: { fullName: string } | null;
}

const TZ = 5 * 3600_000;
/** "2026-11-24 14:05" (Toshkent) */
export const fmt = (d: Date | null | undefined) => (d ? new Date(d.getTime() + TZ).toISOString().slice(0, 16).replace("T", " ") : "");
const day = (d: Date) => new Date(d.getTime() + TZ).toISOString().slice(0, 10);

/** Toshkent kunlari bo'yicha [from 00:00, to 24:00) */
export function periodRange(from: string, to: string) {
  const start = new Date(`${from}T00:00:00+05:00`);
  const end = new Date(new Date(`${to}T00:00:00+05:00`).getTime() + 86_400_000);
  return { start, end };
}

/** Qayta aloqalar soni (eski lidlarda hisoblagich bo'lmagan - vaqti bor bo'lsa kamida 1) */
export const followUps = (l: { callbackCount: number; callbackAt: Date | null }) => Math.max(l.callbackCount, l.callbackAt ? 1 : 0);

export function sourceOf(l: ReportLead) {
  if (l.metaPlatform === "ig") return "Instagram";
  if (l.metaPlatform === "fb" || l.metaPlatform) return "Facebook";
  if (l.source === "IP-telefoniya") return "IP-telefoniya";
  return l.source?.trim() || "Boshqa";
}

export function leadRows(leads: ReportLead[], cal: WorkCalendar) {
  return leads.map((l) => ({
    "ID": l.id,
    "Kelgan vaqt": fmt(l.createdAt),
    "Kelgan kun": day(l.createdAt),
    "Ism": l.name,
    "Telefon": l.phone ?? "",
    "Manba": sourceOf(l),
    "Kampaniya": l.metaCampaignName ?? "",
    "Forma": l.metaFormName ?? "",
    "Bosqich": STAGE_UZ[l.stage] ?? l.stage,
    "Mas'ul": l.owner?.fullName ?? "",
    "Birinchi aloqa": fmt(l.respondedAt),
    "Javob vaqti (ish soati)": l.respondedAt ? businessHoursBetween(l.createdAt, l.respondedAt, cal) : "",
    "Qayta aloqalar soni": followUps(l),
    "Qayta aloqa vaqti": fmt(l.callbackAt),
    "Uchrashuv vaqti": fmt(l.meetingAt),
    "Natija vaqti": fmt(l.resolvedAt),
    "Uchrashuv belgilangan": MEETING_PLUS.includes(l.stage) ? 1 : 0,
    "Shartnoma": l.stage === "CONTRACT" ? 1 : 0,
    "Sifatsiz": l.stage === "UNQUALIFIED" ? 1 : 0,
    "Rad etish sabablari": l.lossReasons.map((r) => (r === "TERM" && l.lossTerm ? `Muddat: ${l.lossTerm}` : LOSS_UZ[r] ?? r)).join("; "),
    "Rad etish izohi": l.lossNote ?? "",
    "Loyiha turi": l.projectCategories.map((c) => CATEGORY_UZ[c] ?? c).join("; "),
    "Garov (xom-ashyo)": l.projectRawCollateral === null ? "" : l.projectRawCollateral ? "Bor" : "Yo'q",
    "Aktiv": l.projectAsset ?? "",
    "Loyiha maqsadi": l.projectPurpose ?? "",
    "Summa (so'm)": l.projectAmount ?? "",
    "Muddat (oy)": l.projectTermMonths ?? "",
    "Oldindan to'lov (so'm)": l.projectHasDownPayment ? l.projectDownPayment ?? "" : l.projectHasDownPayment === false ? 0 : "",
  }));
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : "—");

/** Excel: Xulosa, Lidlar, Kunlar, Manbalar, Rad etish sabablari, Loyiha turlari */
export function buildWorkbook(leads: ReportLead[], cal: WorkCalendar, from: string, to: string): Buffer {
  const rows = leadRows(leads, cal);
  const total = leads.length;
  const contacted = leads.filter((l) => l.respondedAt).length;
  const responses = leads.filter((l) => l.respondedAt).map((l) => businessHoursBetween(l.createdAt, l.respondedAt!, cal));
  const meetings = leads.filter((l) => MEETING_PLUS.includes(l.stage)).length;
  const contracts = leads.filter((l) => l.stage === "CONTRACT").length;
  const unq = leads.filter((l) => l.stage === "UNQUALIFIED").length;
  const withFollow = leads.filter((l) => followUps(l) > 0);

  const summary: (string | number)[][] = [
    ["Lidlar hisoboti", `${from} — ${to}`],
    ["Tuzilgan", fmt(new Date())],
    [],
    ["Ko'rsatkich", "Qiymat", "Ulush"],
    ["Kelgan lidlar", total, ""],
    ["Aloqaga chiqilgan", contacted, pct(contacted, total)],
    ["Javob berilmagan", total - contacted, pct(total - contacted, total)],
    ["O'rtacha birinchi javob (ish soati)", avg(responses), ""],
    ["Qayta aloqa belgilangan lidlar", withFollow.length, pct(withFollow.length, total)],
    ["Jami qayta aloqalar", withFollow.reduce((a, l) => a + followUps(l), 0), ""],
    ["Uchrashuv belgilangan (va keyingi bosqichlar)", meetings, pct(meetings, total)],
    ["Shartnoma qilingan", contracts, pct(contracts, total)],
    ["Sifatsiz (rad etilgan)", unq, pct(unq, total)],
    [],
    ["Hozirgi bosqich", "Lidlar", "Ulush"],
    ...Object.entries(STAGE_UZ).map(([k, v]) => { const n = leads.filter((l) => l.stage === k).length; return [v, n, pct(n, total)]; }),
  ];

  // Kunlar bo'yicha (davrdagi har bir kun, lid kelmagan kunlar ham)
  const days: (string | number)[][] = [["Kun", "Lidlar", "Aloqaga chiqilgan", "Uchrashuv+", "Shartnoma", "Sifatsiz"]];
  const { start, end } = periodRange(from, to);
  for (let t = start.getTime(); t < end.getTime(); t += 86_400_000) {
    const d = day(new Date(t));
    const ls = leads.filter((l) => day(l.createdAt) === d);
    days.push([d, ls.length, ls.filter((l) => l.respondedAt).length, ls.filter((l) => MEETING_PLUS.includes(l.stage)).length, ls.filter((l) => l.stage === "CONTRACT").length, ls.filter((l) => l.stage === "UNQUALIFIED").length]);
  }

  const bySource = new Map<string, ReportLead[]>();
  for (const l of leads) bySource.set(sourceOf(l), [...(bySource.get(sourceOf(l)) ?? []), l]);
  const sources: (string | number)[][] = [["Manba", "Lidlar", "Aloqaga chiqilgan", "O'rtacha javob (ish soati)", "Uchrashuv+", "Shartnoma", "Sifatsiz", "Konversiya (shartnoma)"]];
  for (const [s, ls] of [...bySource.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const r = ls.filter((l) => l.respondedAt).map((l) => businessHoursBetween(l.createdAt, l.respondedAt!, cal));
    const c = ls.filter((l) => l.stage === "CONTRACT").length;
    sources.push([s, ls.length, r.length, avg(r), ls.filter((l) => MEETING_PLUS.includes(l.stage)).length, c, ls.filter((l) => l.stage === "UNQUALIFIED").length, pct(c, ls.length)]);
  }

  const loss: (string | number)[][] = [["Rad etish sababi", "Lidlar", "Sifatsizlar ichida ulush"]];
  for (const [k, v] of Object.entries(LOSS_UZ)) {
    const n = leads.filter((l) => l.stage === "UNQUALIFIED" && l.lossReasons.includes(k)).length;
    loss.push([v, n, pct(n, unq)]);
  }
  const noReason = leads.filter((l) => l.stage === "UNQUALIFIED" && !l.lossReasons.length).length;
  loss.push(["Sabab ko'rsatilmagan", noReason, pct(noReason, unq)]);

  const cats: (string | number)[][] = [["Loyiha turi", "Lidlar", "Shartnoma", "O'rtacha summa (so'm)"]];
  for (const [k, v] of Object.entries(CATEGORY_UZ)) {
    const ls = leads.filter((l) => l.projectCategories.includes(k));
    const sums = ls.map((l) => l.projectAmount).filter((x): x is number => typeof x === "number");
    cats.push([v, ls.length, ls.filter((l) => l.stage === "CONTRACT").length, sums.length ? Math.round(sums.reduce((a, b) => a + b, 0) / sums.length) : "—"]);
  }

  const wb = XLSX.utils.book_new();
  const add = (name: string, ws: XLSX.WorkSheet, widths: number[]) => { ws["!cols"] = widths.map((w) => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); };
  add("Xulosa", XLSX.utils.aoa_to_sheet(summary), [44, 14, 10]);
  const lw = rows.length ? Object.keys(rows[0]).map((k) => Math.min(40, Math.max(k.length + 2, 12))) : [20];
  add("Lidlar", rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([["Bu davrda lid yo'q"]]), lw);
  add("Kunlar", XLSX.utils.aoa_to_sheet(days), [12, 10, 18, 12, 12, 10]);
  add("Manbalar", XLSX.utils.aoa_to_sheet(sources), [20, 10, 18, 24, 12, 12, 10, 22]);
  add("Rad etish sabablari", XLSX.utils.aoa_to_sheet(loss), [30, 10, 24]);
  add("Loyiha turlari", XLSX.utils.aoa_to_sheet(cats), [24, 10, 12, 22]);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Power BI uchun CSV (UTF-8 BOM - Excel/Power BI kirill va o'zbek harflarini to'g'ri o'qiydi) */
export function buildCsv(leads: ReportLead[], cal: WorkCalendar): string {
  const rows = leadRows(leads, cal);
  const head = rows.length ? Object.keys(rows[0]) : Object.keys(leadRows([{ id: "", createdAt: new Date(), name: "", phone: null, source: null, stage: "NEW", respondedAt: null, resolvedAt: null, meetingAt: null, callbackAt: null, callbackCount: 0, lossReasons: [], lossTerm: null, lossNote: null, projectCategories: [], projectRawCollateral: null, projectAsset: null, projectPurpose: null, projectAmount: null, projectTermMonths: null, projectHasDownPayment: null, projectDownPayment: null, metaPlatform: null, metaCampaignName: null, metaFormName: null, owner: null }], cal)[0]);
  const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [head.join(","), ...rows.map((r) => head.map((h) => esc((r as Record<string, unknown>)[h])).join(","))].join("\r\n") + "\r\n";
}
