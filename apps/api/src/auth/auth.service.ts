import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { AuditLogService } from "../audit-log/audit-log.service";
import { AuditAction } from "../common/enums";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private auditLog: AuditLogService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Xavfsizlik uchun: email topilmadimi yoki parol xato - bir xil xabar qaytariladi
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Email yoki parol noto'g'ri.");
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Email yoki parol noto'g'ri.");
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);

    await this.auditLog.record({
      userId: user.id,
      action: AuditAction.LOGIN,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }
}
