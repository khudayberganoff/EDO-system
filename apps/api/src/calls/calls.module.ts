import { Module } from "@nestjs/common";
import { CallsController } from "./calls.controller";
import { CallsService } from "./calls.service";
import { CrmModule } from "../crm/crm.module";
import { SettingsModule } from "../settings/settings.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { TelephonyModule } from "../telephony/telephony.module";

@Module({ imports: [CrmModule, SettingsModule, AuditLogModule, TelephonyModule], controllers: [CallsController], providers: [CallsService] })
export class CallsModule {}
