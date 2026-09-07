import { apiClient } from "./client";

export interface SystemUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt?: string;
}

export interface PermissionRow {
  module: string;
  label: string;
  roles: Record<string, { canView: boolean; canEdit: boolean }>;
}

export async function fetchPermissions() {
  const { data } = await apiClient.get<{ modules: PermissionRow[]; roles: string[] }>("/settings/permissions");
  return data;
}
export async function setPermission(payload: { role: string; module: string; canView: boolean; canEdit: boolean }) {
  const { data } = await apiClient.post("/settings/permissions", payload);
  return data;
}
export async function fetchMyAccess() {
  const { data } = await apiClient.get<Record<string, { canView: boolean; canEdit: boolean }>>("/settings/my-access");
  return data;
}
export async function fetchUsers() {
  const { data } = await apiClient.get<SystemUser[]>("/settings/users");
  return data;
}
export async function createUser(payload: { fullName: string; email: string; password: string; role: string }) {
  const { data } = await apiClient.post("/settings/users", payload);
  return data;
}
export async function updateUser(id: string, payload: { fullName?: string; role?: string; isActive?: boolean; password?: string }) {
  const { data } = await apiClient.patch(`/settings/users/${id}`, payload);
  return data;
}

/** Parolni tiklash - javobda yangi parol BIR MARTA qaytariladi. */
export async function resetUserPassword(id: string, password?: string) {
  const { data } = await apiClient.post<{ email: string; fullName: string; password: string }>(
    `/settings/users/${id}/reset-password`,
    { password },
  );
  return data;
}
