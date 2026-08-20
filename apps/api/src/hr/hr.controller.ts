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
}
