import { IsEmail, IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({ example: "admin@wafagroup.uz" })
  @IsEmail({}, { message: "Email formati noto'g'ri." })
  email: string;

  @ApiProperty({ example: "Admin123!" })
  @IsString()
  @MinLength(6, { message: "Parol kamida 6 belgidan iborat bo'lishi kerak." })
  password: string;
}
