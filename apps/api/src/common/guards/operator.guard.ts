import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Role } from "../enums";
import { isOperatorApiPath } from "../site-mode";

/**
 * Call-markaz operatori faqat o'z bo'limi API'sidan foydalanadi (qo'ng'iroqlar, lidlar, kalendar, o'z sessiyasi).
 * Boshqa hamma yo'l (xatlar, hujjatlar, kadrlar, doska, sozlamalar...) tokeni bilan ham yopiq - himoya serverda.
 */
@Injectable()
export class OperatorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (req.user?.role !== Role.OPERATOR) return true;
    const path: string = String(req.originalUrl ?? req.url ?? "").split("?")[0].replace(/\/+$/, "");
    if (isOperatorApiPath(path)) return true;
    throw new ForbiddenException("Operator faqat Call-markaz bilan ishlaydi.");
  }
}
