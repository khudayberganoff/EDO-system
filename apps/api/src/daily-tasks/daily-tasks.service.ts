import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateDailyTaskDto, UpdateDailyTaskDto } from "./dto/daily-task.dto";

/** Sana qismini kun boshiga (00:00) tekislaydi - vaqt qismi solishtiruvda ishtirok etmasin. */
function startOfDay(dateStr: string): Date {
  const d = new Date(dateStr);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Bosh sahifadagi kundalik reja/vazifalar - har bir foydalanuvchi faqat
 * o'zining yozuvlarini ko'radi va boshqaradi (shaxsiy eslatma daftarcha).
 */
@Injectable()
export class DailyTasksService {
  constructor(private prisma: PrismaService) {}

  async listForDate(userId: string, dateStr?: string) {
    const day = startOfDay(dateStr || new Date().toISOString().slice(0, 10));
    const nextDay = new Date(day.getTime() + 86_400_000);
    return this.prisma.dailyTask.findMany({
      where: { userId, date: { gte: day, lt: nextDay } },
      orderBy: [{ time: "asc" }, { createdAt: "asc" }],
    });
  }

  /**
   * Butun oy uchun vazifalar - kalendar tokchalarida qaysi kunlarda reja
   * borligini (nuqta bilan) ko'rsatish uchun. `month` "YYYY-MM" formatida.
   */
  async listForMonth(userId: string, month?: string) {
    const base = month ? new Date(`${month}-01`) : new Date();
    const start = new Date(Date.UTC(base.getFullYear(), base.getMonth(), 1));
    const end = new Date(Date.UTC(base.getFullYear(), base.getMonth() + 1, 1));
    return this.prisma.dailyTask.findMany({
      where: { userId, date: { gte: start, lt: end } },
      orderBy: [{ date: "asc" }, { time: "asc" }, { createdAt: "asc" }],
    });
  }

  async create(dto: CreateDailyTaskDto, userId: string) {
    return this.prisma.dailyTask.create({
      data: { userId, date: startOfDay(dto.date), time: dto.time, title: dto.title },
    });
  }

  private async findOwned(id: string, userId: string) {
    const task = await this.prisma.dailyTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("Vazifa topilmadi.");
    if (task.userId !== userId) throw new ForbiddenException("Bu vazifa sizga tegishli emas.");
    return task;
  }

  async update(id: string, dto: UpdateDailyTaskDto, userId: string) {
    await this.findOwned(id, userId);
    return this.prisma.dailyTask.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string) {
    await this.findOwned(id, userId);
    await this.prisma.dailyTask.delete({ where: { id } });
    return { success: true };
  }
}
