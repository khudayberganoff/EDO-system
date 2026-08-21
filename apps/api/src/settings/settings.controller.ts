import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SettingsService } from "./settings.service";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/enums";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";

@ApiTags("Sozlamalar")
@ApiBearerAuth()
@Controller("settings")
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  /** Joriy foydalanuvchining ruxsatlari - interfeys shunga qarab quriladi. */
  @Get("my-access")
  myAccess(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.myAccess(user.role);
  }

  @Get("permissions")
  @Roles(Role.ADMIN)
  permissions() {
    return this.settingsService.permissions();
  }

  @Post("permissions")
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Rolga bo'lim ruxsatini belgilash" })
  setPermission(
    @Body() body: { role: string; module: string; canView: boolean; canEdit: boolean },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settingsService.setPermission(body, user.id);
  }

  @Get("users")
  @Roles(Role.ADMIN)
  users() {
    return this.settingsService.listUsers();
  }

  @Post("users")
  @Roles(Role.ADMIN)
  createUser(
    @Body() body: { fullName: string; email: string; password: string; role: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settingsService.createUser(body, user.id);
  }

  @Patch("users/:id")
  @Roles(Role.ADMIN)
  updateUser(
    @Param("id") id: string,
    @Body() body: { fullName?: string; role?: string; isActive?: boolean; password?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settingsService.updateUser(id, body, user.id);
  }
}
