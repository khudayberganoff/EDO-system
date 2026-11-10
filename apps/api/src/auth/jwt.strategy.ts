import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Production'da JWT_SECRET majburiy (main.ts tekshiradi); bu zaxira qiymat faqat mahalliy ishlab chiqish uchun
      secretOrKey: config.get<string>("JWT_SECRET") ?? "change_me_in_production",
    });
  }

  async validate(payload: { sub: string; email: string; role: string; organizationId?: string; purpose?: string }) {
    // Maxsus maqsadli tokenlar (masalan ERI'dan keyin tashkilot tanlash) sessiya tokeni sifatida ishlamaydi
    if (payload.purpose) throw new UnauthorizedException("Token bu maqsad uchun emas.");
    // Har so'rovda bajariladi - foydalanuvchi va tashkilotga a'zoligi BITTA so'rovda olinadi
    const user = payload.sub
      ? await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: {
            id: true, email: true, role: true, isActive: true,
            organizations: payload.organizationId ? { where: { organizationId: payload.organizationId }, select: { id: true } } : false,
          },
        })
      : null;
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Foydalanuvchi topilmadi yoki bloklangan.");
    }
    // Eski (tashkilot tanlashdan oldingi) tokenlarda organizationId yo'q -
    // qayta login qilishga majbur qilamiz.
    if (!payload.organizationId) {
      throw new UnauthorizedException("Sessiya eskirgan - qaytadan tizimga kiring.");
    }
    // Ruxsat qaytarib olingan bo'lishi mumkin - har so'rovda tekshiramiz.
    if (!user.organizations?.length) {
      throw new UnauthorizedException("Ushbu tashkilotga kirish huquqi bekor qilingan - qaytadan tizimga kiring.");
    }
    // Bu obyekt @CurrentUser() dekoratori orqali controller'larda ishlatiladi
    return { id: user.id, email: user.email, role: user.role, organizationId: payload.organizationId };
  }
}
