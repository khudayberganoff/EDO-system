import { UserDto } from "./models";

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface LoginResponseDto {
  accessToken: string;
  user: UserDto;
}

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
}
