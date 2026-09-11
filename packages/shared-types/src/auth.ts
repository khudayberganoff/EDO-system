import { UserDto } from "./models";

export interface LoginRequestDto {
  email: string;
  password: string;
  organizationId: string;
}

export interface LoginResponseDto {
  accessToken: string;
  user: UserDto;
}

export interface OrganizationDto {
  id: string;
  name: string;
}

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
  organizationId: string;
}
