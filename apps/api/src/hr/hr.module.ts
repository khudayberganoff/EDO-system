import { Module } from "@nestjs/common";
import { HrService } from "./hr.service";
import { HrController } from "./hr.controller";
import { AuditLogModule } from "../audit-log/audit-log.module";

@Module({
  imports: [AuditLogModule],
  providers: [HrService],
  controllers: [HrController],
  exports: [HrService],
})
export class HrModule {}
