import { IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty()
  @IsString()
  @MinLength(8, { message: "Yangi parol kamida 8 ta belgidan iborat bo'lishi kerak." })
  newPassword: string;
}
