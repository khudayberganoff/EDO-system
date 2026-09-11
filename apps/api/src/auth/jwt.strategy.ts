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
      secretOrKey: config.get<string>("JWT_SECRET") ?? "change_me_in_production",
    });
  }

  async validate(payload: { sub: string; email: string; role: string; organizationId?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Foydalanuvchi topilmadi yoki bloklangan.");
    }
    // Eski (tashkilot tanlashdan oldingi) tokenlarda organizationId yo'q -
    // qayta login qilishga majbur qilamiz.
    if (!payload.organizationId) {
      throw new UnauthorizedException("Sessiya eskirgan - qaytadan tizimga kiring.");
    }
    // Ruxsat qaytarib olingan bo'lishi mumkin - har so'rovda tekshiramiz.
    const membership = await this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: payload.organizationId } },
    });
    if (!membership) {
      throw new UnauthorizedException("Ushbu tashkilotga kirish huquqi bekor qilingan - qaytadan tizimga kiring.");
    }
    // Bu obyekt @CurrentUser() dekoratori orqali controller'larda ishlatiladi
    return { id: user.id, email: user.email, role: user.role, organizationId: payload.organizationId };
  }
}
