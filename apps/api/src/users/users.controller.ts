import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/enums";

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Yangi foydalanuvchi (xodim) yaratish - faqat ADMIN" })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: "Barcha foydalanuvchilar ro'yxati" })
  findAll() {
    return this.usersService.findAll();
  }

  @Get(":id")
  @Roles(Role.ADMIN, Role.MANAGER)
  findOne(@Param("id") id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(":id/deactivate")
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Foydalanuvchini bloklash (login qilolmaydi)" })
  deactivate(@Param("id") id: string) {
    return this.usersService.deactivate(id);
  }
}
