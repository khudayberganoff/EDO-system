import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { ApiKeyGuard, ApiScopeRequired } from "./api-key.guard";
import { HrService } from "../hr/hr.service";
import { LettersService } from "../letters/letters.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Tashqi tizimlar (boshqa saytlar) uchun ochiq API.
 *
 * Kirish: har bir so'rovda `X-API-Key: edo_live_...` sarlavhasi bo'lishi kerak.
 * Bu yerda faqat O'QISH (GET) amallari bor - tashqi sayt ma'lumotni ko'rsatadi,
 * o'zgartirmaydi.
 */
@ApiTags("Ochiq API (tashqi tizimlar uchun)")
@ApiHeader({ name: "X-API-Key", description: "API kalit", required: true })
@Public()
@UseGuards(ApiKeyGuard)
@Controller("public/v1")
export class PublicApiController {
  constructor(
    private hrService: HrService,
    private lettersService: LettersService,
    private prisma: PrismaService,
  ) {}

  @Get("ping")
  @ApiOperation({ summary: "Kalit ishlayotganini tekshirish" })
  ping() {
    return { ok: true, service: "EDO WAFA", time: new Date().toISOString() };
  }

  // ==================== KADRLAR ====================

  @Get("hr/employees")
  @ApiScopeRequired("hr")
  employees(@Query("search") search?: string, @Query("status") status?: string) {
    return this.hrService.listEmployees({ search, status });
  }

  @Get("hr/employees/:id")
  @ApiScopeRequired("hr")
  employee(@Param("id") id: string) {
    return this.hrService.getEmployee(id);
  }

  @Get("hr/departments")
  @ApiScopeRequired("hr")
  departments() {
    return this.hrService.listDepartments();
  }

  @Get("hr/positions")
  @ApiScopeRequired("hr")
  positions() {
    return this.hrService.listPositions();
  }

  @Get("hr/orders")
  @ApiScopeRequired("hr")
  orders(@Query("employeeId") employeeId?: string, @Query("type") type?: string) {
    return this.hrService.listOrders({ employeeId, type });
  }

  @Get("hr/contracts")
  @ApiScopeRequired("hr")
  contracts(@Query("employeeId") employeeId?: string) {
    return this.hrService.listContracts({ employeeId });
  }

  @Get("hr/leaves")
  @ApiScopeRequired("hr")
  leaves(@Query("employeeId") employeeId?: string, @Query("status") status?: string) {
    return this.hrService.listLeaves({ employeeId, status });
  }

  @Get("hr/attendance")
  @ApiScopeRequired("hr")
  attendance(@Query("year") year?: string, @Query("month") month?: string) {
    const now = new Date();
    return this.hrService.attendanceMonth(
      year ? Number(year) : now.getFullYear(),
      month ? Number(month) : now.getMonth() + 1,
    );
  }

  @Get("hr/holidays")
  @ApiScopeRequired("hr")
  holidays(@Query("year") year?: string) {
    return this.hrService.listHolidays(year ? Number(year) : undefined);
  }

  @Get("hr/gratitudes")
  @ApiScopeRequired("hr")
  gratitudes(@Query("employeeId") employeeId?: string) {
    return this.hrService.listGratitudes(employeeId);
  }

  @Get("hr/stats")
  @ApiScopeRequired("hr")
  hrStats() {
    return this.hrService.stats();
  }

  // ==================== XATLAR ====================

  @Get("letters")
  @ApiScopeRequired("letters")
  letters(@Query("type") type?: string, @Query("status") status?: string, @Query("direction") direction?: string) {
    return this.lettersService.findAll({ type, status, direction } as any);
  }

  @Get("letters/:id")
  @ApiScopeRequired("letters")
  letter(@Param("id") id: string) {
    return this.lettersService.findOne(id);
  }

  /** Xat matnini (Word shablonidan olingan) qaytaradi - tashqi saytda ko'rsatish uchun. */
  @Get("letters/:id/text")
  @ApiScopeRequired("letters")
  async letterText(@Param("id") id: string) {
    return { paragraphs: await this.lettersService.getRenderedText(id) };
  }

  // ==================== HUJJATLAR ====================

  @Get("documents")
  @ApiScopeRequired("documents")
  documents(@Query("status") status?: string, @Query("type") type?: string) {
    return this.prisma.document.findMany({
      where: { ...(status ? { status } : {}), ...(type ? { type } : {}) },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: { owner: { select: { fullName: true } } },
    });
  }

  @Get("documents/:id")
  @ApiScopeRequired("documents")
  document(@Param("id") id: string) {
    return this.prisma.document.findUnique({
      where: { id },
      include: {
        owner: { select: { fullName: true } },
        versions: { orderBy: { versionNumber: "desc" } },
      },
    });
  }
}
