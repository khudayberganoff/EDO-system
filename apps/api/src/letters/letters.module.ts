import { Module } from "@nestjs/common";
import { LettersService } from "./letters.service";
import { LettersController } from "./letters.controller";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { LetterAiAgentService } from "./letter-ai-agent.service";

@Module({
  imports: [AuditLogModule],
  providers: [LettersService, LetterAiAgentService],
  controllers: [LettersController],
  exports: [LettersService],
})
export class LettersModule {}
