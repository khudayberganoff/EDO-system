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
