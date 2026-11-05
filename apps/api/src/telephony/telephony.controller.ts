import { All, Body, Controller, Delete, Get, Headers, HttpCode, Post, Put, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import { PrismaService } from "../prisma/prisma.service";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/enums";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { TelephonyService } from "./telephony.service";

class UpdateTelephonyDto {
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsBoolean() autoLead?: boolean;
}

@ApiTags("telephony")
@Controller("telephony")
export class TelephonyController {
  constructor(private tel: TelephonyService, private prisma: PrismaService) {}

  /**
   * ATS shu manzilga har bir qo'ng'iroq haqida GET yoki POST yuboradi (JSON yoki form).
   * Himoya: maxfiy `token` (so'rov parametri yoki `X-Webhook-Token` sarlavhasi). Zadarma tekshiruvi uchun `zd_echo` qaytariladi.
   */
  @Public() @SkipThrottle() @HttpCode(200)
  @All("webhook")
  @ApiOperation({ summary: "IP-telefoniya (ATS) webhook: qo'ng'iroqni bazaga yozadi" })
  async webhook(@Req() req: any, @Body() body: Record<string, any>, @Query() query: Record<string, any>, @Headers("x-webhook-token") headerToken?: string) {
    if (query.zd_echo) return String(query.zd_echo); // Zadarma webhook manzilini tasdiqlash
    const token = (query.token as string | undefined) ?? headerToken;
    const { token: _t, ...rest } = query;
    return this.tel.ingest({ ...rest, ...(body && typeof body === "object" ? body : {}) }, token);
  }

  // ---------- Administrator: sozlash ----------

  @ApiBearerAuth() @Roles(Role.ADMIN) @Get("settings")
  async settings(@CurrentUser() user: AuthenticatedUser) {
    const cfg = await this.tel.getConfig(user.organizationId);
    const [orgs, last, total, today] = await Promise.all([
      this.prisma.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      this.tel.lastPayload(),
      this.prisma.phoneCall.count(),
      this.prisma.phoneCall.count({ where: { startedAt: { gte: new Date(Date.now() - 24 * 3600_000) } } }),
    ]);
    return { token: cfg.token, organizationId: cfg.organizationId ?? orgs[0]?.id ?? null, autoLead: cfg.autoLead, organizations: orgs, last, total, last24h: today };
  }

  @ApiBearerAuth() @Roles(Role.ADMIN) @Put("settings")
  async update(@Body() dto: UpdateTelephonyDto, @CurrentUser() user: AuthenticatedUser) {
    await this.tel.updateConfig(dto, user.organizationId);
    return { ok: true };
  }

  @ApiBearerAuth() @Roles(Role.ADMIN) @Post("settings/regenerate-token") @HttpCode(200)
  async regenerate(@CurrentUser() user: AuthenticatedUser) {
    const cfg = await this.tel.regenerateToken(user.organizationId);
    return { token: cfg.token };
  }
}
