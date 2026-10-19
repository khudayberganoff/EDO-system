import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class EimzoLoginDto {
  /** E-IMZO yaratgan PKCS#7 (base64) - challenge imzolangan */
  @IsString() @MinLength(100) @MaxLength(200_000)
  pkcs7!: string;

  @IsOptional() @IsString()
  organizationId?: string;
}

export class EimzoSelectOrgDto {
  @IsString() selectionToken!: string;
  @IsString() organizationId!: string;
}

export class SaveEimzoConfigDto {
  @IsString() @MaxLength(300) serverUrl!: string;
  @IsString() @MaxLength(200) domain!: string;
  @IsOptional() @IsString() @MaxLength(500) apiKey?: string;
}
