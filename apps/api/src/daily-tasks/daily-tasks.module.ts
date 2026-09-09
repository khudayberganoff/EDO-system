import { Module } from "@nestjs/common";
import { DailyTasksService } from "./daily-tasks.service";
import { DailyTasksController } from "./daily-tasks.controller";

@Module({
  providers: [DailyTasksService],
  controllers: [DailyTasksController],
})
export class DailyTasksModule {}
