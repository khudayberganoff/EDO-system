import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CrmService } from "./crm.service";
import { PrismaService } from "../prisma/prisma.service";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";

@ApiTags("crm") @ApiBearerAuth() @Controller("crm")
export class CrmController {
  constructor(private crm: CrmService, private prisma: PrismaService) {}

  @Get("status") @ApiOperation({ summary: "CRM bilan ulanish sozlanganmi" })
  status() { return { enabled: this.crm.isEnabled() }; }

  @Get("contracts")
  @ApiOperation({ summary: "CRM portfelidan shartnomalar (mijoz, shartnoma, qarzdorlik) - ogohlantirish xatlari uchun" })
  async contracts(@Query("q") q: string | undefined, @Query("overdue") overdue: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    const org = await this.prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } });
    // EDO tashkiloti -> CRM'dagi tashkilot kaliti
    const organization = org?.name.toUpperCase().includes("VAFO") ? "vafo_moliya" : "wafa_leasing";
    return this.crm.searchContracts({ q, organization, overdueOnly: overdue !== "0", includeClosed: overdue === "0", limit: overdue === "0" ? 100 : undefined });
  }
}
