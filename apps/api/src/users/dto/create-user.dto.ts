import { IsEmail, IsEnum, IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Role } from "../../common/enums";

export class CreateUserDto {
  @ApiProperty({ example: "Aziz Azizov" })
  @IsString()
  fullName: string;

  @ApiProperty({ example: "aziz@wafagroup.uz" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "StrongPass123!" })
  @IsString()
  @MinLength(8, { message: "Parol kamida 8 belgidan iborat bo'lishi kerak." })
  password: string;

  @ApiProperty({ enum: Role, example: Role.EMPLOYEE })
  @IsEnum(Role)
  role: Role;
}
