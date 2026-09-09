import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateDailyTaskDto {
  @ApiProperty({ example: "2026-09-09", description: "Vazifa tegishli sana" })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ example: "09:30", description: "Soat (ixtiyoriy) - HH:MM formatida" })
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Soat HH:MM formatida bo'lishi kerak" })
  time?: string;

  @ApiProperty({ example: "Buxgalteriya bilan uchrashuv" })
  @IsString() @MinLength(1) @MaxLength(300)
  title!: string;
}

export class UpdateDailyTaskDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(300)
  title?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Soat HH:MM formatida bo'lishi kerak" })
  time?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  done?: boolean;
}
