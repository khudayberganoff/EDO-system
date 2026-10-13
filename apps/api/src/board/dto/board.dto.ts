import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Min, MaxLength, MinLength, IsDateString, ValidateIf } from "class-validator";

export const BOARD_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as const;
export const BOARD_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export class CreateBoardTaskDto {
  @ApiProperty({ example: "Shartnoma loyihasini tayyorlash" })
  @IsString() @MinLength(1) @MaxLength(300)
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: BOARD_STATUSES }) @IsOptional() @IsIn(BOARD_STATUSES as unknown as string[])
  status?: string;

  @ApiPropertyOptional({ enum: BOARD_PRIORITIES }) @IsOptional() @IsIn(BOARD_PRIORITIES as unknown as string[])
  priority?: string;

  @ApiPropertyOptional({ example: "2026-10-20" }) @IsOptional() @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  assigneeId?: string;
}

export class UpdateBoardTaskDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(300)
  title?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: BOARD_PRIORITIES }) @IsOptional() @IsIn(BOARD_PRIORITIES as unknown as string[])
  priority?: string;

  /** null yuborilsa muddat olib tashlanadi */
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_o, v) => v !== null) @IsDateString()
  dueDate?: string | null;

  /** null yuborilsa mas'ul olib tashlanadi */
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString()
  assigneeId?: string | null;
}

export class MoveBoardTaskDto {
  @ApiProperty({ enum: BOARD_STATUSES }) @IsIn(BOARD_STATUSES as unknown as string[])
  status!: string;

  @ApiProperty({ description: "Ustun ichidagi yangi o'rni (0 dan boshlanadi)" }) @IsInt() @Min(0)
  position!: number;
}
