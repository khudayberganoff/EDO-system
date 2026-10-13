import { apiClient } from "./client";

export interface TelegramStatus { enabled: boolean; botUsername: string | null; linked: boolean; username: string | null }
export interface TelegramConfig {
  configured: boolean;
  source: "env" | "db" | null;
  botUsername: string | null;
  webhook: { url: string | null; pending: number; lastError: string | null } | null;
  publicUrl: string;
  linkedUsers: number;
}

export async function fetchTelegramStatus() { const { data } = await apiClient.get<TelegramStatus>("/telegram/status"); return data; }
export async function createTelegramLink() { const { data } = await apiClient.post<{ url: string; expiresAt: string }>("/telegram/link"); return data; }
export async function unlinkTelegram() { const { data } = await apiClient.delete("/telegram/link"); return data; }

export async function fetchTelegramConfig() { const { data } = await apiClient.get<TelegramConfig>("/telegram/config"); return data; }
export async function saveTelegramToken(token: string) { const { data } = await apiClient.post<{ botUsername: string }>("/telegram/config", { token }); return data; }
export async function removeTelegramToken() { const { data } = await apiClient.delete("/telegram/config"); return data; }
