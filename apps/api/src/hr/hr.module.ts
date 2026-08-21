import { Module } from "@nestjs/common";
import { HrService } from "./hr.service";
import { HrController } from "./hr.controller";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { LetterPdfService } from "../letters/letter-pdf.service";

@Module({
  imports: [AuditLogModule],
  providers: [HrService, LetterPdfService],
  controllers: [HrController],
  exports: [HrService],
})
export class HrModule {}
