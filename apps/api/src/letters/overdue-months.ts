const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"];

/**
 * Kechikkan to'lov oylari. Eng eski to'lov muddati = xat sanasi - kechikkan kunlar.
 * Hisobdagi to'lovlar eng eskisidan boshlab yopiladi (FIFO), shuning uchun eng eski
 * to'lov yopilmagan bo'lsa, undan keyingi xat sanasigacha muddati kelgan barcha oylar
 * ham kechikkan hisoblanadi. Natija: "iyul oyi" yoki "iyul, avgust va sentyabr oylari".
 */
export function overdueMonthsUz(docDate: Date, overdueDays: number): { text: string; count: number } {
  const day = 86_400_000;
  const end = Date.UTC(docDate.getUTCFullYear(), docDate.getUTCMonth(), docDate.getUTCDate());
  const first = new Date(end - Math.max(0, overdueDays) * day);
  const dueDay = first.getUTCDate();
  let y = first.getUTCFullYear();
  let m = first.getUTCMonth();
  const names: string[] = [];
  for (let guard = 0; guard < 120; guard++) {
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const due = Date.UTC(y, m, Math.min(dueDay, lastDay));
    if (due > end) break;
    names.push(UZ_MONTHS[m]);
    m++;
    if (m > 11) { m = 0; y++; }
  }
  if (names.length === 0) names.push(UZ_MONTHS[first.getUTCMonth()]);
  if (names.length === 1) return { text: `${names[0]} oyi`, count: 1 };
  return { text: `${names.slice(0, -1).join(", ")} va ${names[names.length - 1]} oylari`, count: names.length };
}
