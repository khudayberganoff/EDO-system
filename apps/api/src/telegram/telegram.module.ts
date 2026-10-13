import { Module } from "@nestjs/common";
import { BoardModule } from "../board/board.module";
import { TelegramCoreModule } from "./telegram-core.module";
import { TelegramBotService } from "./telegram-bot.service";
import { TelegramController } from "./telegram.controller";

@Module({
  imports: [BoardModule, TelegramCoreModule],
  providers: [TelegramBotService],
  controllers: [TelegramController],
})
export class TelegramModule {}
