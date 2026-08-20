import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { AuditAction, Role } from "../common/enums";
import { CreateEmployeeDto, UpdateEmployeeDto, CreateHrOrderDto, CreateContractDto, CreateLeaveDto } from "./dto/hr.dto";

/** Kadrlar bo'limi: xodimlar kartotekasi, buyruqlar, mehnat shartnomalari va ta'tillar. */
@Injectable()
export class HrService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  private ensureHrAccess(role: string) {
    if (![Role.ADMIN, Role.MANAGER].includes(role as Role)) {
      throw new ForbiddenException("Kadrlar bo'limiga faqat rahbariyat kirishi mumkin.");
    }
  }

  // ---------- Xodimlar ----------

  async listEmployees(query: { search?: string; status?: string }) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: "insensitive" } },
        { position: { contains: query.search, mode: "insensitive" } },
        { department: { contains: query.search, mode: "insensitive" } },
      ];
    }
    return this.prisma.employee.findMany({
      where,
      orderBy: { fullName: "asc" },
      include: { _count: { select: { orders: true, contracts: true, leaves: true } } },
    });
  }

  async getEmployee(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        orders: { orderBy: { orderDate: "desc" } },
        contracts: { orderBy: { startDate: "desc" } },
        leaves: { orderBy: { startDate: "desc" } },
      },
    });
    if (!employee) throw new NotFoundException("Xodim topilmadi.");
    return employee;
  }

  async createEmployee(dto: CreateEmployeeDto, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    const employee = await this.prisma.employee.create({
      data: {
        fullName: dto.fullName,
        position: dto.position,
        department: dto.department,
        hireDate: new Date(dto.hireDate),
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        phone: dto.phone,
        email: dto.email,
        passportSerial: dto.passportSerial,
        passportExpiry: dto.passportExpiry ? new Date(dto.passportExpiry) : undefined,
        pinfl: dto.pinfl,
        address: dto.address,
        notes: dto.notes,
        // Bo'shagan sana kiritilgan bo'lsa - xodim avtomatik "bo'shatilgan" holatiga o'tadi
        dismissDate: dto.dismissDate ? new Date(dto.dismissDate) : undefined,
        status: dto.dismissDate ? "DISMISSED" : "ACTIVE",
      },
    });
    await this.auditLog.record({ userId: user.id, action: AuditAction.CREATE, metadata: { kind: "employee", employeeId: employee.id } });
    return employee;
  }

  async updateEmployee(id: string, dto: UpdateEmployeeDto, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    await this.getEmployee(id);
    const employee = await this.prisma.employee.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        position: dto.position,
        department: dto.department,
        hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        phone: dto.phone,
        email: dto.email,
        passportSerial: dto.passportSerial,
        passportExpiry: dto.passportExpiry ? new Date(dto.passportExpiry) : undefined,
        pinfl: dto.pinfl,
        address: dto.address,
        notes: dto.notes,
        status: dto.status ?? (dto.dismissDate ? "DISMISSED" : undefined),
        dismissDate: dto.dismissDate ? new Date(dto.dismissDate) : undefined,
      },
    });
    await this.auditLog.record({ userId: user.id, action: AuditAction.UPDATE, metadata: { kind: "employee", employeeId: id } });
    return employee;
  }

  async removeEmployee(id: string, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    await this.getEmployee(id);
    await this.prisma.employee.delete({ where: { id } });
    await this.auditLog.record({ userId: user.id, action: AuditAction.DELETE, metadata: { kind: "employee", employeeId: id } });
    return { deleted: true };
  }

  // ---------- Buyruqlar ----------

  async listOrders(query: { employeeId?: string; type?: string }) {
    const where: any = {};
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.type) where.type = query.type;
    return this.prisma.hrOrder.findMany({
      where,
      orderBy: { orderDate: "desc" },
      include: { employee: { select: { id: true, fullName: true, position: true } } },
    });
  }

  async createOrder(dto: CreateHrOrderDto, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    const order = await this.prisma.hrOrder.create({
      data: {
        employeeId: dto.employeeId,
        type: dto.type,
        number: dto.number,
        orderDate: new Date(dto.orderDate),
        subject: dto.subject,
        content: dto.content,
        createdById: user.id,
      },
      include: { employee: { select: { fullName: true } } },
    });
    await this.auditLog.record({ userId: user.id, action: AuditAction.CREATE, metadata: { kind: "hrOrder", orderId: order.id } });
    return order;
  }

  async removeOrder(id: string, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    await this.prisma.hrOrder.delete({ where: { id } });
    await this.auditLog.record({ userId: user.id, action: AuditAction.DELETE, metadata: { kind: "hrOrder", orderId: id } });
    return { deleted: true };
  }

  // ---------- Mehnat shartnomalari ----------

  async listContracts(query: { employeeId?: string }) {
    const where: any = {};
    if (query.employeeId) where.employeeId = query.employeeId;
    return this.prisma.employmentContract.findMany({
      where,
      orderBy: { startDate: "desc" },
      include: { employee: { select: { id: true, fullName: true, position: true } } },
    });
  }

  async createContract(dto: CreateContractDto, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    const contract = await this.prisma.employmentContract.create({
      data: {
        employeeId: dto.employeeId,
        number: dto.number,
        type: dto.type ?? "PERMANENT",
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        salary: dto.salary,
        notes: dto.notes,
      },
      include: { employee: { select: { fullName: true } } },
    });
    await this.auditLog.record({ userId: user.id, action: AuditAction.CREATE, metadata: { kind: "employmentContract", contractId: contract.id } });
    return contract;
  }

  async removeContract(id: string, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    await this.prisma.employmentContract.delete({ where: { id } });
    await this.auditLog.record({ userId: user.id, action: AuditAction.DELETE, metadata: { kind: "employmentContract", contractId: id } });
    return { deleted: true };
  }

  // ---------- Ta'tillar ----------

  async listLeaves(query: { employeeId?: string; status?: string }) {
    const where: any = {};
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.status) where.status = query.status;
    return this.prisma.leave.findMany({
      where,
      orderBy: { startDate: "desc" },
      include: {
        employee: { select: { id: true, fullName: true, position: true } },
        approvedBy: { select: { fullName: true } },
      },
    });
  }

  /** Ikki sana orasidagi kunlar soni (ikkala chegara ham hisobga olinadi). */
  private countDays(start: Date, end: Date): number {
    const ms = end.getTime() - start.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
  }

  async createLeave(dto: CreateLeaveDto, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start) throw new BadRequestException("Ta'til tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas.");

    const leave = await this.prisma.leave.create({
      data: {
        employeeId: dto.employeeId,
        type: dto.type ?? "ANNUAL",
        startDate: start,
        endDate: end,
        days: dto.days ?? this.countDays(start, end),
        reason: dto.reason,
      },
      include: { employee: { select: { fullName: true } } },
    });
    await this.auditLog.record({ userId: user.id, action: AuditAction.CREATE, metadata: { kind: "leave", leaveId: leave.id } });
    return leave;
  }

  async approveLeave(id: string, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    const leave = await this.prisma.leave.update({
      where: { id },
      data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date() },
    });
    await this.auditLog.record({ userId: user.id, action: AuditAction.STATUS_CHANGE, metadata: { kind: "leave", leaveId: id, to: "APPROVED" } });
    return leave;
  }

  async rejectLeave(id: string, reason: string, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    const trimmed = (reason ?? "").trim();
    if (trimmed.length < 3) throw new BadRequestException("Rad etish sababini yozing.");
    const leave = await this.prisma.leave.update({
      where: { id },
      data: { status: "REJECTED", rejectionReason: trimmed },
    });
    await this.auditLog.record({ userId: user.id, action: AuditAction.STATUS_CHANGE, metadata: { kind: "leave", leaveId: id, to: "REJECTED", reason: trimmed } });
    return leave;
  }

  async removeLeave(id: string, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    await this.prisma.leave.delete({ where: { id } });
    await this.auditLog.record({ userId: user.id, action: AuditAction.DELETE, metadata: { kind: "leave", leaveId: id } });
    return { deleted: true };
  }

  /** Kadrlar bo'limi bosh sahifasi uchun qisqacha statistika. */
  async stats() {
    const [total, active, dismissed, pendingLeaves] = await this.prisma.$transaction([
      this.prisma.employee.count(),
      this.prisma.employee.count({ where: { status: "ACTIVE" } }),
      this.prisma.employee.count({ where: { status: "DISMISSED" } }),
      this.prisma.leave.count({ where: { status: "REQUESTED" } }),
    ]);
    return { total, active, dismissed, pendingLeaves };
  }
}
