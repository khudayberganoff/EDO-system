import { Module } from "@nestjs/common";
import { ApiKeyService } from "./api-key.service";
import { ApiKeyGuard } from "./api-key.guard";
import { PublicApiController } from "./public-api.controller";
import { ApiKeysController } from "./api-keys.controller";
import { HrModule } from "../hr/hr.module";
import { LettersModule } from "../letters/letters.module";

@Module({
  imports: [HrModule, LettersModule],
  providers: [ApiKeyService, ApiKeyGuard],
  controllers: [PublicApiController, ApiKeysController],
  exports: [ApiKeyService],
})
export class PublicApiModule {}
