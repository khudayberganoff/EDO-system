import type { LeadStage } from "../api/calls";

/** Lid bosqichlari: ustun sarlavhasi, izoh va rang (ko'k - jarayon, yashil - shartnoma, qizil - sifatsiz). */
export const LEAD_STAGES: { stage: LeadStage; title: string; hint?: string; tone: "blue" | "green" | "red" }[] = [
  { stage: "NEW", title: "Yangi lead", tone: "blue" },
  { stage: "INFO_GIVEN", title: "Ma'lumot berildi", tone: "blue" },
  { stage: "CALLBACK", title: "Qayta bog'lanish", hint: "(birinchi qo'ng'iroqda ko'tarmasa)", tone: "blue" },
  { stage: "MEETING", title: "Uchrashuv belgilandi", tone: "blue" },
  { stage: "VISITED", title: "Ofisga keldi", tone: "blue" },
  { stage: "CONTRACT", title: "Shartnoma qilindi", tone: "green" },
  { stage: "UNQUALIFIED", title: "Sifatsiz lead", hint: "Raqam xato yoki yo'q", tone: "red" },
];

export const stageTitle = (s: LeadStage) => LEAD_STAGES.find((x) => x.stage === s)?.title ?? s;

/** Ustun sarlavha kartochkasi ranglari */
export const TONE_CLASSES = {
  blue: "border-sky-200 bg-sky-50 text-sky-800",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  red: "border-rose-200 bg-rose-50 text-rose-700",
} as const;
