import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";

const SAFE_USER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException("Bu email bilan foydalanuvchi allaqachon mavjud.");
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        passwordHash,
        role: dto.role,
      },
      select: SAFE_USER_SELECT,
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: SAFE_USER_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SAFE_USER_SELECT });
    if (!user) {
      throw new NotFoundException("Foydalanuvchi topilmadi.");
    }
    return user;
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: SAFE_USER_SELECT,
    });
  }
}
