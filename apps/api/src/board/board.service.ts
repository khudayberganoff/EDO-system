import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { Role } from "../common/enums";
import { CreateBoardDto, CreateBoardTaskDto, MoveBoardTaskDto, UpdateBoardTaskDto } from "./dto/board.dto";

const TASK_INCLUDE = {
  assignee: { select: { id: true, fullName: true } },
  creator: { select: { id: true, fullName: true } },
  _count: { select: { comments: true } },
} as const;

/**
 * Vazifalar doskalari (Kanban). Doska yo'q bo'lsa tashkilot uchun "Umumiy doska"
 * o'zi yaratiladi; ownerId to'ldirilgan doskalar shaxsiy - faqat egasiga ko'rinadi.
 */
@Injectable()
export class BoardService {
  constructor(private prisma: PrismaService) {}

  /** Foydalanuvchiga ko'rinadigan doskalar (umumiy + o'zining shaxsiylari). */
  async listBoards(user: AuthenticatedUser) {
    const orgId = user.organizationId;
    let shared = await this.prisma.board.findFirst({ where: { organizationId: orgId, ownerId: null }, orderBy: { createdAt: "asc" } });
    if (!shared) {
      shared = await this.prisma.board.create({ data: { organizationId: orgId, name: "Umumiy doska" } });
    }
    // Doskalar paydo bo'lishidan oldingi kartochkalar umumiy doskaga o'tkaziladi
    await this.prisma.boardTask.updateMany({ where: { organizationId: orgId, boardId: null }, data: { boardId: shared.id } });
    return this.prisma.board.findMany({
      where: { organizationId: orgId, OR: [{ ownerId: null }, { ownerId: user.id }] },
      orderBy: { createdAt: "asc" },
    });
  }

  async createBoard(dto: CreateBoardDto, user: AuthenticatedUser) {
    return this.prisma.board.create({
      data: { organizationId: user.organizationId, name: dto.name, ownerId: dto.personal ? user.id : null },
    });
  }

  private async findBoard(id: string, user: AuthenticatedUser) {
    const board = await this.prisma.board.findFirst({
      where: { id, organizationId: user.organizationId, OR: [{ ownerId: null }, { ownerId: user.id }] },
    });
    if (!board) throw new NotFoundException("Doska topilmadi.");
    return board;
  }

  async renameBoard(id: string, name: string, user: AuthenticatedUser) {
    await this.findBoard(id, user);
    return this.prisma.board.update({ where: { id }, data: { name } });
  }

  async removeBoard(id: string, user: AuthenticatedUser) {
    const board = await this.findBoard(id, user);
    if (board.ownerId === null) {
      // Umumiy doskani faqat administrator o'chira oladi, oxirgi umumiy doska esa qoladi
      if (user.role !== Role.ADMIN) throw new ForbiddenException("Umumiy doskani faqat administrator o'chira oladi.");
      const sharedCount = await this.prisma.board.count({ where: { organizationId: user.organizationId, ownerId: null } });
      if (sharedCount <= 1) throw new ForbiddenException("Kamida bitta umumiy doska qolishi kerak.");
    }
    await this.prisma.board.delete({ where: { id } });
    return { success: true };
  }

  async list(boardId: string, user: AuthenticatedUser) {
    await this.findBoard(boardId, user);
    return this.prisma.boardTask.findMany({
      where: { boardId },
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

  /** Kartochkani topadi va doskasi foydalanuvchiga ko'rinishini tekshiradi. */
  private async find(id: string, user: AuthenticatedUser) {
    const task = await this.prisma.boardTask.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!task || !task.boardId) throw new NotFoundException("Vazifa topilmadi.");
    await this.findBoard(task.boardId, user);
    return task;
  }

  async create(dto: CreateBoardTaskDto, user: AuthenticatedUser) {
    await this.findBoard(dto.boardId, user);
    const status = dto.status ?? "TODO";
    // Yangi kartochka ustunning oxiriga qo'shiladi
    const last = await this.prisma.boardTask.aggregate({ where: { boardId: dto.boardId, status }, _max: { position: true } });
    return this.prisma.boardTask.create({
      data: {
        organizationId: user.organizationId,
        boardId: dto.boardId,
        creatorId: user.id,
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

  async update(id: string, dto: UpdateBoardTaskDto, user: AuthenticatedUser) {
    await this.find(id, user);
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
  async move(id: string, dto: MoveBoardTaskDto, user: AuthenticatedUser) {
    const task = await this.find(id, user);
    const boardId = task.boardId!;
    await this.prisma.$transaction(async (tx) => {
      const column = (status: string, excludeId?: string) =>
        tx.boardTask.findMany({
          where: { boardId, status, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        });
      const target = await column(dto.status, id);
      const ids = target.map((t) => t.id);
      ids.splice(Math.min(dto.position, ids.length), 0, id);
      await tx.boardTask.update({ where: { id }, data: { status: dto.status } });
      for (let i = 0; i < ids.length; i++) {
        await tx.boardTask.update({ where: { id: ids[i] }, data: { position: i } });
      }
      if (task.status !== dto.status) {
        const source = await column(task.status);
        for (let i = 0; i < source.length; i++) {
          await tx.boardTask.update({ where: { id: source[i].id }, data: { position: i } });
        }
      }
    });
    return this.list(boardId, user);
  }

  async remove(id: string, user: AuthenticatedUser) {
    await this.find(id, user);
    await this.prisma.boardTask.delete({ where: { id } });
    return { success: true };
  }

  // --- Izohlar ---

  async comments(taskId: string, user: AuthenticatedUser) {
    await this.find(taskId, user);
    return this.prisma.boardComment.findMany({
      where: { taskId },
      include: { author: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async addComment(taskId: string, text: string, user: AuthenticatedUser) {
    await this.find(taskId, user);
    return this.prisma.boardComment.create({
      data: { taskId, authorId: user.id, text },
      include: { author: { select: { id: true, fullName: true } } },
    });
  }

  async removeComment(taskId: string, commentId: string, user: AuthenticatedUser) {
    await this.find(taskId, user);
    const comment = await this.prisma.boardComment.findFirst({ where: { id: commentId, taskId } });
    if (!comment) throw new NotFoundException("Izoh topilmadi.");
    if (comment.authorId !== user.id && user.role !== Role.ADMIN) throw new ForbiddenException("Bu izoh sizga tegishli emas.");
    await this.prisma.boardComment.delete({ where: { id: commentId } });
    return { success: true };
  }
}
