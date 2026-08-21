import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiKeyService } from "./api-key.service";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/enums";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";

/** API kalitlarni boshqarish - faqat administrator uchun. */
@ApiTags("API kalitlar")
@ApiBearerAuth()
@Controller("api-keys")
export class ApiKeysController {
  constructor(private apiKeyService: ApiKeyService) {}

  @Get()
  @Roles(Role.ADMIN)
  list() {
    return this.apiKeyService.list();
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Yangi kalit - to'liq holda faqat shu javobda ko'rsatiladi" })
  create(@Body() body: { name: string; scopes?: string[]; expiresAt?: string }, @CurrentUser() user: AuthenticatedUser) {
    return this.apiKeyService.create(body, user.id);
  }

  @Patch(":id/revoke")
  @Roles(Role.ADMIN)
  revoke(@Param("id") id: string) {
    return this.apiKeyService.revoke(id);
  }

  @Delete(":id")
  @Roles(Role.ADMIN)
  remove(@Param("id") id: string) {
    return this.apiKeyService.remove(id);
  }
}
