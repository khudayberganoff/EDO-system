import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { DailyTasksService } from "./daily-tasks.service";
import { CreateDailyTaskDto, UpdateDailyTaskDto } from "./dto/daily-task.dto";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";

@ApiTags("daily-tasks") @ApiBearerAuth() @Controller("daily-tasks")
export class DailyTasksController {
  constructor(private service: DailyTasksService) {}

  @Get()
  @ApiOperation({ summary: "Muayyan sanadagi shaxsiy vazifalar ro'yxati" })
  list(@Query("date") date: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.service.listForDate(user.id, date);
  }

  @Post()
  @ApiOperation({ summary: "Yangi kundalik vazifa qo'shish" })
  create(@Body() dto: CreateDailyTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Vazifani tahrirlash yoki bajarilgan deb belgilash" })
  update(@Param("id") id: string, @Body() dto: UpdateDailyTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Vazifani o'chirish" })
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user.id);
  }
}
