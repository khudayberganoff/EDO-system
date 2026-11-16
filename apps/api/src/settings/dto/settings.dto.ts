import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { Role } from "../../common/enums";

const PERSON_FIELDS_NOTE = "Ism va familiya kiritilsa, F.I.Sh. ulardan avtomatik yasaladi";

export class CreateUserDto {
  @ApiPropertyOptional({ example: "Maqsud Xudayberganov", description: PERSON_FIELDS_NOTE })
  @IsOptional() @IsString() @MinLength(3, { message: "F.I.Sh. kamida 3 ta belgidan iborat bo'lishi kerak." }) @MaxLength(150)
  fullName?: string;

  @ApiPropertyOptional({ example: "Maqsud" })
  @IsOptional() @IsString() @MaxLength(60)
  firstName?: string;

  @ApiPropertyOptional({ example: "Xudayberganov" })
  @IsOptional() @IsString() @MaxLength(60)
  lastName?: string;

  @ApiPropertyOptional({ example: "Call-markaz operatori" })
  @IsOptional() @IsString() @MaxLength(120)
  position?: string;

  @ApiPropertyOptional({ example: "101", description: "ATS'dagi ichki raqam (qo'ng'iroqlarni xodimga bog'lash uchun)" })
  @IsOptional() @Matches(/^(\d{2,8})?$/, { message: "Ichki raqam 2-8 ta raqamdan iborat bo'lishi kerak." })
  extension?: string;

  @ApiProperty({ example: "xodim@wafagroup.uz" })
  @IsEmail({}, { message: "Email manzili noto'g'ri kiritilgan." })
  email!: string;

  @ApiProperty({ example: "Parol123!" })
  @IsString() @MinLength(8, { message: "Parol kamida 8 ta belgidan iborat bo'lishi kerak." }) @MaxLength(100)
  password!: string;

  @ApiProperty({ enum: Role, example: Role.EMPLOYEE })
  @IsEnum(Role, { message: "Rol noto'g'ri tanlangan." })
  role!: Role;

  @ApiPropertyOptional({ example: "31234567890123", description: "ERI orqali kirish uchun JSHSHIR (14 raqam)" })
  @IsOptional() @Matches(/^(\d{14})?$/, { message: "JSHSHIR 14 ta raqamdan iborat bo'lishi kerak." })
  pinfl?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MinLength(3) @MaxLength(150)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(60)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(60)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(120)
  position?: string;

  @ApiPropertyOptional({ description: "ATS ichki raqami; bo'sh qator - olib tashlash" })
  @IsOptional() @Matches(/^(\d{2,8})?$/, { message: "Ichki raqam 2-8 ta raqamdan iborat bo'lishi kerak." })
  extension?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional() @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MinLength(8) @MaxLength(100)
  password?: string;

  @ApiPropertyOptional({ description: "JSHSHIR (14 raqam); bo'sh qator - ERI bog'lanishini olib tashlaydi" })
  @IsOptional() @Matches(/^(\d{14})?$/, { message: "JSHSHIR 14 ta raqamdan iborat bo'lishi kerak." })
  pinfl?: string;
}

export class SetPermissionDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;

  @ApiProperty({ example: "letters" })
  @IsString()
  module!: string;

  @ApiProperty() @IsBoolean()
  canView!: boolean;

  @ApiProperty() @IsBoolean()
  canEdit!: boolean;
}
