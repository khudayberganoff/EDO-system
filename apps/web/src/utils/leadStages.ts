import type { LeadStage } from "../api/calls";
import type { TranslationKey } from "../i18n/translations";

/** Lid bosqichlari: ustun sarlavhasi va izoh (tarjima kalitlari) hamda rang (ko'k - jarayon, yashil - shartnoma, qizil - sifatsiz). */
export const LEAD_STAGES: { stage: LeadStage; title: TranslationKey; hint?: TranslationKey; tone: "blue" | "green" | "red" }[] = [
  { stage: "NEW", title: "calls.stage.NEW", tone: "blue" },
  { stage: "INFO_GIVEN", title: "calls.stage.INFO_GIVEN", tone: "blue" },
  { stage: "CALLBACK", title: "calls.stage.CALLBACK", hint: "calls.stage.CALLBACK.hint", tone: "blue" },
  { stage: "MEETING", title: "calls.stage.MEETING", tone: "blue" },
  { stage: "VISITED", title: "calls.stage.VISITED", tone: "blue" },
  { stage: "CONTRACT", title: "calls.stage.CONTRACT", tone: "green" },
  { stage: "UNQUALIFIED", title: "calls.stage.UNQUALIFIED", hint: "calls.stage.UNQUALIFIED.hint", tone: "red" },
];

/** Bosqich nomining tarjima kaliti */
export const stageTitleKey = (s: LeadStage): TranslationKey => LEAD_STAGES.find((x) => x.stage === s)?.title ?? "calls.stage.NEW";

/** Ustun sarlavha kartochkasi ranglari */
export const TONE_CLASSES = {
  blue: "border-sky-200 bg-sky-50 text-sky-800",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  red: "border-rose-200 bg-rose-50 text-rose-700",
} as const;
