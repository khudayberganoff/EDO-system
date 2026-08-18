import { IsEnum, IsOptional } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { LetterDirection, LetterType, LetterStatus } from "../../common/enums";

export class QueryLettersDto {
  @ApiPropertyOptional({ enum: LetterDirection })
  @IsOptional()
  @IsEnum(LetterDirection)
  direction?: LetterDirection;

  @ApiPropertyOptional({ enum: LetterType })
  @IsOptional()
  @IsEnum(LetterType)
  type?: LetterType;

  @ApiPropertyOptional({ enum: LetterStatus })
  @IsOptional()
  @IsEnum(LetterStatus)
  status?: LetterStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  pageSize?: number = 20;
}
