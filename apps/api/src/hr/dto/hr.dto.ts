import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class CreateEmployeeDto {
  @ApiProperty({ example: "Xudayberganov Maqsud Toshpulatovich" })
  @IsString() @MinLength(3) @MaxLength(200)
  fullName!: string;

  @ApiProperty({ example: "Bosh hisobchi" })
  @IsString() @MinLength(2) @MaxLength(150)
  position!: string;

  @ApiPropertyOptional({ example: "Moliya bo'limi" })
  @IsOptional() @IsString() @MaxLength(150)
  department?: string;

  @ApiProperty({ example: "2024-03-01" })
  @IsDateString()
  hireDate!: string;

  @ApiPropertyOptional({ example: "1990-05-12" })
  @IsOptional() @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ example: "+998901234567" })
  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: "xodim@wafagroup.uz" })
  @IsOptional() @IsString() @MaxLength(150)
  email?: string;

  @ApiPropertyOptional({ example: "AA1234567" })
  @IsOptional() @IsString() @MaxLength(20)
  passportSerial?: string;

  @ApiPropertyOptional({ example: "2020-04-15", description: "Pasport berilgan sana" })
  @IsOptional() @IsDateString()
  passportIssueDate?: string;

  @ApiPropertyOptional({ example: "2030-04-15", description: "Pasport amal qilish muddati" })
  @IsOptional() @IsDateString()
  passportExpiry?: string;

  @ApiPropertyOptional({ example: "Chilonzor tumani IIB", description: "Pasportni bergan organ" })
  @IsOptional() @IsString() @MaxLength(200)
  passportIssuedBy?: string;

  @ApiPropertyOptional({ example: "2026-12-31", description: "Ishdan bo'shagan sana (ixtiyoriy)" })
  @IsOptional() @IsDateString()
  dismissDate?: string;

  @ApiPropertyOptional({ example: "12345678901234", description: "JSHSHIR" })
  @IsOptional() @IsString() @MaxLength(20)
  pinfl?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300)
  address?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;
}

export class UpdateEmployeeDto extends CreateEmployeeDto {
  @ApiPropertyOptional({ enum: ["ACTIVE", "DISMISSED"] })
  @IsOptional() @IsString()
  status?: string;
}

export class CreateHrOrderDto {
  @ApiProperty() @IsString()
  employeeId!: string;

  @ApiProperty({ enum: ["HIRE", "DISMISS", "TRANSFER", "VACATION", "BONUS", "PENALTY", "OTHER"] })
  @IsString()
  type!: string;

  @ApiProperty({ example: "12-K" }) @IsString() @MaxLength(50)
  number!: string;

  @ApiProperty({ example: "2026-08-19" }) @IsDateString()
  orderDate!: string;

  @ApiProperty({ example: "Ishga qabul qilish to'g'risida" })
  @IsString() @MinLength(3) @MaxLength(300)
  subject!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000)
  content?: string;
}

export class CreateContractDto {
  @ApiProperty() @IsString()
  employeeId!: string;

  @ApiProperty({ example: "MSH-2026-014" }) @IsString() @MaxLength(60)
  number!: string;

  @ApiPropertyOptional({ enum: ["PERMANENT", "FIXED_TERM", "PART_TIME"] })
  @IsOptional() @IsString()
  type?: string;

  @ApiProperty({ example: "2026-01-05" }) @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ example: "2027-01-05" }) @IsOptional() @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 5500000 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  salary?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;
}

export class CreateLeaveDto {
  @ApiProperty() @IsString()
  employeeId!: string;

  @ApiPropertyOptional({ enum: ["ANNUAL", "UNPAID", "SICK", "MATERNITY", "STUDY"] })
  @IsOptional() @IsString()
  type?: string;

  @ApiProperty({ example: "2026-09-01" }) @IsDateString()
  startDate!: string;

  @ApiProperty({ example: "2026-09-15" }) @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  days?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}
