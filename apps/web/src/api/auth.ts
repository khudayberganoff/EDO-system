import { apiClient } from "./client";
import type { LoginRequestDto, LoginResponseDto } from "@edo/shared-types";

export async function login(payload: LoginRequestDto) {
  const { data } = await apiClient.post<LoginResponseDto>("/auth/login", payload);
  return data;
}
