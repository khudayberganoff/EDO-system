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
      clearSession();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);
