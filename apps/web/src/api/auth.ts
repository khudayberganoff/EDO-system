import { apiClient } from "./client";
import type { LoginRequestDto, LoginResponseDto } from "@edo/shared-types";

export async function login(payload: LoginRequestDto) {
  const { data } = await apiClient.post<LoginResponseDto>("/auth/login", payload);
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const { data } = await apiClient.post("/auth/change-password", { currentPassword, newPassword });
  return data;
}
