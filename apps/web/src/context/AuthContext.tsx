import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { UserDto, LoginRequestDto } from "@edo/shared-types";
import { login as loginRequest } from "../api/auth";
import { saveSession, readUser, clearSession, updateStoredUser } from "../api/session-storage";

interface AuthContextValue {
  user: UserDto | null;
  isAuthenticated: boolean;
  login: (payload: LoginRequestDto, remember?: boolean) => Promise<void>;
  logout: () => void;
  /** Parol muvaffaqiyatli almashtirilgandan keyin - majburiy almashtirish belgisini yechadi. */
  markPasswordChanged: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(readUser<UserDto>());

  const login = useCallback(async (payload: LoginRequestDto, remember = true) => {
    const response = await loginRequest(payload);
    saveSession(response.accessToken, response.user, remember);
    setUser(response.user);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const markPasswordChanged = useCallback(() => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, mustChangePassword: false };
      updateStoredUser(updated);
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, markPasswordChanged }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth faqat AuthProvider ichida ishlatilishi kerak.");
  }
  return ctx;
}
