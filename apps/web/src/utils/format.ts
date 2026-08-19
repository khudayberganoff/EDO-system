/**
 * Kiritish maydonlari uchun formatlash yordamchilari.
 * Maqsad: foydalanuvchi raqamlarni oson o'qiy olsin (1 510 510),
 * telefon esa O'zbekiston formatida bo'lsin (+998 90 123 45 67).
 */

/** Faqat raqamlarni qoldiradi. */
const digitsOnly = (value: string) => value.replace(/\D/g, "");

// --- Telefon ---

/**
 * O'zbekiston telefon raqamini formatlaydi: +998 90 123 45 67
 * Foydalanuvchi qanday kiritishidan qat'i nazar (998..., 90..., +998...)
 * doim +998 bilan boshlanadigan, 9 raqamli milliy qismga keltiriladi.
 */
export function formatUzPhone(input: string): string {
  let d = digitsOnly(input);
  if (d.startsWith("998")) d = d.slice(3);
  d = d.slice(0, 9); // operator kodi (2) + raqam (7)

  if (!d) return "";
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return `+998 ${parts.join(" ")}`.trimEnd();
}

/** Formatlangan telefonni saqlash uchun toza ko'rinishga keltiradi: +998901234567 */
export function normalizeUzPhone(formatted: string): string {
  let d = digitsOnly(formatted);
  if (d.startsWith("998")) d = d.slice(3);
  d = d.slice(0, 9);
  return d.length === 9 ? `+998${d}` : "";
}

/** Telefon to'liq kiritilganini tekshiradi (9 ta milliy raqam). */
export function isValidUzPhone(formatted: string): boolean {
  let d = digitsOnly(formatted);
  if (d.startsWith("998")) d = d.slice(3);
  return d.length === 9;
}

// --- Pul summasi ---

/**
 * Summani o'qishga qulay ko'rinishga keltiradi: 1510510.5 -> "1 510 510,5"
 * Butun qism uch xonadan bo'linadi, kasr qismi vergul bilan ajratiladi.
 */
export function formatMoney(input: string): string {
  // Vergul ham, nuqta ham kasr ajratkichi sifatida qabul qilinadi
  const cleaned = input.replace(/[^\d.,]/g, "").replace(/\./g, ",");
  const [intRaw, ...rest] = cleaned.split(",");
  const intPart = intRaw.replace(/^0+(?=\d)/, "");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  if (rest.length === 0) return grouped;
  const decimals = rest.join("").slice(0, 2); // ko'pi bilan 2 xona
  return `${grouped},${decimals}`;
}

/** Formatlangan summani songa aylantiradi: "1 510 510,5" -> 1510510.5 */
export function parseMoney(formatted: string): number | undefined {
  const cleaned = formatted.replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}
