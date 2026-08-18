import { IsBoolean, IsDateString, IsEnum, IsNumber, IsInt, IsOptional, IsString, MinLength, Min } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { LetterType } from "../../common/enums";

export class CreateLetterDto {
  @ApiProperty({ enum: LetterType, example: LetterType.LETTER })
  @IsEnum(LetterType)
  type: LetterType;

  @ApiProperty({ example: "2026-08-15" })
  @IsDateString()
  documentDate: string;

  @ApiPropertyOptional({ example: "ORGANIZATION" })
  @IsOptional() @IsString()
  counterpartyType?: string;

  @ApiProperty({ example: '"YEMA GROUP INTERNATIONAL" MCHJ' })
  @IsString()
  counterpartyName: string;

  @ApiPropertyOptional({ example: "Toshkent sh., Chilonzor tumani" })
  @IsOptional() @IsString()
  counterpartyAddress?: string;

  @ApiPropertyOptional({ example: "+998901234567" })
  @IsOptional() @IsString()
  phoneNumber?: string;

  @ApiProperty({ example: "Shartnoma shartlari yuzasidan ogohlantirish" })
  @IsString() @MinLength(3)
  summary: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  bodyText?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  aiGenerated?: boolean;

  // --- Faqat OGOHLANTIRISH (WARNING) xatlari uchun ixtiyoriy maydonlar ---

  @ApiPropertyOptional({ example: "SH-2026-0451", description: "Shartnoma raqami" })
  @IsOptional() @IsString()
  contractNumber?: string;

  @ApiPropertyOptional({ example: "2026-01-15", description: "Shartnoma sanasi" })
  @IsOptional() @IsDateString()
  contractDate?: string;

  @ApiPropertyOptional({ example: 4500000, description: "Oylik to'lov summasi (so'm)" })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  monthlyPaymentAmount?: number;

  @ApiPropertyOptional({ example: 12, description: "Kechikkan kunlar soni" })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  overdueDays?: number;

  @ApiPropertyOptional({ example: 150000, description: "Xayriya to'lovi summasi (kechikish uchun, so'm)" })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  charityAmount?: number;
}
