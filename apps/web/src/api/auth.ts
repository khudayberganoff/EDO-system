import { apiClient } from "./client";
import type { LoginRequestDto, LoginResponseDto, LoginSuccessDto, OrganizationDto } from "@edo/shared-types";

/** Kirish sahifasidagi tashkilot tanlagichi uchun - login qilishdan OLDIN ochiq. */
export async function fetchOrganizations() {
  const { data } = await apiClient.get<OrganizationDto[]>("/auth/organizations");
  return data;
}

export async function login(payload: LoginRequestDto) {
  const { data } = await apiClient.post<LoginResponseDto>("/auth/login", payload);
  return data;
}

/** Joriy foydalanuvchi kira oladigan tashkilotlar - almashtirgichni ko'rsatish/yashirish uchun. */
export async function fetchMyOrganizations() {
  const { data } = await apiClient.get<OrganizationDto[]>("/auth/my-organizations");
  return data;
}

/** Qayta parol so'ramasdan boshqa (kira oladigan) tashkilotga o'tish. */
export async function switchOrganization(organizationId: string) {
  // Bu endpoint hech qachon tashkilot tanlashni qayta so'ramaydi - organizationId aniq berilgan
  const { data } = await apiClient.post<LoginSuccessDto>("/auth/switch-organization", { organizationId });
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const { data } = await apiClient.post("/auth/change-password", { currentPassword, newPassword });
  return data;
}

// ---------- ERI (E-IMZO) orqali kirish ----------

export async function fetchEimzoConfig() {
  const { data } = await apiClient.get<{ enabled: boolean; apiKeys: string[] }>("/auth/eimzo/config");
  return data;
}
export async function fetchEimzoChallenge() {
  const { data } = await apiClient.get<{ challenge: string }>("/auth/eimzo/challenge");
  return data.challenge;
}
export async function eimzoLogin(pkcs7: string) {
  const { data } = await apiClient.post<LoginResponseDto & { selectionToken?: string }>("/auth/eimzo/login", { pkcs7 });
  return data;
}
export async function eimzoSelectOrganization(selectionToken: string, organizationId: string) {
  const { data } = await apiClient.post<LoginSuccessDto>("/auth/eimzo/select-organization", { selectionToken, organizationId });
  return data;
}

export interface EimzoSettings { configured: boolean; source: "env" | "db" | null; serverUrl: string; domain: string; apiKey: string }
export async function fetchEimzoSettings() {
  const { data } = await apiClient.get<EimzoSettings>("/auth/eimzo/settings");
  return data;
}
export async function saveEimzoSettings(payload: { serverUrl: string; domain: string; apiKey?: string }) {
  const { data } = await apiClient.put("/auth/eimzo/settings", payload);
  return data;
}
export async function removeEimzoSettings() {
  const { data } = await apiClient.delete("/auth/eimzo/settings");
  return data;
}
