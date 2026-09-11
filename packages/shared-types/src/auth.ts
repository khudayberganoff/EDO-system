import { UserDto } from "./models";

export interface LoginRequestDto {
  email: string;
  password: string;
  /// Faqat foydalanuvchi bir nechta tashkilotga ega bo'lganda (2-qadamda) kerak
  organizationId?: string;
}

export interface OrganizationDto {
  id: string;
  name: string;
}

/// Email/parol to'g'ri, lekin foydalanuvchi bir nechta tashkilotga ega -
/// token berilmagan, tanlash kerak (LoginPage alohida oynada ko'rsatadi).
export interface LoginOrgSelectionRequiredDto {
  requiresOrganizationSelection: true;
  organizations: OrganizationDto[];
}

export interface LoginSuccessDto {
  accessToken: string;
  user: UserDto;
}

export type LoginResponseDto = LoginSuccessDto | LoginOrgSelectionRequiredDto;

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
  organizationId: string;
}
