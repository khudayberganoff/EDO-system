import { apiClient } from "./client";

/** Call-markazning o'z Telegram boti (yangi lidlar haqida xabarlar) */
export interface CallTelegramStatus { enabled: boolean; botUsername: string | null; linked: boolean; username: string | null }
export interface CallTelegramConfig {
  configured: boolean;
  botUsername: string | null;
  botName: string | null;
  webhook: { url: string | null; pending: number; lastError: string | null } | null;
  publicUrl: string;
  linkedUsers: number;
  /** Bot sozlanmagan bo'lsa xabarlar shu EDO boti orqali ketadi */
  fallbackBot: string | null;
}

export const fetchCallTelegramStatus = async () => (await apiClient.get<CallTelegramStatus>("/calls/telegram/status")).data;
export const createCallTelegramLink = async () => (await apiClient.post<{ url: string; expiresAt: string }>("/calls/telegram/link")).data;
export const unlinkCallTelegram = async () => (await apiClient.delete("/calls/telegram/link")).data;

export const fetchCallTelegramConfig = async () => (await apiClient.get<CallTelegramConfig>("/calls/telegram/config")).data;
export const saveCallTelegramBot = async (payload: { token: string; name?: string }) => (await apiClient.post<CallTelegramConfig>("/calls/telegram/config", payload)).data;
export const removeCallTelegramBot = async () => (await apiClient.delete<CallTelegramConfig>("/calls/telegram/config")).data;
