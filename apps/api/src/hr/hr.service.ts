import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Document, Packer, Paragraph, TextRun, AlignmentType } from "docx";
import * as XLSX from "xlsx";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { LetterPdfService } from "../letters/letter-pdf.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { AuditAction, Role } from "../common/enums";
import { CreateEmployeeDto, UpdateEmployeeDto, CreateHrOrderDto, CreateContractDto, CreateLeaveDto } from "./dto/hr.dto";

/** Kadrlar bo'limi: xodimlar kartotekasi, buyruqlar, mehnat shartnomalari va ta'tillar. */
@Injectable()
export class HrService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private pdfService: LetterPdfService,
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
      include: { _count: { select: { orders: true, contracts: true, leaves: true } }, user: { select: { email: true, role: true } } },
    });
  }

  async getEmployee(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        orders: { orderBy: { orderDate: "desc" } },
        contracts: { orderBy: { startDate: "desc" } },
        leaves: { orderBy: { startDate: "desc" } },
        user: { select: { email: true, role: true } },
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
        passportIssueDate: dto.passportIssueDate ? new Date(dto.passportIssueDate) : undefined,
        passportExpiry: dto.passportExpiry ? new Date(dto.passportExpiry) : undefined,
        passportIssuedBy: dto.passportIssuedBy,
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
        passportIssueDate: dto.passportIssueDate ? new Date(dto.passportIssueDate) : undefined,
        passportExpiry: dto.passportExpiry ? new Date(dto.passportExpiry) : undefined,
        passportIssuedBy: dto.passportIssuedBy,
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

    // Buyruq raqami takrorlanmasligi shart - bir xil raqamli ikkita buyruq bo'lmasin
    const number = dto.number.trim();
    const duplicate = await this.prisma.hrOrder.findFirst({
      where: { number: { equals: number, mode: "insensitive" } },
    });
    if (duplicate) {
      throw new BadRequestException(
        `№ ${number} raqamli buyruq oldin kiritilgan (${new Date(duplicate.orderDate).toLocaleDateString("uz-UZ")}). ` +
        "Buyruq raqami takrorlanmasligi kerak - boshqa raqam kiriting.",
      );
    }

    let order;
    try {
      order = await this.prisma.hrOrder.create({
      data: {
        employeeId: dto.employeeId,
        type: dto.type,
        number,
        orderDate: new Date(dto.orderDate),
        subject: dto.subject,
        content: dto.content,
        rate: dto.rate,
        createdById: user.id,
      },
      include: { employee: { select: { fullName: true } } },
      });
    } catch (err: any) {
      // Baza darajasidagi takrorlanish (bir vaqtda ikkita so'rov kelgan holat)
      if (err?.code === "P2002") {
        throw new BadRequestException(`№ ${number} raqamli buyruq allaqachon mavjud. Boshqa raqam kiriting.`);
      }
      throw err;
    }
    await this.auditLog.record({ userId: user.id, action: AuditAction.CREATE, metadata: { kind: "hrOrder", orderId: order.id } });
    return order;
  }

  /**
   * Keyingi bo'sh buyruq raqamini taklif qiladi: "1-K", "2-K", ...
   * Mavjud raqamlardagi eng katta sonni topib, undan keyingisini beradi.
   */
  async nextOrderNumber() {
    const orders = await this.prisma.hrOrder.findMany({ select: { number: true } });
    let max = 0;
    for (const o of orders) {
      const m = /^(\d+)/.exec(o.number.trim());
      if (m) max = Math.max(max, Number(m[1]));
    }
    return { number: `${max + 1}-K` };
  }

  /** Buyruqni Word (.docx) hujjat sifatida shakllantiradi. */
  async buildOrderDocx(id: string): Promise<{ buffer: Buffer; name: string }> {
    const order = await this.prisma.hrOrder.findUnique({
      where: { id },
      include: { employee: { select: { fullName: true, position: true, department: true } } },
    });
    if (!order) throw new NotFoundException("Buyruq topilmadi.");

    const TYPE_LABELS: Record<string, string> = {
      HIRE: "Ishga qabul qilish", DISMISS: "Ishdan bo'shatish", TRANSFER: "Lavozimga o'tkazish",
      VACATION: "Ta'til berish", BONUS: "Rag'batlantirish", PENALTY: "Intizomiy jazo", OTHER: "Boshqa",
    };

    const p = (text: string, opts: any = {}) =>
      new Paragraph({
        alignment: opts.align ?? AlignmentType.LEFT,
        spacing: { after: opts.after ?? 140, line: 300 },
        children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 24, font: "Times New Roman" })],
      });

    const doc = new Document({
      sections: [{
        properties: { page: { margin: { top: 850, right: 850, bottom: 850, left: 1100 } } },
        children: [
          p("«WAFA LEASING» MAS'ULIYATI CHEKLANGAN JAMIYATI", { bold: true, align: AlignmentType.CENTER, size: 26 }),
          p("BUYRUQ", { bold: true, align: AlignmentType.CENTER, size: 28, after: 60 }),
          p(`№ ${order.number}`, { bold: true, align: AlignmentType.CENTER, size: 24, after: 40 }),
          p(new Date(order.orderDate).toLocaleDateString("uz-UZ"), { align: AlignmentType.CENTER, size: 22, after: 300 }),
          p(order.subject, { bold: true, align: AlignmentType.CENTER, after: 300 }),
          p(`Xodim: ${order.employee?.fullName ?? "—"}`),
          p(`Lavozimi: ${order.employee?.position ?? "—"}`),
          ...(order.employee?.department ? [p(`Bo'limi: ${order.employee.department}`)] : []),
          p(`Buyruq turi: ${TYPE_LABELS[order.type] ?? order.type}`),
          ...(order.rate != null ? [p(`Shtat stavkasi: ${order.rate}`)] : []),
          ...(order.content ? [p(""), ...String(order.content).split(/\n+/).map((line) => p(line.trim(), { align: AlignmentType.JUSTIFIED }))] : []),
          p("", { after: 500 }),
          p("Direktor\t\t\t\tM. Xudayberganov", { bold: true }),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    return { buffer, name: `buyruq-${order.number}.docx` };
  }

  /** Buyruqning PDF nusxasi (Word hujjatidan aylantiriladi). */
  async buildOrderPdf(id: string): Promise<{ buffer: Buffer; name: string }> {
    const { buffer: docx, name } = await this.buildOrderDocx(id);
    const pdf = await this.pdfService.docxToPdf(docx);
    return { buffer: pdf, name: name.replace(/\.docx$/, ".pdf") };
  }

  /** Buyruqlar ro'yxatini Excel (.xlsx) fayl sifatida shakllantiradi. */
  async exportOrdersXlsx(): Promise<Buffer> {
    const orders = await this.prisma.hrOrder.findMany({
      orderBy: { orderDate: "desc" },
      include: { employee: { select: { fullName: true, position: true, department: true } } },
    });

    const TYPE_LABELS: Record<string, string> = {
      HIRE: "Ishga qabul qilish", DISMISS: "Ishdan bo'shatish", TRANSFER: "Lavozimga o'tkazish",
      VACATION: "Ta'til berish", BONUS: "Rag'batlantirish", PENALTY: "Intizomiy jazo", OTHER: "Boshqa",
    };

    const rows = orders.map((o, i) => ({
      "№": i + 1,
      "Buyruq raqami": o.number,
      "Sanasi": new Date(o.orderDate).toLocaleDateString("uz-UZ"),
      "Xodim": o.employee?.fullName ?? "",
      "Lavozimi": o.employee?.position ?? "",
      "Bo'limi": o.employee?.department ?? "",
      "Buyruq turi": TYPE_LABELS[o.type] ?? o.type,
      "Mavzusi": o.subject,
      "Shtat stavkasi": o.rate ?? "",
      "Matni": o.content ?? "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    // Ustun kengliklari - fayl ochilganda o'qishga qulay bo'lishi uchun
    worksheet["!cols"] = [
      { wch: 5 }, { wch: 16 }, { wch: 12 }, { wch: 28 }, { wch: 22 },
      { wch: 20 }, { wch: 22 }, { wch: 40 }, { wch: 14 }, { wch: 50 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Buyruqlar");
    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
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


  // ---------- Bo'limlar ----------

  async listDepartments() {
    return this.prisma.department.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { employees: true, positions: true } }, parent: { select: { id: true, name: true } } },
    });
  }

  async createDepartment(data: { name: string; parentId?: string }, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    const dept = await this.prisma.department.create({ data: { name: data.name, parentId: data.parentId || undefined } });
    await this.auditLog.record({ userId: user.id, action: AuditAction.CREATE, metadata: { kind: "department", id: dept.id } });
    return dept;
  }

  async removeDepartment(id: string, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    await this.prisma.department.delete({ where: { id } });
    return { deleted: true };
  }

  // ---------- Lavozimlar ----------

  async listPositions() {
    return this.prisma.position.findMany({
      orderBy: { title: "asc" },
      include: { department: { select: { id: true, name: true } } },
    });
  }

  async createPosition(data: { title: string; departmentId?: string; headcount?: number }, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    const position = await this.prisma.position.create({
      data: { title: data.title, departmentId: data.departmentId || undefined, headcount: data.headcount ?? 1 },
    });
    await this.auditLog.record({ userId: user.id, action: AuditAction.CREATE, metadata: { kind: "position", id: position.id } });
    return position;
  }

  async removePosition(id: string, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    await this.prisma.position.delete({ where: { id } });
    return { deleted: true };
  }

  // ---------- Bayram kunlari ----------

  async listHolidays(year?: number) {
    const where: any = {};
    if (year) {
      where.date = { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
    }
    return this.prisma.holiday.findMany({ where, orderBy: { date: "asc" } });
  }

  async createHoliday(data: { date: string; name: string; type?: string }, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    const holiday = await this.prisma.holiday.create({
      data: { date: new Date(data.date), name: data.name, type: data.type ?? "HOLIDAY" },
    });
    return holiday;
  }

  async removeHoliday(id: string, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    await this.prisma.holiday.delete({ where: { id } });
    return { deleted: true };
  }

  // ---------- Davomat ----------

  /**
   * Bir oylik davomat jadvali: har bir xodim uchun kunlar bo'yicha holat.
   * Bayram kunlari va tasdiqlangan ta'tillar avtomatik belgilanadi.
   */
  async attendanceMonth(year: number, month: number) {
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const [employees, records, holidays, leaves] = await this.prisma.$transaction([
      this.prisma.employee.findMany({ where: { status: "ACTIVE" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, position: true, department: true } }),
      this.prisma.attendance.findMany({ where: { date: { gte: from, lt: to } } }),
      this.prisma.holiday.findMany({ where: { date: { gte: from, lt: to } } }),
      this.prisma.leave.findMany({ where: { status: "APPROVED", startDate: { lt: to }, endDate: { gte: from } } }),
    ]);

    const holidayDays = new Map<number, string>();
    for (const h of holidays) {
      if (h.type === "HOLIDAY") holidayDays.set(new Date(h.date).getUTCDate(), h.name);
    }

    // Har bir xodim uchun kun -> holat xaritasi
    const grid: Record<string, Record<number, { status: string; note?: string | null; lateMinutes?: number | null }>> = {};
    for (const e of employees) grid[e.id] = {};

    // Tasdiqlangan ta'tillar
    for (const l of leaves) {
      if (!grid[l.employeeId]) continue;
      const start = new Date(l.startDate);
      const end = new Date(l.endDate);
      for (let d = 1; d <= daysInMonth; d++) {
        const day = new Date(Date.UTC(year, month - 1, d));
        if (day >= start && day <= end) grid[l.employeeId][d] = { status: "LEAVE" };
      }
    }

    // Qo'lda kiritilgan yozuvlar ta'tildan ustun turadi
    for (const r of records) {
      if (!grid[r.employeeId]) continue;
      grid[r.employeeId][new Date(r.date).getUTCDate()] = { status: r.status, note: r.note, lateMinutes: r.lateMinutes };
    }

    return {
      year,
      month,
      daysInMonth,
      holidays: Object.fromEntries(holidayDays),
      employees: employees.map((e) => ({ ...e, days: grid[e.id] })),
    };
  }

  /** Bitta kunning holatini belgilash (jadvaldagi katakni bosganda). */
  async setAttendance(data: { employeeId: string; date: string; status: string; lateMinutes?: number; note?: string }, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    const day = new Date(data.date);
    const normalized = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));

    const record = await this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: data.employeeId, date: normalized } },
      create: { employeeId: data.employeeId, date: normalized, status: data.status, lateMinutes: data.lateMinutes, note: data.note },
      update: { status: data.status, lateMinutes: data.lateMinutes, note: data.note },
    });
    return record;
  }


  // ---------- "Mening HR" - shaxsiy sahifa ----------

  /**
   * Foydalanuvchining shaxsiy HR sahifasi uchun barcha ma'lumotlar:
   * profil, ta'til arizalari, ish jadvali, davomat, bayramlar, tug'ilgan kunlar
   * va minnatdorchiliklar.
   */
  async myHr(userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId },
      include: {
        departmentRef: { select: { name: true } },
        schedules: { orderBy: { weekday: "asc" } },
        leaves: { orderBy: { startDate: "desc" }, take: 5 },
        gratitudes: { orderBy: { createdAt: "desc" }, take: 5, include: { author: { select: { fullName: true } } } },
      },
    });

    const today = new Date();
    const startOfToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    const yearEnd = new Date(Date.UTC(today.getUTCFullYear() + 1, 0, 1));

    // Oxirgi 7 kunlik davomat
    const weekAgo = new Date(startOfToday);
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 6);

    const [onLeaveToday, holidays, allEmployees, myAttendance, recentGratitudes] = await this.prisma.$transaction([
      this.prisma.leave.findMany({
        where: { status: "APPROVED", startDate: { lte: startOfToday }, endDate: { gte: startOfToday } },
        include: { employee: { select: { id: true, fullName: true, position: true } } },
      }),
      this.prisma.holiday.findMany({
        where: { date: { gte: startOfToday, lt: yearEnd } },
        orderBy: { date: "asc" },
        take: 5,
      }),
      this.prisma.employee.findMany({
        where: { status: "ACTIVE", birthDate: { not: null } },
        select: { id: true, fullName: true, position: true, birthDate: true },
      }),
      employee
        ? this.prisma.attendance.findMany({
            where: { employeeId: employee.id, date: { gte: weekAgo, lte: startOfToday } },
            orderBy: { date: "asc" },
          })
        : this.prisma.attendance.findMany({ where: { id: "" } }),
      this.prisma.gratitude.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { employee: { select: { fullName: true } }, author: { select: { fullName: true } } },
      }),
    ]);

    // Yaqin 30 kun ichidagi tug'ilgan kunlar
    const upcomingBirthdays = allEmployees
      .map((e) => {
        const bd = new Date(e.birthDate!);
        let next = new Date(Date.UTC(today.getUTCFullYear(), bd.getUTCMonth(), bd.getUTCDate()));
        if (next < startOfToday) next = new Date(Date.UTC(today.getUTCFullYear() + 1, bd.getUTCMonth(), bd.getUTCDate()));
        const daysLeft = Math.round((next.getTime() - startOfToday.getTime()) / 86400000);
        return { id: e.id, fullName: e.fullName, position: e.position, date: next, daysLeft };
      })
      .filter((b) => b.daysLeft <= 30)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 5);

    return {
      employee: employee
        ? {
            id: employee.id,
            fullName: employee.fullName,
            position: employee.position,
            department: employee.departmentRef?.name ?? employee.department,
            hireDate: employee.hireDate,
            phone: employee.phone,
            email: employee.email,
            notes: employee.notes,
          }
        : null,
      schedules: employee?.schedules ?? [],
      myLeaves: employee?.leaves ?? [],
      myGratitudes: employee?.gratitudes ?? [],
      attendance: myAttendance,
      onLeaveToday,
      holidays,
      upcomingBirthdays,
      recentGratitudes,
    };
  }

  /** Xodimning haftalik ish jadvalini belgilash. */
  async setSchedule(data: { employeeId: string; weekday: number; startTime?: string; endTime?: string; isDayOff?: boolean; shiftName?: string }, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    return this.prisma.workSchedule.upsert({
      where: { employeeId_weekday: { employeeId: data.employeeId, weekday: data.weekday } },
      create: {
        employeeId: data.employeeId, weekday: data.weekday,
        startTime: data.startTime, endTime: data.endTime,
        isDayOff: data.isDayOff ?? false, shiftName: data.shiftName ?? "Umumiy smena",
      },
      update: {
        startTime: data.startTime, endTime: data.endTime,
        isDayOff: data.isDayOff ?? false, shiftName: data.shiftName ?? "Umumiy smena",
      },
    });
  }

  async listSchedules(employeeId: string) {
    return this.prisma.workSchedule.findMany({ where: { employeeId }, orderBy: { weekday: "asc" } });
  }

  // ---------- Minnatdorchilik ----------

  async listGratitudes(employeeId?: string) {
    return this.prisma.gratitude.findMany({
      where: employeeId ? { employeeId } : {},
      orderBy: { createdAt: "desc" },
      include: { employee: { select: { id: true, fullName: true, position: true } }, author: { select: { fullName: true } } },
    });
  }

  async createGratitude(data: { employeeId: string; message: string }, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    const trimmed = (data.message ?? "").trim();
    if (trimmed.length < 3) throw new BadRequestException("Minnatdorchilik matnini yozing.");
    return this.prisma.gratitude.create({
      data: { employeeId: data.employeeId, message: trimmed, authorId: user.id },
      include: { employee: { select: { fullName: true } } },
    });
  }

  async removeGratitude(id: string, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    await this.prisma.gratitude.delete({ where: { id } });
    return { deleted: true };
  }

  /** Xodim kartasini tizim foydalanuvchisiga bog'lash. */
  async linkUser(employeeId: string, userId: string | null, user: { id: string; role: string }) {
    this.ensureHrAccess(user.role);
    return this.prisma.employee.update({ where: { id: employeeId }, data: { userId } });
  }

  /**
   * Xodim uchun tizim hisobini AVTOMATIK yaratadi - login (email) va parol
   * o'zi generatsiya qilinadi, faqat rol tanlanadi. Parol faqat shu javobda
   * bir marta qaytariladi (bcrypt bilan bir tomonlama shifrlanadi, keyin
   * uni hech kim - administrator ham - qayta ko'ra olmaydi).
   */
  async createSystemAccount(employeeId: string, role: string, actor: { id: string; role: string }) {
    this.ensureHrAccess(actor.role);
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException("Xodim topilmadi.");
    if (employee.userId) throw new BadRequestException("Bu xodim allaqachon tizim hisobiga bog'langan.");
    if (![Role.ADMIN, Role.MANAGER, Role.EMPLOYEE].includes(role as Role)) {
      throw new BadRequestException("Noma'lum rol.");
    }

    const email = await this.generateUniqueLogin(employee.fullName);
    const password = this.generatePassword();

    const newUser = await this.prisma.user.create({
      data: { fullName: employee.fullName, email, passwordHash: await bcrypt.hash(password, 10), role },
    });
    await this.prisma.employee.update({ where: { id: employeeId }, data: { userId: newUser.id } });
    await this.auditLog.record({
      userId: actor.id, action: AuditAction.CREATE,
      metadata: { kind: "user", userId: newUser.id, viaEmployee: employeeId },
    });

    return { email, password, fullName: employee.fullName };
  }

  /** F.I.Sh asosida takrorlanmas login (email) - lotin harflari, bo'sh joy o'rniga nuqta, @wafagroup.uz domeni. */
  private async generateUniqueLogin(fullName: string): Promise<string> {
    const slug = fullName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join(".") || "xodim";

    let email = `${slug}@wafagroup.uz`;
    let n = 1;
    while (await this.prisma.user.findUnique({ where: { email } })) {
      email = `${slug}${++n}@wafagroup.uz`;
    }
    return email;
  }

  /** O'qishga qulay, lekin taxmin qilish qiyin parol yaratadi (adashtiruvchi 0/O, 1/l/I belgilarisiz). */
  private generatePassword(): string {
    const letters = "abcdefghijkmnpqrstuvwxyz";
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const digits = "23456789";
    const pick = (set: string, n: number) => Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join("");
    return `${pick(upper, 1)}${pick(letters, 5)}${pick(digits, 3)}!`;
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
