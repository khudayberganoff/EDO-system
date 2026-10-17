import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Role } from "../enums";

/** Kuzatuvchi (OBSERVER) yozishi mumkin bo'lgan yagona amallar: vazifa kiritish, izoh yozish, baholash, o'z sessiyasi. */
const ALLOWED_WRITES: { method: string; pattern: RegExp }[] = [
  { method: "POST", pattern: /^\/api\/board\/tasks$/ },
  { method: "POST", pattern: /^\/api\/board\/tasks\/[^/]+\/comments$/ },
  { method: "DELETE", pattern: /^\/api\/board\/tasks\/[^/]+\/comments\/[^/]+$/ },
  { method: "POST", pattern: /^\/api\/board\/tasks\/[^/]+\/rating$/ },
  { method: "DELETE", pattern: /^\/api\/board\/tasks\/[^/]+\/rating$/ },
  { method: "POST", pattern: /^\/api\/auth\/(switch-organization|change-password)$/ },
  { method: "POST", pattern: /^\/api\/telegram\/link$/ },
  { method: "DELETE", pattern: /^\/api\/telegram\/link$/ },
];

/** Kuzatuvchiga yopiq bo'limlar (pochta, tashqi tizimlar). Kadrlar (xodimlar hujjatlari) o'qish uchun ochiq. */
const BLOCKED_READS = [/^\/api\/mail(\/|$)/, /^\/api\/api-keys(\/|$)/];

/**
 * Kuzatuvchi: ikkala korxonaning barcha hujjat va xatlarini FAQAT ko'ra oladi, vazifa kiritadi va
 * "Tekshiruvda" vazifalarni 1-5 baholaydi. Boshqa har qanday o'zgartirish rad etiladi.
 * (Interfeys ham tugmalarni yashiradi, lekin himoya serverda.)
 */
@Injectable()
export class ObserverGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (req.user?.role !== Role.OBSERVER) return true;

    const path: string = String(req.originalUrl ?? req.url ?? "").split("?")[0].replace(/\/+$/, "");
    const method: string = String(req.method).toUpperCase();

    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      if (BLOCKED_READS.some((re) => re.test(path))) {
        throw new ForbiddenException("Kuzatuvchiga bu bo'lim ochiq emas.");
      }
      return true;
    }
    if (ALLOWED_WRITES.some((a) => a.method === method && a.pattern.test(path))) return true;
    throw new ForbiddenException("Kuzatuvchi faqat ko'rishi, vazifa kiritishi va baholashi mumkin.");
  }
}
