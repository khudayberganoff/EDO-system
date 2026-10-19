import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { UserDto, LoginRequestDto, OrganizationDto } from "@edo/shared-types";
import { login as loginRequest, switchOrganization as switchOrgRequest, eimzoLogin, eimzoSelectOrganization } from "../api/auth";
import { saveSession, readUser, clearSession, updateStoredUser, updateSession } from "../api/session-storage";

/**
 * `login()` shu xatoni tashlaydi (token BERMAYDI) agar foydalanuvchi
 * bir nechta tashkilotga ega bo'lsa va `organizationId` hali tanlanmagan
 * bo'lsa - LoginPage buni ushlab, alohida oynada tashkilot tanlashni so'raydi.
 */
export class OrganizationSelectionRequiredError extends Error {
  organizations: OrganizationDto[];
  /** Faqat ERI orqali kirishda: tanlashni yakunlash uchun qisqa muddatli token */
  selectionToken?: string;
  constructor(organizations: OrganizationDto[], selectionToken?: string) {
    super("organization_selection_required");
    this.organizations = organizations;
    this.selectionToken = selectionToken;
  }
}

interface AuthContextValue {
  user: UserDto | null;
  isAuthenticated: boolean;
  login: (payload: LoginRequestDto, remember?: boolean) => Promise<void>;
  /** ERI (E-IMZO) imzolagan PKCS#7 bilan kirish. Ko'p tashkilotli bo'lsa OrganizationSelectionRequiredError tashlaydi. */
  loginWithEri: (pkcs7: string, remember?: boolean) => Promise<void>;
  completeEriLogin: (selectionToken: string, organizationId: string, remember?: boolean) => Promise<void>;
  logout: () => void;
  /** Parol muvaffaqiyatli almashtirilgandan keyin - majburiy almashtirish belgisini yechadi. */
  markPasswordChanged: () => void;
  /** Qayta parol so'ramasdan boshqa (kira oladigan) tashkilotga o'tish. */
  switchOrganization: (organizationId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(readUser<UserDto>());

  const login = useCallback(async (payload: LoginRequestDto, remember = true) => {
    const response = await loginRequest(payload);
    if ("requiresOrganizationSelection" in response) {
      throw new OrganizationSelectionRequiredError(response.organizations);
    }
    saveSession(response.accessToken, response.user, remember);
    setUser(response.user);
  }, []);

  const loginWithEri = useCallback(async (pkcs7: string, remember = true) => {
    const response = await eimzoLogin(pkcs7);
    if ("requiresOrganizationSelection" in response) {
      throw new OrganizationSelectionRequiredError(response.organizations, response.selectionToken);
    }
    saveSession(response.accessToken, response.user, remember);
    setUser(response.user);
  }, []);

  const completeEriLogin = useCallback(async (selectionToken: string, organizationId: string, remember = true) => {
    const response = await eimzoSelectOrganization(selectionToken, organizationId);
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

  const switchOrganization = useCallback(async (organizationId: string) => {
    const response = await switchOrgRequest(organizationId);
    updateSession(response.accessToken, response.user);
    setUser(response.user);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, loginWithEri, completeEriLogin, logout, markPasswordChanged, switchOrganization }}>
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
