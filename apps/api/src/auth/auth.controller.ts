import { Body, Controller, Post, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { Public } from "../common/decorators/public.decorator";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Email va parol bilan tizimga kirish, JWT token qaytaradi" })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
