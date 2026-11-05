import { All, BadRequestException, Body, CanActivate, Controller, ExecutionContext, Get, Headers, HttpCode, Injectable, Param, Post, Put, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { ForbiddenException } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import { PrismaService } from "../prisma/prisma.service";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/enums";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { AUDIO_TYPES, RECORDINGS_DIR, TelephonyService } from "./telephony.service";

/** Yozuv yuklashdan OLDIN token tekshiriladi (fayl diskka yozilishidan oldin), aks holda ruxsatsiz kimdir diskni to'ldirishi mumkin. */
@Injectable()
class TelephonyTokenGuard implements CanActivate {
  constructor(private tel: TelephonyService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const token = (req.query?.token as string | undefined) ?? (req.headers["x-webhook-token"] as string | undefined);
    if (!this.tel.verifyToken(token, await this.tel.getConfig())) throw new ForbiddenException();
    return true;
  }
}

class UpdateTelephonyDto {
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsBoolean() autoLead?: boolean;
  @IsOptional() @IsIn([0, 30, 90, 180, 365]) retentionDays?: number;
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

  /**
   * ATS qo'ng'iroq tugagach yozuv faylini yuboradi: `POST /api/telephony/recording?token=...&id=<qo'ng'iroq ID>` (multipart, maydon `file`).
   * Avval shu qo'ng'iroq haqidagi webhook yuborilgan bo'lishi kerak.
   */
  @Public() @SkipThrottle() @HttpCode(200) @UseGuards(TelephonyTokenGuard)
  @Post("recording")
  @UseInterceptors(FileInterceptor("file", {
    limits: { fileSize: 100 * 1024 * 1024 },
    storage: diskStorage({
      destination: (_req, _file, cb) => { fs.mkdirSync(RECORDINGS_DIR, { recursive: true }); cb(null, RECORDINGS_DIR); },
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${path.extname(file.originalname).toLowerCase()}`),
    }),
    fileFilter: (_req, file, cb) => {
      if (AUDIO_TYPES[path.extname(file.originalname).toLowerCase()]) return cb(null, true);
      cb(new BadRequestException("Yozuv formati qo'llab-quvvatlanmaydi (mp3, wav, ogg, opus, m4a, aac, flac)."), false);
    },
  }))
  async uploadRecording(@Query("id") id: string | undefined, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException("Fayl yuborilmadi (multipart, maydon nomi: file).");
    if (!id) { try { fs.unlinkSync(file.path); } catch { /* */ } throw new BadRequestException("Qo'ng'iroq ID (id) ko'rsatilmagan."); }
    return this.tel.attachRecording(id, file);
  }

  /** Imzolangan havola bo'yicha yozuvni beradi (Range qo'llab-quvvatlanadi: tinglashda oldinga o'tkazish ishlaydi). */
  @Public() @SkipThrottle()
  @Get("recording/:id")
  async play(@Param("id") id: string, @Query("exp") exp: string, @Query("sig") sig: string, @Query("download") download: string | undefined, @Res() res: any) {
    const f = await this.tel.openRecording(id, exp, sig);
    res.setHeader("Content-Type", f.mime);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    res.sendFile(f.full);
  }

  // ---------- Administrator: sozlash ----------

  @ApiBearerAuth() @Roles(Role.ADMIN) @Get("settings")
  async settings(@CurrentUser() user: AuthenticatedUser) {
    const cfg = await this.tel.getConfig(user.organizationId);
    const [orgs, last, total, today, rec] = await Promise.all([
      this.prisma.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      this.tel.lastPayload(),
      this.prisma.phoneCall.count(),
      this.prisma.phoneCall.count({ where: { startedAt: { gte: new Date(Date.now() - 24 * 3600_000) } } }),
      this.prisma.phoneCall.aggregate({ where: { recordingFile: { not: null } }, _sum: { recordingSize: true }, _count: true }),
    ]);
    return { token: cfg.token, organizationId: cfg.organizationId ?? orgs[0]?.id ?? null, autoLead: cfg.autoLead, retentionDays: cfg.retentionDays ?? 0, recordingBytes: rec._sum.recordingSize ?? 0, recordingCount: rec._count, organizations: orgs, last, total, last24h: today };
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
