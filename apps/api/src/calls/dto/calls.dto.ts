import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, IsArray, ArrayMaxSize, Matches, Max, IsBoolean } from "class-validator";

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

export const LEAD_STAGES = ["NEW", "INFO_GIVEN", "CALLBACK", "MEETING", "VISITED", "REVIEW", "CONTRACT", "UNQUALIFIED"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Lidni rad etish sabablari: garov to'g'ri kelmadi, ustama qimmat, islomiy moliya xohlamadi, muddat */
export const LOSS_REASONS = ["COLLATERAL", "MARKUP", "ISLAMIC", "TERM"] as const;

export class CreateLeadDto {
  @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(100) source?: string;
  @IsOptional() @IsString() @MaxLength(10000) note?: string;
  @IsOptional() @IsIn(LEAD_STAGES as unknown as string[]) stage?: LeadStage;
  @IsOptional() @IsDateString() meetingAt?: string;
  @IsOptional() @IsDateString() callbackAt?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(4) @IsIn(LOSS_REASONS as unknown as string[], { each: true }) lossReasons?: string[];
  @IsOptional() @IsString() @MaxLength(50) lossTerm?: string;
  @IsOptional() @IsString() @MaxLength(1000) lossNote?: string;
  /** Loyiha haqida (bo'sh qator / null - tozalash) */
  @IsOptional() @IsString() @MaxLength(200) projectAsset?: string;
  @IsOptional() @IsString() @MaxLength(1000) projectGoal?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1e13) projectAmount?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(600) projectTermMonths?: number | null;
  @IsOptional() @IsBoolean() projectHasDownPayment?: boolean | null;
  @IsOptional() @IsNumber() @Min(0) @Max(1e13) projectDownPayment?: number | null;
}

export class UpdateLeadDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(100) source?: string;
  /** Facebook lidlari izohi uzun bo'lishi mumkin (arizadagi barcha javoblar) */
  @IsOptional() @IsString() @MaxLength(10000) note?: string;
  @IsOptional() @IsIn(LEAD_STAGES as unknown as string[]) stage?: LeadStage;
  @IsOptional() @IsDateString() meetingAt?: string;
  @IsOptional() @IsDateString() callbackAt?: string;
  /** Rad etish sabablari - kamida bittasi tanlansa lid avtomatik "Sifatsiz lead"ga o'tadi */
  @IsOptional() @IsArray() @ArrayMaxSize(4) @IsIn(LOSS_REASONS as unknown as string[], { each: true }) lossReasons?: string[];
  @IsOptional() @IsString() @MaxLength(50) lossTerm?: string;
  @IsOptional() @IsString() @MaxLength(1000) lossNote?: string;
  /** Loyiha haqida (bo'sh qator / null - tozalash) */
  @IsOptional() @IsString() @MaxLength(200) projectAsset?: string;
  @IsOptional() @IsString() @MaxLength(1000) projectGoal?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1e13) projectAmount?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(600) projectTermMonths?: number | null;
  @IsOptional() @IsBoolean() projectHasDownPayment?: boolean | null;
  @IsOptional() @IsNumber() @Min(0) @Max(1e13) projectDownPayment?: number | null;
}

export class SetClientPhoneDto {
  @IsIn(["wafa_leasing", "vafo_moliya"]) crmOrg!: "wafa_leasing" | "vafo_moliya";
  @IsString() @MaxLength(100) clientId!: string;
  /** Bo'sh qator - qo'lda kiritilgan raqamni o'chiradi */
  @IsString() @MaxLength(50) phone!: string;
}

export class SlaSettingsDto {
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) workStart?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) workEnd?: string;
  @IsOptional() @IsInt() @Min(1) @Max(500) responseHours?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000) resolveHours?: number;
}

/** Qo'ng'iroq havolasidagi raqam formati (MicroSIP/ATS qaysi ko'rinishni qabul qilsa) */
export const DIAL_FORMATS = ["plus", "intl", "local"] as const;
export class DialSettingsDto {
  @IsOptional() @IsIn(DIAL_FORMATS as unknown as string[]) format?: string;
  /** Raqam oldiga qo'shiladigan prefiks (masalan tashqi liniya uchun 9) */
  @IsOptional() @Matches(/^[0-9*#]{0,6}$/, { message: "Prefiks faqat raqamlar, * va # (6 belgigacha)." }) prefix?: string;
}

export class HolidayDto {
  @IsDateString() date!: string;
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsOptional() @IsIn(["HOLIDAY", "WORKDAY"]) type?: string;
}
