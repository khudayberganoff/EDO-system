/**
 * Ikki sayt - bitta tizim: `call.*` manzili faqat Call-markaz uchun (boshqa bo'limlar yopiq),
 * qolgan manzillar (edo.*) esa odatdagi EDO. Manzil `Host` sarlavhasidan aniqlanadi
 * (reverse proxy uni o'zgartirmay uzatadi).
 */
export function isCallHost(host: string | undefined | null): boolean {
  return (host ?? "").toLowerCase().split(":")[0].startsWith("call.");
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

/** Call-saytida ochiq API yo'llari: yuqoridagilar + administrator uchun sozlamalar (xodimlar, rollar, IP-telefoniya sozlamasi). */
export function isCallSiteApiPath(path: string): boolean {
  return isOperatorApiPath(path) || path.startsWith("/api/settings/") || path.startsWith("/api/telephony/settings");
}
