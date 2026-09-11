import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  /// Joriy sessiya bog'langan tashkilot (login'da tanlangan) - Letter/Document/
  /// Employee kabi tashkilotga bog'liq ma'lumotlarni ajratish uchun ishlatiladi.
  organizationId: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
