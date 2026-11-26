/**
 * Server rejimi (`SITE_MODE` muhit o'zgaruvchisi):
 * - `call` - alohida Call-markaz tizimi: o'z serveri, o'z bazasi va o'z logini. Har qanday manzil Call-markaz.
 * - `edo`  - alohida EDO tizimi: Call-markaz API'lari (qo'ng'iroqlar, telefoniya, Facebook) o'chiq.
 * - `both` (standart, eski rejim) - bitta server: `call.*` manzili Call-markaz, qolgani EDO.
 */
export type SiteMode = "call" | "edo" | "both";
export function siteMode(): SiteMode {
  const m = (process.env.SITE_MODE ?? "").trim().toLowerCase();
  return m === "call" || m === "edo" ? m : "both";
}

/**
 * Bu so'rov Call-markaz uchunmi: alohida rejimlarda server turi bo'yicha, umumiy rejimda esa
 * `Host` sarlavhasidan (`call.*` manzili) aniqlanadi (reverse proxy uni o'zgartirmay uzatadi).
 */
export function isCallHost(host: string | undefined | null): boolean {
  const mode = siteMode();
  if (mode === "call") return true;
  if (mode === "edo") return false;
  return (host ?? "").toLowerCase().split(":")[0].startsWith("call.");
}

/** Faqat Call-markazga tegishli API yo'llari - alohida EDO serverida (SITE_MODE=edo) yopiladi. */
export function isCallOnlyApiPath(path: string): boolean {
  return path.startsWith("/api/calls") || path.startsWith("/api/telephony") || path.startsWith("/api/meta");
}

/** Operator (va umuman Call-markaz) ishlatadigan API yo'llari: kirish, Call-markaz, o'z ruxsatlari, telefoniya webhook/yozuv. */
export function isOperatorApiPath(path: string): boolean {
  return (
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/calls/") ||
    path.startsWith("/api/telephony/webhook") ||
    path.startsWith("/api/telephony/recording") ||
    path === "/api/settings/my-access"
  );
}

/**
 * Call-saytida ochiq API yo'llari: yuqoridagilar + administrator uchun sozlamalar (xodimlar, rollar, IP-telefoniya)
 * va Facebook Lead Ads (webhook, OAuth, sozlash - administrator; webhook'ni imzo himoyalaydi).
 */
export function isCallSiteApiPath(path: string): boolean {
  return isOperatorApiPath(path) || path.startsWith("/api/settings/") || path.startsWith("/api/telephony/settings") || path.startsWith("/api/telephony/freepbx-install") || path.startsWith("/api/meta/");
}
