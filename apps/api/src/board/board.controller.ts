import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { BoardService } from "./board.service";
import {
  CreateBoardCommentDto, CreateBoardDto, CreateBoardTaskDto, MoveBoardTaskDto, RenameBoardDto, UpdateBoardTaskDto,
} from "./dto/board.dto";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";

@ApiTags("board") @ApiBearerAuth() @Controller("board")
export class BoardController {
  constructor(private service: BoardService) {}

  @Get("boards")
  @ApiOperation({ summary: "Menga ko'rinadigan doskalar (umumiy + shaxsiy)" })
  boards(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listBoards(user);
  }

  @Post("boards")
  @ApiOperation({ summary: "Yangi doska yaratish" })
  createBoard(@Body() dto: CreateBoardDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createBoard(dto, user);
  }

  @Patch("boards/:id")
  @ApiOperation({ summary: "Doska nomini o'zgartirish" })
  renameBoard(@Param("id") id: string, @Body() dto: RenameBoardDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.renameBoard(id, dto.name, user);
  }

  @Delete("boards/:id")
  @ApiOperation({ summary: "Doskani o'chirish" })
  removeBoard(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removeBoard(id, user);
  }

  @Get("tasks")
  @ApiOperation({ summary: "Doskadagi barcha kartochkalar - ?boardId=" })
  list(@Query("boardId") boardId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.list(boardId, user);
  }

  @Get("other-org-tasks")
  @ApiOperation({ summary: "Boshqa korxonaning umumiy doskalaridagi vazifalar (faqat ko'rish)" })
  otherOrgTasks(@CurrentUser() user: AuthenticatedUser) {
    return this.service.otherOrgTasks(user);
  }

  @Get("my-tasks")
  @ApiOperation({ summary: "Menga biriktirilgan Rejada / Jarayonda vazifalar (bosh sahifa uchun)" })
  myTasks(@CurrentUser() user: AuthenticatedUser) {
    return this.service.myTasks(user);
  }

  @Get("users")
  @ApiOperation({ summary: "Mas'ul tanlash uchun xodimlar ro'yxati" })
  users(@CurrentUser() user: AuthenticatedUser) {
    return this.service.users(user.organizationId);
  }

  @Post("tasks")
  @ApiOperation({ summary: "Yangi kartochka qo'shish" })
  create(@Body() dto: CreateBoardTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user);
  }

  @Patch("tasks/:id")
  @ApiOperation({ summary: "Kartochkani tahrirlash" })
  update(@Param("id") id: string, @Body() dto: UpdateBoardTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user);
  }

  @Patch("tasks/:id/move")
  @ApiOperation({ summary: "Kartochkani boshqa ustunga / o'ringa ko'chirish" })
  move(@Param("id") id: string, @Body() dto: MoveBoardTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.move(id, dto, user);
  }

  @Delete("tasks/:id")
  @ApiOperation({ summary: "Kartochkani o'chirish" })
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user);
  }

  @Get("tasks/:id/comments")
  @ApiOperation({ summary: "Kartochka izohlari" })
  comments(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.comments(id, user);
  }

  @Post("tasks/:id/comments")
  @ApiOperation({ summary: "Izoh qo'shish" })
  addComment(@Param("id") id: string, @Body() dto: CreateBoardCommentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.addComment(id, dto.text, user);
  }

  @Delete("tasks/:id/comments/:commentId")
  @ApiOperation({ summary: "Izohni o'chirish (muallif yoki administrator)" })
  removeComment(@Param("id") id: string, @Param("commentId") commentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removeComment(id, commentId, user);
  }
}
