import { Module } from "@nestjs/common";
import { TelegramCoreModule } from "../telegram/telegram-core.module";
import { MetaController } from "./meta.controller";
import { MetaService } from "./meta.service";

/** Facebook / Instagram Lead Ads -> Call-markaz lidlari */
@Module({ imports: [TelegramCoreModule], controllers: [MetaController], providers: [MetaService] })
export class MetaModule {}
