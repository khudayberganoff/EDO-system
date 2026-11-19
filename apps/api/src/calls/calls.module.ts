import { Module } from "@nestjs/common";
import { CallsController } from "./calls.controller";
import { CallsService } from "./calls.service";
import { CrmModule } from "../crm/crm.module";
import { SettingsModule } from "../settings/settings.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { TelephonyModule } from "../telephony/telephony.module";
import { TelegramCoreModule } from "../telegram/telegram-core.module";
import { LeadRemindersService } from "./lead-reminders.service";

@Module({ imports: [CrmModule, SettingsModule, AuditLogModule, TelephonyModule, TelegramCoreModule], controllers: [CallsController], providers: [CallsService, LeadRemindersService] })
export class CallsModule {}
