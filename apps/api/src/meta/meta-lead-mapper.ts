import { normalizePhone } from "../telephony/telephony-parser";

/** Forma savoli -> tizim maydoni */
export type MetaTarget = "name" | "phone" | "note" | "skip";
export const META_TARGETS: MetaTarget[] = ["name", "phone", "note", "skip"];

export interface MetaQuestion { key: string; label: string; type?: string }

/** Meta Graph API qaytargan lid (kerakli maydonlar) */
export interface MetaLeadData {
  id: string;
  created_time?: string;
  field_data?: { name: string; values?: string[] }[];
  form_id?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  platform?: string;
  is_organic?: boolean;
}

/** Standart moslama: ism/telefon maydonlari o'z joyiga, qolgan hamma savol-javob izohga. */
export function defaultTarget(key: string): MetaTarget {
  const k = key.toLowerCase();
  if (k === "full_name" || k === "first_name" || k === "last_name" || k === "name") return "name";
  if (k === "phone_number" || k === "phone") return "phone";
  return "note";
}

const humanize = (key: string) => key.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export const platformLabel = (p?: string | null) => (p === "ig" ? "Instagram" : p === "fb" ? "Facebook" : p ? p : "Facebook");

export function formatTashkent(d: Date) {
  return d.toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent", dateStyle: "short", timeStyle: "short" });
}

/**
 * Meta lididan tizim lidi uchun maydonlarni yasaydi: ism, telefon (+998...), manba va o'qiladigan izoh
 * (qolgan savol-javoblar, forma, kampaniya, ad set, reklama, platforma).
 */
export function mapMetaLead(
  lead: MetaLeadData,
  opts: { questions?: MetaQuestion[] | null; mapping?: Record<string, string> | null; formName?: string | null },
) {
  const mapping = opts.mapping ?? {};
  const labelOf = (key: string) => opts.questions?.find((q) => q.key === key)?.label?.trim() || humanize(key);
  const nameParts: string[] = [];
  let firstLast: { first?: string; last?: string } = {};
  let phone: string | null = null;
  const answers: string[] = [];

  for (const f of lead.field_data ?? []) {
    const value = (f.values ?? []).map((v) => String(v).trim()).filter(Boolean).join(", ");
    if (!value) continue;
    const target = (META_TARGETS as string[]).includes(mapping[f.name]) ? (mapping[f.name] as MetaTarget) : defaultTarget(f.name);
    if (target === "skip") continue;
    if (target === "phone" && !phone) {
      phone = normalizePhone(value) ?? value;
      continue;
    }
    if (target === "name") {
      const k = f.name.toLowerCase();
      if (k === "first_name") firstLast.first = value;
      else if (k === "last_name") firstLast.last = value;
      else nameParts.push(value);
      continue;
    }
    answers.push(`${labelOf(f.name)}: ${value}`);
  }

  const fromParts = [firstLast.first, firstLast.last].filter(Boolean).join(" ");
  const name = (nameParts.join(" ") || fromParts || phone || "Meta lid").slice(0, 200);
  const platform = platformLabel(lead.platform);
  const source = `Meta Ads (${platform})`;

  const meta: string[] = [];
  if (opts.formName) meta.push(`Forma: ${opts.formName}`);
  if (lead.campaign_name) meta.push(`Kampaniya: ${lead.campaign_name}`);
  if (lead.adset_name) meta.push(`Ad set: ${lead.adset_name}`);
  if (lead.ad_name) meta.push(`Reklama: ${lead.ad_name}`);
  meta.push(`Platforma: ${platform}${lead.is_organic ? " (organik)" : ""}`);
  if (lead.created_time) {
    const d = new Date(lead.created_time.replace(/\+0000$/, "Z"));
    if (!isNaN(+d)) meta.push(`Ariza vaqti: ${formatTashkent(d)}`);
  }

  // Avval arizadagi javoblar (kartochkada shular ko'rinadi), keyin reklama ma'lumoti
  const note = [answers.join("\n"), meta.join("\n")].filter(Boolean).join("\n\n");
  return { name, phone, source, note, answers, platform };
}
