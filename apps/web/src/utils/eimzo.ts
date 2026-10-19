/**
 * E-IMZO (ERI) dasturi bilan brauzerdan ishlash: kompyuterda o'rnatilgan E-IMZO dasturi
 * localhost'da WebSocket xizmati ochadi (https saytlar uchun wss://127.0.0.1:64443, http uchun ws://127.0.0.1:64646).
 * Har bir chaqiruv alohida ulanishda: {plugin, name, arguments} yuboriladi, {success, ...} qaytadi.
 */

export interface EimzoKey {
  disk: string;
  path: string;
  name: string;
  alias: string;
  cn: string;
  pinfl: string;
  tin: string;
  org: string;
  validTo: Date | null;
  expired: boolean;
}

function serviceUrl() {
  return (window.location.protocol === "https:" ? "wss://127.0.0.1:64443" : "ws://127.0.0.1:64646") + "/service/cryptapi";
}

function call(payload: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    let done = false;
    let socket: WebSocket;
    const fail = (msg: string) => { if (!done) { done = true; reject(new Error(msg)); } };
    const timer = setTimeout(() => { fail("E-IMZO javob bermadi."); try { socket?.close(); } catch { /* */ } }, 60_000);
    try {
      socket = new WebSocket(serviceUrl());
    } catch {
      clearTimeout(timer);
      return reject(new Error("E-IMZO dasturiga ulanib bo'lmadi."));
    }
    socket.onerror = () => { clearTimeout(timer); fail("E-IMZO dasturi topilmadi. Dastur ishga tushirilganini tekshiring."); };
    socket.onopen = () => socket.send(JSON.stringify(payload));
    socket.onmessage = (ev) => {
      clearTimeout(timer);
      try { socket.close(); } catch { /* */ }
      if (done) return;
      done = true;
      try {
        const data = JSON.parse(ev.data);
        if (data?.success === false) reject(new Error(data.reason || "E-IMZO xatosi."));
        else resolve(data);
      } catch {
        reject(new Error("E-IMZO dan noto'g'ri javob keldi."));
      }
    };
  });
}

/** Alias qatori ("cn=..,pinfl=..,validto=2025.01.01 00:00:00,...") ni maydonlarga ajratadi. */
function parseAlias(alias: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of alias.split(",")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

function parseDate(v?: string): Date | null {
  if (!v) return null;
  // "2025.01.01 00:00:00" yoki ISO
  const m = v.match(/^(\d{4})[.-](\d{2})[.-](\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 23), Number(m[5] ?? 59), Number(m[6] ?? 59));
}

/** API-KEY ni E-IMZO ga o'rnatadi ([domen, kalit, ...]). */
export async function eimzoSetApiKeys(keys: string[]) {
  // E-IMZO 6 kalitni domen bo'yicha o'zi yuklaydi, «Developer mode» da esa kalit shart emas -
  // shuning uchun xato bo'lsa to'xtamaymiz: keyingi chaqiruv aniq sababni qaytaradi.
  try { await call({ name: "apikey", arguments: keys }); } catch { /* keyingi chaqiruvlar xatoni ko'rsatadi */ }
}

/** Kompyuterdagi ERI kalitlari (PFX) ro'yxati. */
export async function eimzoListKeys(): Promise<EimzoKey[]> {
  const data = await call({ plugin: "pfx", name: "list_all_certificates" });
  const now = Date.now();
  return (data.certificates ?? []).map((c: any): EimzoKey => {
    const a = parseAlias(c.alias ?? "");
    const validTo = parseDate(c.validTo ?? a["validto"]);
    return {
      disk: c.disk, path: c.path, name: c.name, alias: c.alias ?? "",
      cn: c.CN ?? a["cn"] ?? c.name ?? "",
      pinfl: c.PINFL ?? a["1.2.860.3.16.1.2"] ?? a["pinfl"] ?? "",
      tin: c.TIN ?? a["1.2.860.3.16.1.1"] ?? a["tin"] ?? "",
      org: c.O ?? a["o"] ?? "",
      validTo,
      expired: !!validTo && validTo.getTime() < now,
    };
  });
}

/** Tanlangan kalit bilan matnni imzolaydi (parolni E-IMZO o'zi so'raydi) va PKCS#7 (base64) qaytaradi. */
export async function eimzoSign(key: EimzoKey, text: string): Promise<string> {
  const loaded = await call({ plugin: "pfx", name: "load_key", arguments: [key.disk, key.path, key.name, key.alias] });
  const data64 = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
  const signed = await call({ plugin: "pkcs7", name: "create_pkcs7", arguments: [data64, loaded.keyId, "no"] });
  if (!signed.pkcs7_64) throw new Error("Imzo yaratilmadi.");
  return signed.pkcs7_64;
}
