import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { HrService } from "./hr.service";
import { CreateEmployeeDto, UpdateEmployeeDto, CreateHrOrderDto, CreateContractDto, CreateLeaveDto } from "./dto/hr.dto";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/enums";

@ApiTags("Kadrlar")
@ApiBearerAuth()
@Controller("hr")
export class HrController {
  constructor(private hrService: HrService) {}

  @Get("stats")
  @ApiOperation({ summary: "Kadrlar bo'limi statistikasi" })
  stats() {
    return this.hrService.stats();
  }

  // ---------- Xodimlar ----------

  @Get("employees")
  listEmployees(@Query("search") search?: string, @Query("status") status?: string) {
    return this.hrService.listEmployees({ search, status });
  }

  @Get("employees/:id")
  getEmployee(@Param("id") id: string) {
    return this.hrService.getEmployee(id);
  }

  @Post("employees")
  @Roles(Role.ADMIN, Role.MANAGER)
  createEmployee(@Body() dto: CreateEmployeeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.createEmployee(dto, user);
  }

  @Patch("employees/:id")
  @Roles(Role.ADMIN, Role.MANAGER)
  updateEmployee(@Param("id") id: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.updateEmployee(id, dto, user);
  }

  @Delete("employees/:id")
  @Roles(Role.ADMIN)
  removeEmployee(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.removeEmployee(id, user);
  }

  // ---------- Buyruqlar ----------

  @Get("orders")
  listOrders(@Query("employeeId") employeeId?: string, @Query("type") type?: string) {
    return this.hrService.listOrders({ employeeId, type });
  }

  @Post("orders")
  @Roles(Role.ADMIN, Role.MANAGER)
  createOrder(@Body() dto: CreateHrOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.createOrder(dto, user);
  }

  @Delete("orders/:id")
  @Roles(Role.ADMIN, Role.MANAGER)
  removeOrder(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.removeOrder(id, user);
  }

  // ---------- Mehnat shartnomalari ----------

  @Get("contracts")
  listContracts(@Query("employeeId") employeeId?: string) {
    return this.hrService.listContracts({ employeeId });
  }

  @Post("contracts")
  @Roles(Role.ADMIN, Role.MANAGER)
  createContract(@Body() dto: CreateContractDto, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.createContract(dto, user);
  }

  @Delete("contracts/:id")
  @Roles(Role.ADMIN, Role.MANAGER)
  removeContract(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.removeContract(id, user);
  }

  // ---------- Ta'tillar ----------

  @Get("leaves")
  listLeaves(@Query("employeeId") employeeId?: string, @Query("status") status?: string) {
    return this.hrService.listLeaves({ employeeId, status });
  }

  @Post("leaves")
  @Roles(Role.ADMIN, Role.MANAGER)
  createLeave(@Body() dto: CreateLeaveDto, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.createLeave(dto, user);
  }

  @Post("leaves/:id/approve")
  @Roles(Role.ADMIN, Role.MANAGER)
  approveLeave(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.approveLeave(id, user);
  }

  @Post("leaves/:id/reject")
  @Roles(Role.ADMIN, Role.MANAGER)
  rejectLeave(@Param("id") id: string, @Body() body: { reason: string }, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.rejectLeave(id, body?.reason ?? "", user);
  }

  @Delete("leaves/:id")
  @Roles(Role.ADMIN, Role.MANAGER)
  removeLeave(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.removeLeave(id, user);
  }
  // ---------- Bo'limlar ----------

  @Get("departments")
  listDepartments() {
    return this.hrService.listDepartments();
  }

  @Post("departments")
  @Roles(Role.ADMIN, Role.MANAGER)
  createDepartment(@Body() body: { name: string; parentId?: string }, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.createDepartment(body, user);
  }

  @Delete("departments/:id")
  @Roles(Role.ADMIN, Role.MANAGER)
  removeDepartment(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.removeDepartment(id, user);
  }

  // ---------- Lavozimlar ----------

  @Get("positions")
  listPositions() {
    return this.hrService.listPositions();
  }

  @Post("positions")
  @Roles(Role.ADMIN, Role.MANAGER)
  createPosition(@Body() body: { title: string; departmentId?: string; headcount?: number }, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.createPosition(body, user);
  }

  @Delete("positions/:id")
  @Roles(Role.ADMIN, Role.MANAGER)
  removePosition(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.removePosition(id, user);
  }

  // ---------- Bayram kunlari ----------

  @Get("holidays")
  listHolidays(@Query("year") year?: string) {
    return this.hrService.listHolidays(year ? Number(year) : undefined);
  }

  @Post("holidays")
  @Roles(Role.ADMIN, Role.MANAGER)
  createHoliday(@Body() body: { date: string; name: string; type?: string }, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.createHoliday(body, user);
  }

  @Delete("holidays/:id")
  @Roles(Role.ADMIN, Role.MANAGER)
  removeHoliday(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.removeHoliday(id, user);
  }

  // ---------- Davomat ----------

  @Get("attendance")
  @ApiOperation({ summary: "Bir oylik davomat jadvali" })
  attendanceMonth(@Query("year") year: string, @Query("month") month: string) {
    const now = new Date();
    return this.hrService.attendanceMonth(
      year ? Number(year) : now.getFullYear(),
      month ? Number(month) : now.getMonth() + 1,
    );
  }

  @Post("attendance")
  @Roles(Role.ADMIN, Role.MANAGER)
  setAttendance(
    @Body() body: { employeeId: string; date: string; status: string; lateMinutes?: number; note?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hrService.setAttendance(body, user);
  }
  // ---------- "Mening HR" ----------

  @Get("my")
  @ApiOperation({ summary: "Foydalanuvchining shaxsiy HR sahifasi" })
  myHr(@CurrentUser() user: AuthenticatedUser) {
    return this.hrService.myHr(user.id);
  }

  // ---------- Ish jadvali (smena) ----------

  @Get("schedules/:employeeId")
  listSchedules(@Param("employeeId") employeeId: string) {
    return this.hrService.listSchedules(employeeId);
  }

  @Post("schedules")
  @Roles(Role.ADMIN, Role.MANAGER)
  setSchedule(
    @Body() body: { employeeId: string; weekday: number; startTime?: string; endTime?: string; isDayOff?: boolean; shiftName?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hrService.setSchedule(body, user);
  }

  // ---------- Minnatdorchilik ----------

  @Get("gratitudes")
  listGratitudes(@Query("employeeId") employeeId?: string) {
    return this.hrService.listGratitudes(employeeId);
  }

  @Post("gratitudes")
  @Roles(Role.ADMIN, Role.MANAGER)
  createGratitude(@Body() body: { employeeId: string; message: string }, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.createGratitude(body, user);
  }

  @Delete("gratitudes/:id")
  @Roles(Role.ADMIN, Role.MANAGER)
  removeGratitude(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.removeGratitude(id, user);
  }

  @Post("employees/:id/link-user")
  @Roles(Role.ADMIN, Role.MANAGER)
  linkUser(@Param("id") id: string, @Body() body: { userId: string | null }, @CurrentUser() user: AuthenticatedUser) {
    return this.hrService.linkUser(id, body?.userId ?? null, user);
  }
}
