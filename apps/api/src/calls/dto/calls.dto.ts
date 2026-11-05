import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

export const CALL_OUTCOMES = ["ANSWERED", "NO_ANSWER", "BUSY", "PROMISE", "REFUSED", "WRONG_NUMBER", "CALLBACK"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export class CreateCallLogDto {
  @IsString() @MaxLength(100) clientId!: string;
  @IsOptional() @IsIn(["wafa_leasing", "vafo_moliya"]) crmOrg?: "wafa_leasing" | "vafo_moliya";
  @IsString() @MaxLength(300) clientName!: string;
  @IsOptional() @IsString() @MaxLength(100) contractNumber?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsIn(CALL_OUTCOMES as unknown as string[]) outcome!: CallOutcome;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  /** PROMISE: mijoz to'lash va'da qilgan sana (YYYY-MM-DD) */
  @IsOptional() @IsDateString() promiseDate?: string;
  @IsOptional() @IsNumber() @Min(0) promiseAmount?: number;
  /** CALLBACK: qayta qo'ng'iroq vaqti (ISO) */
  @IsOptional() @IsDateString() callbackAt?: string;
  @IsOptional() @IsInt() dpd?: number;
  @IsOptional() @IsNumber() overdueAmount?: number;
}
