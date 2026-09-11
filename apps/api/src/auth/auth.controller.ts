import { Body, Controller, Get, Post, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { SwitchOrganizationDto } from "./dto/switch-organization.dto";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Get("organizations")
  @ApiOperation({ summary: "Kirish sahifasidagi tashkilot tanlagichi uchun - barcha tashkilotlar ro'yxati" })
  listOrganizations() {
    return this.authService.listOrganizations();
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Email, parol va tanlangan tashkilot bilan tizimga kirish, JWT token qaytaradi" })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get("my-organizations")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Joriy foydalanuvchi kira oladigan tashkilotlar ro'yxati" })
  myOrganizations(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.myOrganizations(user.id);
  }

  @Post("switch-organization")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Qayta parol so'ramasdan boshqa (kira oladigan) tashkilotga o'tish" })
  switchOrganization(@Body() dto: SwitchOrganizationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authService.switchOrganization(user.id, dto.organizationId);
  }

  @Post("change-password")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Foydalanuvchi o'zi parolini almashtiradi (joriy parol kerak)" })
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }
}
