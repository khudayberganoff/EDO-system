/**
 * Butun sonlarni o'zbekcha so'zlarga o'giradi (rasmiy hujjatlar uchun,
 * masalan "150000" -> "bir yuz ellik ming"). Faqat manfiy bo'lmagan
 * butun sonlar (0 dan ~999 milliarddan kichik) uchun mo'ljallangan.
 */
const ONES = ["", "bir", "ikki", "uch", "to'rt", "besh", "olti", "yetti", "sakkiz", "to'qqiz"];
const TENS = ["", "o'n", "yigirma", "o'ttiz", "qirq", "ellik", "oltmish", "yetmish", "sakson", "to'qson"];

function threeDigitsToWords(n: number): string {
  const words: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rem = n % 100;
  if (hundreds > 0) {
    if (hundreds > 1) words.push(ONES[hundreds]);
    words.push("yuz");
  }
  const tens = Math.floor(rem / 10);
  const ones = rem % 10;
  if (tens > 0) words.push(TENS[tens]);
  if (ones > 0) words.push(ONES[ones]);
  return words.join(" ");
}

export function numberToWordsUz(num: number): string {
  const n0 = Math.round(Math.abs(num));
  if (n0 === 0) return "nol";
  const scales: { value: number; word: string }[] = [
    { value: 1_000_000_000, word: "milliard" },
    { value: 1_000_000, word: "million" },
    { value: 1_000, word: "ming" },
  ];
  let n = n0;
  const parts: string[] = [];
  for (const scale of scales) {
    const count = Math.floor(n / scale.value);
    if (count > 0) {
      if (scale.word === "ming" && count === 1) {
        parts.push("ming");
      } else {
        parts.push(`${threeDigitsToWords(count)} ${scale.word}`);
      }
      n %= scale.value;
    }
  }
  if (n > 0) parts.push(threeDigitsToWords(n));
  return parts.join(" ");
}

/** Pul summasini so'z bilan ifodalaydi, masalan 4500000 -> "to'rt million besh yuz ming so'm" */
export function moneyToWordsUz(amount: number): string {
  return `${numberToWordsUz(amount)} so'm`;
}

/** Kun sonini so'z bilan ifodalaydi, masalan 12 -> "o'n ikki" */
export function daysToWordsUz(days: number): string {
  return numberToWordsUz(days);
}
