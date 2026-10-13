import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { BoardService } from "./board.service";
import { CreateBoardTaskDto, MoveBoardTaskDto, UpdateBoardTaskDto } from "./dto/board.dto";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";

@ApiTags("board") @ApiBearerAuth() @Controller("board")
export class BoardController {
  constructor(private service: BoardService) {}

  @Get("tasks")
  @ApiOperation({ summary: "Doskadagi barcha kartochkalar" })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.organizationId);
  }

  @Get("users")
  @ApiOperation({ summary: "Mas'ul tanlash uchun xodimlar ro'yxati" })
  users(@CurrentUser() user: AuthenticatedUser) {
    return this.service.users(user.organizationId);
  }

  @Post("tasks")
  @ApiOperation({ summary: "Yangi kartochka qo'shish" })
  create(@Body() dto: CreateBoardTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.id, user.organizationId);
  }

  @Patch("tasks/:id")
  @ApiOperation({ summary: "Kartochkani tahrirlash" })
  update(@Param("id") id: string, @Body() dto: UpdateBoardTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user.organizationId);
  }

  @Patch("tasks/:id/move")
  @ApiOperation({ summary: "Kartochkani boshqa ustunga / o'ringa ko'chirish" })
  move(@Param("id") id: string, @Body() dto: MoveBoardTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.move(id, dto, user.organizationId);
  }

  @Delete("tasks/:id")
  @ApiOperation({ summary: "Kartochkani o'chirish" })
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user.organizationId);
  }
}
