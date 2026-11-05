/**
 * Ikki sayt - bitta tizim: `call.*` manzili faqat Call-markaz uchun (boshqa bo'limlar yopiq),
 * qolgan manzillar (edo.*) esa odatdagi EDO. Manzil `Host` sarlavhasidan aniqlanadi
 * (reverse proxy uni o'zgartirmay uzatadi).
 */
export function isCallHost(host: string | undefined | null): boolean {
  return (host ?? "").toLowerCase().split(":")[0].startsWith("call.");
}

/** Call-saytida ochiq API yo'llari: kirish, Call-markaz va o'z ruxsatlarini bilish. */
export function isCallSiteApiPath(path: string): boolean {
  return (
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/calls/") ||
    path === "/api/settings/my-access"
  );
}
