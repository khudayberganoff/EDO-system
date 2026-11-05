import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CallsService } from "./calls.service";
import { CreateCallLogDto } from "./dto/calls.dto";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";

@ApiTags("calls") @ApiBearerAuth() @Controller("calls")
export class CallsController {
  constructor(private calls: CallsService) {}

  @Get("queue") @ApiOperation({ summary: "Qo'ng'iroq navbati: CRM'dagi muddati o'tgan mijozlar + qo'ng'iroq tarixi" })
  queue(@Query("q") q: string | undefined, @Query("filter") filter: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.calls.queue(user, { q, filter });
  }

  @Get("history/:clientId") @ApiOperation({ summary: "Mijoz bo'yicha qo'ng'iroqlar tarixi" })
  history(@Param("clientId") clientId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.calls.history(user, clientId);
  }

  @Post("log") @ApiOperation({ summary: "Qo'ng'iroq natijasini saqlash" })
  log(@Body() dto: CreateCallLogDto, @CurrentUser() user: AuthenticatedUser) {
    return this.calls.log(user, dto);
  }

  @Get("stats") @ApiOperation({ summary: "Davr bo'yicha statistika" })
  stats(@Query("days") days: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.calls.stats(user, Number(days) || 1);
  }
}
