import { IsEnum, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DocumentType } from "../../common/enums";

export class CreateDocumentDto {
  @ApiProperty({ example: "Murobaha shartnomasi №045" })
  @IsString()
  title: string;

  @ApiProperty({ enum: DocumentType, example: DocumentType.CONTRACT })
  @IsEnum(DocumentType)
  type: DocumentType;

  @ApiPropertyOptional({
    description: "WAFA GROUP CRM tizimidagi tegishli shartnoma ID'si (integratsiya nuqtasi)",
    example: "CRM-CONTRACT-045",
  })
  @IsOptional()
  @IsString()
  contractRefId?: string;
}
