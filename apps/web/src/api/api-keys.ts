import { apiClient } from "./client";

export interface ApiKeyItem {
  id: string;
  name: string;
  maskedKey: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  createdBy?: string | null;
}

export async function fetchApiKeys() {
  const { data } = await apiClient.get<ApiKeyItem[]>("/api-keys");
  return data;
}
export async function createApiKey(payload: { name: string; scopes?: string[]; expiresAt?: string }) {
  const { data } = await apiClient.post<{ id: string; name: string; key: string; scopes: string[] }>("/api-keys", payload);
  return data;
}
export async function revokeApiKey(id: string) {
  const { data } = await apiClient.patch(`/api-keys/${id}/revoke`);
  return data;
}
export async function deleteApiKey(id: string) {
  const { data } = await apiClient.delete(`/api-keys/${id}`);
  return data;
}
