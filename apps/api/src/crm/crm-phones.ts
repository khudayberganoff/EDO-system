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

/** crm.html ichidagi `const MON_PHONES = [ {n:"..",o:"wafa",p:"+998..",p2:"",note:""}, ... ];` ro'yxatini o'qiydi. */
export function parsePhonesFromHtml(html: string): PhoneEntry[] {
  const start = html.indexOf("const MON_PHONES = [");
  if (start < 0) return [];
  const end = html.indexOf("\n];", start);
  const block = html.slice(start, end > 0 ? end : start + 200_000);
  const str = (v: string) => { try { return JSON.parse(`"${v}"`) as string; } catch { return v; } };
  const re = /n:"((?:[^"\\]|\\.)*)",\s*o:"(\w+)",\s*p:"([^"]*)",\s*p2:"([^"]*)"/g;
  const out: PhoneEntry[] = [];
  for (const m of block.matchAll(re)) out.push({ n: str(m[1]), o: m[2], p: m[3], p2: m[4] });
  return out;
}

const DEFAULT_PHONES_URL = "https://wafaleasing.uz/crm.html";
const URL_TTL_MS = 30 * 60_000;
let urlCache: { at: number; list: ReturnType<typeof prepare> } | null = null;

/**
 * Telefonlar manbasi: avval CRM_PHONES_FILE (JSON fayl), bo'sh/yo'q bo'lsa CRM sahifasining
 * o'zi (CRM_PHONES_URL, standart https://wafaleasing.uz/crm.html) - ro'yxat CRM bilan doim
 * bir xil bo'ladi, serverga fayl qo'yish shart emas. Sahifa 30 daqiqa keshlanadi; xatolikda
 * eski kesh (yoki bo'sh ro'yxat) qaytadi va telefon qo'lda kiritiladi. CRM_PHONES_URL=off - o'chirish.
 */
export async function loadPhonesAuto(): Promise<ReturnType<typeof prepare>> {
  const fromFile = loadPhones();
  if (fromFile.length) return fromFile;
  const url = process.env.CRM_PHONES_URL ?? DEFAULT_PHONES_URL;
  if (!url || url === "off") return [];
  if (urlCache && Date.now() - urlCache.at < URL_TTL_MS) return urlCache.list;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "edo-system/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = prepare(parsePhonesFromHtml(await res.text()));
    if (!list.length) throw new Error("MON_PHONES ro'yxati topilmadi");
    urlCache = { at: Date.now(), list };
    return list;
  } catch (err: any) {
    logger.warn(`CRM sahifasidan telefonlarni o'qib bo'lmadi (${url}): ${err.message}`);
    // qayta-qayta urinmaslik uchun qisqa muddatga eski keshni (yoki bo'sh ro'yxatni) saqlaymiz
    urlCache = { at: Date.now() - URL_TTL_MS + 5 * 60_000, list: urlCache?.list ?? [] };
    return urlCache.list;
  }
}
