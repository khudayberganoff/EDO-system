import { BadRequestException, Body, Controller, Delete, Get, Headers, Ip, Post, Put, HttpCode, HttpStatus, Res } from "@nestjs/common";
import { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { EimzoService } from "./eimzo.service";
import { EimzoLoginDto, EimzoSelectOrgDto, SaveEimzoConfigDto } from "./dto/eimzo.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/enums";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { SwitchOrganizationDto } from "./dto/switch-organization.dto";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService, private eimzo: EimzoService) {}

  @Public()
  @Get("organizations")
  @ApiOperation({ summary: "Kirish sahifasidagi tashkilot tanlagichi uchun - barcha tashkilotlar ro'yxati" })
  listOrganizations() {
    return this.authService.listOrganizations();
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Email, parol va tanlangan tashkilot bilan tizimga kirish, JWT token qaytaradi" })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // ---------- ERI (E-IMZO) orqali kirish ----------

  @Public()
  @Get("eimzo/config")
  @ApiOperation({ summary: "Kirish sahifasi uchun: ERI yoqilganmi va brauzerga beriladigan API-KEY" })
  eimzoConfig() {
    return this.eimzo.publicConfig();
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get("eimzo/challenge")
  @ApiOperation({ summary: "ERI bilan imzolash uchun bir martalik challenge (e-imzo-server dan)" })
  async eimzoChallenge(@Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store");
    return { challenge: await this.eimzo.challenge() };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("eimzo/login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Imzolangan challenge (PKCS#7) bilan kirish - JSHSHIR bo'yicha foydalanuvchi topiladi" })
  async eimzoLogin(@Body() dto: EimzoLoginDto, @Ip() ip: string, @Headers("x-real-ip") realIp?: string, @Headers("x-forwarded-for") fwd?: string) {
    const clientIp = (realIp || fwd?.split(",")[0] || ip || "").trim();
    const cert = await this.eimzo.verify(dto.pkcs7, clientIp);
    if (!cert.pinfl) throw new BadRequestException("Sertifikatda JSHSHIR topilmadi: faqat jismoniy shaxs ERI kaliti bilan kirish mumkin.");
    return this.authService.loginWithEri(cert.pinfl, dto.organizationId);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("eimzo/select-organization")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "ERI dan keyin tashkilotni tanlash (selectionToken bilan)" })
  eimzoSelectOrg(@Body() dto: EimzoSelectOrgDto) {
    return this.authService.selectOrganizationAfterEri(dto.selectionToken, dto.organizationId);
  }

  @ApiBearerAuth() @Roles(Role.ADMIN)
  @Get("eimzo/settings")
  @ApiOperation({ summary: "ERI sozlamasi (administrator)" })
  async eimzoSettings() {
    const { config, source } = await this.eimzo.getConfig();
    return { configured: !!config, source, serverUrl: config?.serverUrl ?? "", domain: config?.domain ?? "", apiKey: config?.apiKey ?? "" };
  }

  @ApiBearerAuth() @Roles(Role.ADMIN)
  @Put("eimzo/settings")
  @ApiOperation({ summary: "ERI sozlamasini saqlash (server javobi tekshiriladi)" })
  async saveEimzoSettings(@Body() dto: SaveEimzoConfigDto) {
    await this.eimzo.saveConfig(dto);
    return { configured: true };
  }

  @ApiBearerAuth() @Roles(Role.ADMIN)
  @Delete("eimzo/settings")
  async removeEimzoSettings() {
    await this.eimzo.removeConfig();
    return { configured: false };
  }

  @Get("my-organizations")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Joriy foydalanuvchi kira oladigan tashkilotlar ro'yxati" })
  myOrganizations(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.myOrganizations(user.id);
  }

  @Post("switch-organization")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Qayta parol so'ramasdan boshqa (kira oladigan) tashkilotga o'tish" })
  switchOrganization(@Body() dto: SwitchOrganizationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authService.switchOrganization(user.id, dto.organizationId);
  }

  @Post("change-password")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Foydalanuvchi o'zi parolini almashtiradi (joriy parol kerak)" })
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }
}
