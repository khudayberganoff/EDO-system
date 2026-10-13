import { Module } from "@nestjs/common";
import { TelegramService } from "./telegram.service";

/** Telegram API xizmati - BoardModule ham, TelegramModule ham ishlatadi (aylanma bog'liqlik bo'lmasligi uchun alohida). */
@Module({ providers: [TelegramService], exports: [TelegramService] })
export class TelegramCoreModule {}
