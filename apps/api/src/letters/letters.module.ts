import { Module } from "@nestjs/common";
import { LettersService } from "./letters.service";
import { LettersController } from "./letters.controller";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { LetterAiAgentService } from "./letter-ai-agent.service";
import { LetterPdfService } from "./letter-pdf.service";

@Module({
  imports: [AuditLogModule],
  providers: [LettersService, LetterAiAgentService, LetterPdfService],
  controllers: [LettersController],
  exports: [LettersService],
})
export class LettersModule {}
