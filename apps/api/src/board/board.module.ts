import { Module } from "@nestjs/common";
import { BoardService } from "./board.service";
import { BoardController } from "./board.controller";
import { TelegramCoreModule } from "../telegram/telegram-core.module";

@Module({
  imports: [TelegramCoreModule],
  providers: [BoardService],
  exports: [BoardService],
  controllers: [BoardController],
})
export class BoardModule {}
