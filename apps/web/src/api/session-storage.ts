const KEYS = ["edo_access_token", "edo_user"] as const;

/**
 * "Meni eslab qol" belgilansa - localStorage (brauzer yopilsa ham saqlanadi),
 * belgilanmasa - sessionStorage (faqat shu tab ochiq turgancha saqlanadi).
 */
export function saveSession(token: string, user: unknown, remember: boolean) {
  const storage = remember ? localStorage : sessionStorage;
  const other = remember ? sessionStorage : localStorage;
  storage.setItem("edo_access_token", token);
  storage.setItem("edo_user", JSON.stringify(user));
  // eski sessiyadan qolgan izlarni tozalab qo'yamiz
  KEYS.forEach((key) => other.removeItem(key));
}

export function readToken(): string | null {
  return localStorage.getItem("edo_access_token") ?? sessionStorage.getItem("edo_access_token");
}

export function readUser<T>(): T | null {
  const raw = localStorage.getItem("edo_user") ?? sessionStorage.getItem("edo_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Saqlangan foydalanuvchi obyektini yangilaydi (masalan parol almashtirilgandan keyin) - token o'zgarmaydi. */
export function updateStoredUser(user: unknown) {
  const storage = localStorage.getItem("edo_user") ? localStorage : sessionStorage;
  storage.setItem("edo_user", JSON.stringify(user));
}

/** Token va foydalanuvchini yangilaydi - avvalgi "eslab qolish" tanlovi (localStorage/sessionStorage) saqlanadi. Tashkilot almashtirilganda ishlatiladi. */
export function updateSession(token: string, user: unknown) {
  const storage = localStorage.getItem("edo_access_token") ? localStorage : sessionStorage;
  storage.setItem("edo_access_token", token);
  storage.setItem("edo_user", JSON.stringify(user));
}

export function clearSession() {
  KEYS.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}
