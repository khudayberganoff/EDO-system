import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Put, Query, Req, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/enums";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { META_STAGES, MetaService } from "./meta.service";

class SaveAppDto {
  @IsOptional() @IsString() @MaxLength(40) appId?: string;
  @IsOptional() @IsString() @MaxLength(100) appSecret?: string;
  @IsOptional() @IsBoolean() dedupeByPhone?: boolean;
  @IsOptional() @IsBoolean() notifyTelegram?: boolean;
  @IsOptional() @IsString() @MaxLength(40) loginConfigId?: string;
}

class OauthStartDto {
  @IsOptional() @IsString() @MaxLength(500) returnUrl?: string;
}

class UpdatePageDto {
  @IsOptional() @IsBoolean() allForms?: boolean;
  @IsOptional() @IsIn(META_STAGES) stage?: string;
  @IsOptional() @IsString() organizationId?: string | null;
  @IsOptional() @IsString() assigneeId?: string | null;
}

class SaveFormDto {
  /** null - "Barcha formalar" sozlamasiga bo'ysunadi */
  @IsOptional() @IsBoolean() enabled?: boolean | null;
  @IsOptional() @IsObject() mapping?: Record<string, string>;
  @IsOptional() @IsString() stage?: string | null;
  @IsOptional() @IsString() organizationId?: string | null;
  @IsOptional() @IsString() assigneeId?: string | null;
}

/** So'rov kelgan ommaviy manzil (https://call.wafagroup.uz). Reverse proxy ortida X-Forwarded-* dan olinadi. */
function baseOf(req: any): string {
  const env = process.env.META_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (env) return env;
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost").split(",")[0].trim();
  return `${req.protocol}://${host}`;
}

/** OAuth'dan keyin qaytiladigan sahifa: faqat shu saytning o'zi (yoki ishlab chiqishda localhost). */
function safeReturnUrl(req: any, url?: string): string {
  if (!url) return "/settings";
  try {
    const u = new URL(url);
    const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0].trim();
    const devLocal = process.env.NODE_ENV !== "production" && u.hostname === "localhost";
    if (u.host === host || devLocal) return `${u.origin}${u.pathname}`;
  } catch { /* nisbiy yoki noto'g'ri manzil */ }
  return "/settings";
}

@ApiTags("meta")
@Controller("meta")
export class MetaController {
  constructor(private meta: MetaService) {}

  // ---------- Meta uchun ochiq manzillar ----------

  /** Webhook'ni tasdiqlash: Meta panelidagi "Verify and Save" */
  @Public() @SkipThrottle() @Get("webhook") @ApiExcludeEndpoint()
  async verify(@Query() q: Record<string, string>, @Res() res: any) {
    if (await this.meta.verifyWebhook(q["hub.mode"], q["hub.verify_token"])) {
      return res.status(200).type("text/plain").send(String(q["hub.challenge"] ?? ""));
    }
    return res.status(403).type("text/plain").send("Forbidden");
  }

  /** Leadgen xabari (imzo tekshiriladi, ishlov fon rejimida) */
  @Public() @SkipThrottle() @Post("webhook") @HttpCode(200) @ApiExcludeEndpoint()
  async receive(@Req() req: any, @Headers("x-hub-signature-256") signature: string | undefined, @Body() body: any) {
    await this.meta.receiveWebhook(req.rawBody, signature, body);
    return "EVENT_RECEIVED";
  }

  @Public() @Get("oauth/callback") @ApiExcludeEndpoint()
  async callback(@Query() q: Record<string, string>, @Res() res: any) {
    res.redirect(302, await this.meta.oauthCallback(q));
  }

  // ---------- Administrator ----------

  @ApiBearerAuth() @Roles(Role.ADMIN) @Get("status")
  @ApiOperation({ summary: "Facebook Lead Ads integratsiyasi holati" })
  status(@Req() req: any) {
    return this.meta.status(baseOf(req));
  }

  @ApiBearerAuth() @Roles(Role.ADMIN) @Put("app")
  async saveApp(@Body() dto: SaveAppDto) {
    await this.meta.saveApp(dto);
    return { ok: true };
  }

  @ApiBearerAuth() @Roles(Role.ADMIN) @Post("app/verify-token") @HttpCode(200)
  async regenerate() {
    return { verifyToken: await this.meta.regenerateVerifyToken() };
  }

  @ApiBearerAuth() @Roles(Role.ADMIN) @Post("oauth/start") @HttpCode(200)
  @ApiOperation({ summary: "Facebook'ga ulash: avtorizatsiya oynasi manzilini qaytaradi" })
  start(@CurrentUser() user: AuthenticatedUser, @Req() req: any, @Body() dto: OauthStartDto) {
    return this.meta.oauthStart(user, baseOf(req), safeReturnUrl(req, dto.returnUrl));
  }

  @ApiBearerAuth() @Roles(Role.ADMIN) @Delete("connection")
  async disconnect() {
    await this.meta.disconnectAll();
    return { ok: true };
  }

  @ApiBearerAuth() @Roles(Role.ADMIN) @Post("pages/:pageId/connect") @HttpCode(200)
  connectPage(@Param("pageId") pageId: string) {
    return this.meta.connectPage(pageId);
  }

  @ApiBearerAuth() @Roles(Role.ADMIN) @Put("pages/:pageId")
  updatePage(@Param("pageId") pageId: string, @Body() dto: UpdatePageDto) {
    return this.meta.updatePage(pageId, dto);
  }

  @ApiBearerAuth() @Roles(Role.ADMIN) @Delete("pages/:pageId")
  disconnectPage(@Param("pageId") pageId: string) {
    return this.meta.disconnectPage(pageId);
  }

  @ApiBearerAuth() @Roles(Role.ADMIN) @Get("pages/:pageId/forms")
  forms(@Param("pageId") pageId: string, @Query("refresh") refresh?: string) {
    return this.meta.forms(pageId, refresh === "1" || refresh === "true");
  }

  @ApiBearerAuth() @Roles(Role.ADMIN) @Put("forms/:formId/mapping")
  saveForm(@Param("formId") formId: string, @Body() dto: SaveFormDto) {
    return this.meta.saveForm(formId, dto);
  }

  @ApiBearerAuth() @Roles(Role.ADMIN) @Get("events")
  events(@Query("status") status?: string) {
    return this.meta.events(status && ["new", "done", "skipped", "error"].includes(status) ? status : undefined);
  }

  @ApiBearerAuth() @Roles(Role.ADMIN) @Post("events/:id/retry") @HttpCode(200)
  retry(@Param("id") id: string) {
    return this.meta.retryEvent(id);
  }
}
