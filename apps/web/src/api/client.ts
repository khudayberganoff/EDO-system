import axios from "axios";
import { readToken, clearSession } from "./session-storage";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export const apiClient = axios.create({
  baseURL: `${API_URL}/api`,
});

apiClient.interceptors.request.use((config) => {
  const token = readToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Token eskirgan bo'lsa - avtomatik login sahifasiga qaytaramiz
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Kirish so'rovining o'zi ham 401 qaytaradi (noto'g'ri parol, bog'lanmagan ERI) - bu "sessiya tugadi" emas:
      // sahifani qayta yuklamaymiz, aks holda xato xabari ko'rinmay qoladi.
      const url: string = error.config?.url ?? "";
      const isLoginRequest = url.startsWith("/auth/login") || url.startsWith("/auth/eimzo/");
      if (!isLoginRequest && readToken()) {
        clearSession();
        if (window.location.pathname !== "/login") window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);
