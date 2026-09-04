import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { Role } from "../../common/enums";

export class CreateUserDto {
  @ApiProperty({ example: "Maqsud Xudayberganov" })
  @IsString() @MinLength(3, { message: "F.I.Sh. kamida 3 ta belgidan iborat bo'lishi kerak." }) @MaxLength(150)
  fullName!: string;

  @ApiProperty({ example: "xodim@wafagroup.uz" })
  @IsEmail({}, { message: "Email manzili noto'g'ri kiritilgan." })
  email!: string;

  @ApiProperty({ example: "Parol123!" })
  @IsString() @MinLength(8, { message: "Parol kamida 8 ta belgidan iborat bo'lishi kerak." }) @MaxLength(100)
  password!: string;

  @ApiProperty({ enum: Role, example: Role.EMPLOYEE })
  @IsEnum(Role, { message: "Rol noto'g'ri tanlangan." })
  role!: Role;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MinLength(3) @MaxLength(150)
  fullName?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional() @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MinLength(8) @MaxLength(100)
  password?: string;
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
