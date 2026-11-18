import { Body, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/enums";
import { CallTelegramService } from "./call-telegram.service";

class SaveCallBotDto {
  @ApiProperty({ description: "BotFather bergan token (123456:ABC...)" })
  @IsString() @Matches(/^\d{6,}:[A-Za-z0-9_-]{30,}$/, { message: "Token formati noto'g'ri (masalan 123456789:AAH...)." })
  token!: string;

  @ApiPropertyOptional({ description: "Telegram'da ko'rinadigan bot nomi, masalan WAFA Call-markaz" })
  @IsOptional() @IsString() @MaxLength(64)
  name?: string;
}

/** So'rov kelgan ommaviy manzil (https://call.wafagroup.uz) - webhook shu manzilga ulanadi. */
function baseOf(req: any): string {
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost").split(",")[0].trim();
  return `${req.protocol}://${host}`;
}

/** Call-markazning o'z Telegram boti: sozlash (administrator), xodimlarni ulash va Telegram webhook'i. */
@ApiTags("calls") @Controller("calls/telegram")
export class CallTelegramController {
  constructor(private bot: CallTelegramService) {}

  @Public() @SkipThrottle() @HttpCode(200) @Post("webhook") @ApiExcludeEndpoint()
  async webhook(@Headers("x-telegram-bot-api-secret-token") secret: string | undefined, @Body() update: any) {
    if (!this.bot.verifyWebhookSecret(secret)) throw new ForbiddenException();
    // Xato bo'lsa ham 200 - aks holda Telegram bir xil xabarni qayta-qayta yuboradi
    await this.bot.handleUpdate(update).catch(() => undefined);
    return { ok: true };
  }

  @ApiBearerAuth() @Get("status") @ApiOperation({ summary: "Call-markaz boti va joriy xodimning ulanishi" })
  status(@CurrentUser() user: AuthenticatedUser) { return this.bot.status(user.id); }

  @ApiBearerAuth() @Post("link") @ApiOperation({ summary: "Telegram'ni ulash uchun 15 daqiqalik havola" })
  link(@CurrentUser() user: AuthenticatedUser) { return this.bot.createLink(user.id); }

  @ApiBearerAuth() @Delete("link")
  unlink(@CurrentUser() user: AuthenticatedUser) { return this.bot.unlink(user.id); }

  @ApiBearerAuth() @Roles(Role.ADMIN) @Get("config") @ApiOperation({ summary: "Bot sozlamasi (token ko'rsatilmaydi)" })
  config() { return this.bot.config(); }

  @ApiBearerAuth() @Roles(Role.ADMIN) @Post("config") @ApiOperation({ summary: "Bot tokenini saqlash (tekshiriladi, shifrlanadi, webhook ulanadi)" })
  save(@Body() dto: SaveCallBotDto, @Req() req: any) { return this.bot.saveToken(dto.token.trim(), dto.name, baseOf(req)); }

  @ApiBearerAuth() @Roles(Role.ADMIN) @Delete("config")
  remove() { return this.bot.removeToken(); }
}
