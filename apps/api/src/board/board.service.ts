import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateBoardTaskDto, MoveBoardTaskDto, UpdateBoardTaskDto } from "./dto/board.dto";

const TASK_INCLUDE = {
  assignee: { select: { id: true, fullName: true } },
  creator: { select: { id: true, fullName: true } },
} as const;

/** Vazifalar doskasi (Kanban) - tashkilot ichidagi barcha foydalanuvchilar uchun umumiy. */
@Injectable()
export class BoardService {
  constructor(private prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.boardTask.findMany({
      where: { organizationId },
      include: TASK_INCLUDE,
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
  }

  /** Mas'ul sifatida tanlash mumkin bo'lgan, shu tashkilotga kira oladigan faol xodimlar. */
  users(organizationId: string) {
    return this.prisma.user.findMany({
      where: { isActive: true, organizations: { some: { organizationId } } },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });
  }

  private async find(id: string, organizationId: string) {
    const task = await this.prisma.boardTask.findFirst({ where: { id, organizationId } });
    if (!task) throw new NotFoundException("Vazifa topilmadi.");
    return task;
  }

  async create(dto: CreateBoardTaskDto, userId: string, organizationId: string) {
    const status = dto.status ?? "TODO";
    // Yangi kartochka ustunning oxiriga qo'shiladi
    const last = await this.prisma.boardTask.aggregate({ where: { organizationId, status }, _max: { position: true } });
    return this.prisma.boardTask.create({
      data: {
        organizationId,
        creatorId: userId,
        title: dto.title,
        description: dto.description,
        status,
        priority: dto.priority ?? "MEDIUM",
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        assigneeId: dto.assigneeId || undefined,
        position: (last._max.position ?? -1) + 1,
      },
      include: TASK_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateBoardTaskDto, organizationId: string) {
    await this.find(id, organizationId);
    return this.prisma.boardTask.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueDate: dto.dueDate === undefined ? undefined : dto.dueDate === null ? null : new Date(dto.dueDate),
        assigneeId: dto.assigneeId === undefined ? undefined : dto.assigneeId,
      },
      include: TASK_INCLUDE,
    });
  }

  /** Kartochkani boshqa ustunga yoki ustun ichida boshqa o'ringa ko'chirish; ikkala ustun tartibi qayta yoziladi. */
  async move(id: string, dto: MoveBoardTaskDto, organizationId: string) {
    const task = await this.find(id, organizationId);
    await this.prisma.$transaction(async (tx) => {
      const target = await tx.boardTask.findMany({
        where: { organizationId, status: dto.status, NOT: { id } },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      const index = Math.min(dto.position, target.length);
      const ids = [...target.map((t) => t.id)];
      ids.splice(index, 0, id);
      await tx.boardTask.update({ where: { id }, data: { status: dto.status } });
      for (let i = 0; i < ids.length; i++) {
        await tx.boardTask.update({ where: { id: ids[i] }, data: { position: i } });
      }
      if (task.status !== dto.status) {
        const source = await tx.boardTask.findMany({
          where: { organizationId, status: task.status },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        });
        for (let i = 0; i < source.length; i++) {
          await tx.boardTask.update({ where: { id: source[i].id }, data: { position: i } });
        }
      }
    });
    return this.list(organizationId);
  }

  async remove(id: string, organizationId: string) {
    await this.find(id, organizationId);
    await this.prisma.boardTask.delete({ where: { id } });
    return { success: true };
  }
}
