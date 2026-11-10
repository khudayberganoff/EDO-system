import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { SettingsService } from "../../settings/settings.service";

type Rule = { view: string[]; edit: string[] };

/**
 * Yo'l -> bo'lim(lar). "Sozlamalar -> Rollar va ruxsatlar" jadvali faqat menyuni emas, serverni ham boshqaradi:
 * bo'lim yopiq rol API'ga to'g'ridan-to'g'ri murojaat qilsa ham ma'lumot ololmaydi.
 * `view` - o'qish uchun yetarli bo'limlardan biri, `edit` - o'zgartirish uchun yetarli bo'limlardan biri.
 */
function ruleFor(path: string, method: string): Rule | null {
  if (path === "/api/hr/my") return { view: ["my-hr"], edit: [] };
  if (path.startsWith("/api/hr/") || path === "/api/hr") return { view: ["hr"], edit: ["hr"] };
  if (path.startsWith("/api/letters/verify/")) return null; // QR orqali ochiq tekshiruv
  if (method === "POST" && /^\/api\/letters\/[^/]+\/(approve|reject)$/.test(path)) return { view: [], edit: ["letters", "approvals"] };
  if (path.startsWith("/api/letters") || path.startsWith("/api/mail") || path.startsWith("/api/crm")) {
    return { view: ["letters", "approvals", "deleted"], edit: ["letters"] };
  }
  // Bosh sahifadagi "Mening vazifalarim" ham doska ma'lumotini o'qiydi
  if (path.startsWith("/api/board") || path.startsWith("/api/daily-tasks")) return { view: ["board", "dashboard"], edit: ["board"] };
  if (path.startsWith("/api/api-keys")) return { view: ["integrations"], edit: ["integrations"] };
  return null;
}

@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(private settings: SettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (!req.user) return true; // ochiq (@Public) yo'llar - o'z himoyasi bor

    const path: string = String(req.originalUrl ?? req.url ?? "").split("?")[0].replace(/\/+$/, "");
    const method: string = String(req.method).toUpperCase();
    const rule = ruleFor(path, method);
    if (!rule) return true;

    const access = await this.settings.myAccess(req.user.role);
    const isRead = method === "GET" || method === "HEAD" || method === "OPTIONS";
    const ok = isRead
      ? rule.view.some((m) => access[m]?.canView)
      : rule.edit.some((m) => access[m]?.canEdit);
    if (!ok) throw new ForbiddenException(isRead ? "Bu bo'limni ko'rish uchun sizda ruxsat yo'q." : "Bu bo'limda o'zgartirish uchun sizda ruxsat yo'q.");
    return true;
  }
}
