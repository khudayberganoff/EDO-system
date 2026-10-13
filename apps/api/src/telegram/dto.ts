import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export class SaveTelegramTokenDto {
  @ApiProperty({ description: "BotFather bergan token (123456:ABC...)" })
  @IsString() @Matches(/^\d{6,}:[A-Za-z0-9_-]{30,}$/, { message: "Token formati noto'g'ri (masalan 123456789:AAH...)." })
  token!: string;
}
