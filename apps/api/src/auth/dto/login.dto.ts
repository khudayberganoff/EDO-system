import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({ example: "admin@wafagroup.uz" })
  @IsEmail({}, { message: "Email formati noto'g'ri." })
  email: string;

  @ApiProperty({ example: "Admin123!" })
  @IsString()
  @MinLength(6, { message: "Parol kamida 6 belgidan iborat bo'lishi kerak." })
  password: string;

  @ApiProperty({
    required: false,
    description:
      "Foydalanuvchi tanlagan tashkilot ID'si. Foydalanuvchi bir nechta tashkilotga ega bo'lsa va bu berilmasa, " +
      "javobda requiresOrganizationSelection=true va tashkilotlar ro'yxati qaytadi (token berilmaydi) - " +
      "shundan keyin xuddi shu email/parol bilan, endi organizationId qo'shib qayta yuborish kerak.",
  })
  @IsString()
  @IsOptional()
  organizationId?: string;
}
