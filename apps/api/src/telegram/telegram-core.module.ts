import { Module } from "@nestjs/common";
import { TelegramService } from "./telegram.service";
import { CallTelegramService } from "./call-telegram.service";
import { CallTelegramController } from "./call-telegram.controller";

/**
 * Telegram API xizmatlari - BoardModule, TelegramModule va MetaModule ishlatadi (aylanma bog'liqlik bo'lmasligi uchun alohida).
 * CallTelegramService - Call-markazning o'z boti (yangi lidlar haqida xabarlar).
 */
@Module({ providers: [TelegramService, CallTelegramService], controllers: [CallTelegramController], exports: [TelegramService, CallTelegramService] })
export class TelegramCoreModule {}
