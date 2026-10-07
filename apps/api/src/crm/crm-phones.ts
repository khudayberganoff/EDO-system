import * as fs from "fs";
import { Logger } from "@nestjs/common";

/**
 * CRM'da mijoz telefonlari bazada emas, crm.html ichidagi qo'lda yozilgan ro'yxatda
 * (MON_PHONES) saqlanadi va ism bo'yicha moslashtiriladi. Shaxsiy ma'lumot bo'lgani uchun
 * ro'yxat Git'da EMAS, serverdagi faylda turadi (CRM_PHONES_FILE, JSON:
 * [{"n":"Ism","o":"wafa|vafo","p":"+998...","p2":"+998..."}]). Moslashtirish
 * algoritmi crm.html'dagi mon_matchPhone bilan bir xil.
 */
export interface PhoneEntry { n: string; o: string; p: string; p2?: string }

const TR: Record<string, string> = { "а": "a", "б": "b", "в": "v", "г": "g", "ғ": "g", "д": "d", "е": "e", "ё": "yo", "ж": "j", "з": "z", "и": "i", "й": "y", "к": "k", "қ": "q", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ў": "o", "ф": "f", "х": "x", "ҳ": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "", "ы": "i", "ь": "", "э": "e", "ю": "yu", "я": "ya", "һ": "h", "і": "i" };
const STOP = new Set(["mchj", "mchg", "xk", "xt", "yatt", "xnnt", "ooo", "ip", "universiteti", "kelajak", "the", "road", "llc", "ltd", "firmasi", "korxonasi"]);

const translit = (s: string) => String(s || "").toLowerCase().split("").map((ch) => (TR[ch] !== undefined ? TR[ch] : ch)).join("");
export const nameTokens = (s: string): string[] =>
  translit(s).replace(/["'«»`.,()\-–—]/g, " ").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));

export function matchPhone(list: (PhoneEntry & { tok: string[] })[], name: string, org: "wafa" | "vafo"): PhoneEntry | null {
  const ct = nameTokens(name);
  if (!ct.length) return null;
  let best: PhoneEntry | null = null;
  let bestScore = 0;
  for (const p of list) {
    if (!p.tok.length) continue;
    let inter = 0;
    for (const w of ct) if (p.tok.includes(w)) inter++;
    if (!inter) continue;
    let score = inter / Math.min(ct.length, p.tok.length);
    if (p.o === org) score += 0.15;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore >= 0.5 ? best : null;
}

export function prepare(entries: PhoneEntry[]) {
  return entries.map((p) => ({ ...p, tok: nameTokens(p.n) }));
}

const logger = new Logger("CrmPhones");
let cache: { file: string; mtime: number; list: ReturnType<typeof prepare> } | null = null;

/** Fayl o'zgarsa qayta o'qiladi; fayl yo'q yoki buzuq bo'lsa - bo'sh ro'yxat (telefon qo'lda). */
export function loadPhones(): ReturnType<typeof prepare> {
  const file = process.env.CRM_PHONES_FILE;
  if (!file) return [];
  try {
    const mtime = fs.statSync(file).mtimeMs;
    if (cache && cache.file === file && cache.mtime === mtime) return cache.list;
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const list = prepare(Array.isArray(raw) ? raw.filter((e) => e && typeof e.n === "string") : []);
    cache = { file, mtime, list };
    return list;
  } catch (err: any) {
    logger.warn(`Telefon ro'yxatini o'qib bo'lmadi (${file}): ${err.message}`);
    return [];
  }
}
