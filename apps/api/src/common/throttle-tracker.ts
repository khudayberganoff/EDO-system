import { createHash } from "crypto";

/**
 * So'rovlar cheklovi kimga hisoblanishi: tizimga kirgan foydalanuvchi - o'z tokeni bo'yicha (ofisdagi hamma
 * bitta tashqi IP ortida bo'lsa ham har kimga alohida limit), qolganlar - IP bo'yicha.
 * Kirish yo'llari (/api/auth/*) DOIM IP bo'yicha: aks holda parol terib ko'ruvchi har so'rovga soxta token
 * qo'shib cheklovni aylanib o'tardi.
 */
export function throttleTracker(req: Record<string, any>): string {
  const path = String(req.originalUrl ?? req.url ?? "");
  const auth = req.headers?.authorization;
  if (!path.startsWith("/api/auth/") && typeof auth === "string" && auth.startsWith("Bearer ") && auth.length > 40) {
    return `t:${createHash("sha1").update(auth).digest("base64")}`;
  }
  return `ip:${req.ip ?? ""}`;
}
