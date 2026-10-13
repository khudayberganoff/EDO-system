import { Body, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/enums";
import { TelegramService } from "./telegram.service";
import { TelegramBotService } from "./telegram-bot.service";
import { SaveTelegramTokenDto } from "./dto";

@ApiTags("telegram")
@Controller("telegram")
export class TelegramController {
  constructor(private prisma: PrismaService, private tg: TelegramService, private bot: TelegramBotService) {}

  /** Telegram serverlari chaqiradi. Himoya: webhook'ni ulashda berilgan maxfiy sarlavha. */
  @Public() @SkipThrottle() @HttpCode(200)
  @Post("webhook")
  async webhook(@Headers("x-telegram-bot-api-secret-token") secret: string | undefined, @Body() update: any) {
    if (!this.tg.verifyWebhookSecret(secret)) throw new ForbiddenException();
    // Xato bo'lsa ham 200 qaytadi - aks holda Telegram bir xil xabarni qayta-qayta yuboradi
    await this.bot.handleUpdate(update).catch(() => undefined);
    return { ok: true };
  }

  // ---------- Foydalanuvchi: o'z Telegram hisobini ulash ----------

  @ApiBearerAuth() @Get("status")
  @ApiOperation({ summary: "Bot yoqilganmi va joriy foydalanuvchi ulanganmi" })
  async status(@CurrentUser() user: AuthenticatedUser) {
    const me = await this.prisma.user.findUnique({ where: { id: user.id }, select: { telegramId: true, telegramUsername: true } });
    return { enabled: this.tg.isEnabled(), botUsername: this.tg.getBotUsername(), linked: !!me?.telegramId, username: me?.telegramUsername ?? null };
  }

  @ApiBearerAuth() @Post("link")
  @ApiOperation({ summary: "Telegram'ni ulash uchun 15 daqiqalik bir martalik havola" })
  async link(@CurrentUser() user: AuthenticatedUser) {
    if (!this.tg.isEnabled() || !this.tg.getBotUsername()) throw new ForbiddenException("Telegram bot hali sozlanmagan.");
    await this.prisma.telegramLinkCode.deleteMany({ where: { OR: [{ userId: user.id }, { expiresAt: { lt: new Date() } }] } });
    const code = crypto.randomBytes(18).toString("base64url");
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await this.prisma.telegramLinkCode.create({
      data: { codeHash: crypto.createHash("sha256").update(code).digest("hex"), userId: user.id, expiresAt },
    });
    return { url: `https://t.me/${this.tg.getBotUsername()}?start=${code}`, expiresAt };
  }

  @ApiBearerAuth() @Delete("link")
  async unlink(@CurrentUser() user: AuthenticatedUser) {
    await this.prisma.user.update({ where: { id: user.id }, data: { telegramId: null, telegramUsername: null } });
    return { linked: false };
  }

  // ---------- Administrator: bot tokenini sozlash ----------

  @ApiBearerAuth() @Roles(Role.ADMIN) @Get("config")
  @ApiOperation({ summary: "Bot sozlamasi holati (token ko'rsatilmaydi)" })
  async config() {
    return {
      configured: this.tg.isEnabled(),
      source: this.tg.getSource(),
      botUsername: this.tg.getBotUsername(),
      webhook: await this.tg.webhookInfo(),
      publicUrl: this.tg.publicBaseUrl(),
      linkedUsers: await this.prisma.user.count({ where: { telegramId: { not: null } } }),
    };
  }

  @ApiBearerAuth() @Roles(Role.ADMIN) @Post("config")
  @ApiOperation({ summary: "Bot tokenini saqlash (tekshiriladi, shifrlanadi, webhook ulanadi)" })
  async saveConfig(@Body() dto: SaveTelegramTokenDto) {
    const username = await this.tg.saveToken(dto.token.trim());
    return { configured: true, botUsername: username };
  }

  @ApiBearerAuth() @Roles(Role.ADMIN) @Delete("config")
  async removeConfig() {
    await this.tg.removeToken();
    return { configured: false };
  }
}
