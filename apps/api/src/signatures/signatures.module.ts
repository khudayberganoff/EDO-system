import { Module } from "@nestjs/common";
import { SignaturesService } from "./signatures.service";
import { SignaturesController } from "./signatures.controller";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { MockSignatureProvider } from "./providers/mock-signature.provider";
import { SIGNATURE_PROVIDER } from "./providers/signature-provider.interface";

@Module({
  imports: [AuditLogModule],
  providers: [
    SignaturesService,
    {
      // E-IMZO tayyor bo'lganda: shu qatorni EimzoSignatureProvider ga almashtiring.
      // Boshqa hech qanday kod o'zgarishi shart emas.
      provide: SIGNATURE_PROVIDER,
      useClass: MockSignatureProvider,
    },
  ],
  controllers: [SignaturesController],
})
export class SignaturesModule {}
