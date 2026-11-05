import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CallsService } from "./calls.service";
import { CreateCallLogDto, CreateLeadDto, UpdateLeadDto } from "./dto/calls.dto";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";

@ApiTags("calls") @ApiBearerAuth() @Controller("calls")
export class CallsController {
  constructor(private calls: CallsService) {}

  @Get("queue") @ApiOperation({ summary: "Qo'ng'iroq navbati: CRM'dagi muddati o'tgan mijozlar + qo'ng'iroq tarixi" })
  queue(@Query("q") q: string | undefined, @Query("filter") filter: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.calls.queue(user, { q, filter });
  }

  @Get("history/:clientId") @ApiOperation({ summary: "Mijoz bo'yicha qo'ng'iroqlar tarixi" })
  history(@Param("clientId") clientId: string, @Query("org") org: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.calls.history(user, clientId, org);
  }

  @Post("log") @ApiOperation({ summary: "Qo'ng'iroq natijasini saqlash" })
  log(@Body() dto: CreateCallLogDto, @CurrentUser() user: AuthenticatedUser) {
    return this.calls.log(user, dto);
  }

  @Get("stats") @ApiOperation({ summary: "Davr bo'yicha statistika" })
  stats(@Query("days") days: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.calls.stats(user, Number(days) || 1);
  }

  @Get("leads") @ApiOperation({ summary: "Lidlar Kanban'i (barcha bosqichlar)" })
  leads(@CurrentUser() user: AuthenticatedUser) { return this.calls.leads(user); }

  @Post("leads") @ApiOperation({ summary: "Yangi lid qo'shish" })
  createLead(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthenticatedUser) { return this.calls.createLead(user, dto); }

  @Patch("leads/:id") @ApiOperation({ summary: "Lidni o'zgartirish yoki bosqichga ko'chirish" })
  updateLead(@Param("id") id: string, @Body() dto: UpdateLeadDto, @CurrentUser() user: AuthenticatedUser) { return this.calls.updateLead(user, id, dto); }

  @Delete("leads/:id") @ApiOperation({ summary: "Lidni o'chirish" })
  removeLead(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.calls.removeLead(user, id); }

  @Get("calendar") @ApiOperation({ summary: "Kalendar: uchrashuvlar, qayta bog'lanishlar, qarzdor va'dalari" })
  calendar(@Query("from") from: string, @Query("to") to: string, @CurrentUser() user: AuthenticatedUser) {
    const f = new Date(from), t = new Date(to);
    if (isNaN(f.getTime()) || isNaN(t.getTime()) || t <= f || t.getTime() - f.getTime() > 100 * 86_400_000) {
      throw new BadRequestException("Kalendar oralig'i noto'g'ri (from, to; eng ko'pi 100 kun).");
    }
    return this.calls.calendar(user, f, t);
  }

  @Get("phone-calls") @ApiOperation({ summary: "IP-telefoniya qo'ng'iroqlari (ATS dan kelgan)" })
  phoneCalls(
    @Query("direction") direction: string | undefined, @Query("status") status: string | undefined, @Query("q") q: string | undefined,
    @Query("leadId") leadId: string | undefined, @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.calls.phoneCalls(user, { direction, status, q, leadId });
  }

  @Get("phone-calls/:id/recording-link") @ApiOperation({ summary: "Qo'ng'iroq yozuvi uchun qisqa muddatli havola" })
  recordingLink(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.calls.recordingLink(user, id); }
}
