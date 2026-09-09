/**
 * Grigorian sana - o'zbekcha oy nomi bilan (masalan "9-sentyabr, 2026") va
 * hijriy (islom oy) sanasi.
 *
 * `toLocaleDateString(..., { month: "long" })` "uz-UZ" uchun to'liq oy nomini
 * emas, "M09" kabi qisqartmani qaytaradi (brauzer/Node'dagi Intl'da o'zbek
 * tili uchun to'liq lokal ma'lumot yo'q) - shuning uchun oy nomlarini o'zimiz
 * belgilaymiz.
 */
const UZ_MONTHS = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr",
];

const HIJRI_MONTHS = [
  "Muharram", "Safar", "Rabi ul-avval", "Rabi us-soniy", "Jumad ul-avval", "Jumad us-soniy",
  "Rajab", "Sha'bon", "Ramazon", "Shavvol", "Zul-qa'da", "Zul-hijja",
];

export function formatUzGregorian(date: Date): string {
  return `${date.getDate()}-${UZ_MONTHS[date.getMonth()]}, ${date.getFullYear()}`;
}

/**
 * Grigorian -> Hijriy (jadval usuli, "Kувайт algoritmi" - taxminiy, ±1 kunlik
 * farq bo'lishi mumkin, lekin kundalik interfeys uchun yetarli aniqlikda).
 */
export function toHijri(date: Date): { day: number; month: number; year: number } {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();

  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  const jdn =
    d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;

  const islamicEpoch = 1948440;
  let l = jdn - islamicEpoch + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const month = Math.floor((24 * l) / 709);
  const day = l - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;

  return { day, month, year };
}

export function formatHijri(date: Date): string {
  const { day, month, year } = toHijri(date);
  return `${day}-${HIJRI_MONTHS[month - 1]}, ${year} h.`;
}
