import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/enums";
import { AuditLogService } from "./audit-log.service";

@ApiTags("audit-log")
@ApiBearerAuth()
@Controller("audit-log")
export class AuditLogController {
  constructor(private auditLogService: AuditLogService) {}

  @Get("document/:documentId")
  @Roles(Role.ADMIN, Role.AUDITOR, Role.MANAGER)
  @ApiOperation({ summary: "Bitta hujjat bo'yicha to'liq audit tarixi" })
  findForDocument(@Param("documentId") documentId: string) {
    return this.auditLogService.findForDocument(documentId);
  }
}
