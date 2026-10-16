import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, MaxLength, MinLength, IsDateString, ValidateIf } from "class-validator";

export const BOARD_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as const;
export const BOARD_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export class CreateBoardTaskDto {
  @ApiProperty({ description: "Doska ID" })
  @IsString()
  boardId!: string;

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

export class RateBoardTaskDto {
  @ApiProperty({ minimum: 1, maximum: 5, description: "Ball (1-5)" }) @IsInt() @Min(1) @Max(5)
  rating!: number;
}

export class MoveBoardTaskDto {
  @ApiProperty({ enum: BOARD_STATUSES }) @IsIn(BOARD_STATUSES as unknown as string[])
  status!: string;

  @ApiProperty({ description: "Ustun ichidagi yangi o'rni (0 dan boshlanadi)" }) @IsInt() @Min(0)
  position!: number;
}

export class CreateBoardDto {
  @ApiProperty({ example: "Marketing" })
  @IsString() @MinLength(1) @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: "true - faqat o'zingizga ko'rinadigan shaxsiy doska" }) @IsOptional() @IsBoolean()
  personal?: boolean;
}

export class RenameBoardDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100)
  name!: string;
}

export class CreateBoardCommentDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(2000)
  text!: string;
}
