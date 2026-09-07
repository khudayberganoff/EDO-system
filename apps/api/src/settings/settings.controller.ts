import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SettingsService } from "./settings.service";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/enums";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { CreateUserDto, UpdateUserDto, SetPermissionDto } from "./dto/settings.dto";

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
  setPermission(@Body() body: SetPermissionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.setPermission(body, user.id);
  }

  @Get("users")
  @Roles(Role.ADMIN)
  users() {
    return this.settingsService.listUsers();
  }

  @Get("users/:id")
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Foydalanuvchi haqida to'liq ma'lumot" })
  userDetails(@Param("id") id: string) {
    return this.settingsService.getUserDetails(id);
  }

  @Post("users")
  @Roles(Role.ADMIN)
  createUser(@Body() body: CreateUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.createUser(body, user.id);
  }

  @Post("users/:id/reset-password")
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Parolni tiklash - yangi parol bir marta qaytariladi" })
  resetPassword(@Param("id") id: string, @Body() body: { password?: string }, @CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.resetPassword(id, user.id, body?.password);
  }

  @Patch("users/:id")
  @Roles(Role.ADMIN)
  updateUser(@Param("id") id: string, @Body() body: UpdateUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.updateUser(id, body, user.id);
  }
}
