import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translations, type Language, type TranslationKey } from "./translations";

const STORAGE_KEY = "edo_language";

/** Brauzer tilidan boshlang'ich tilni taxmin qiladi (saqlangan tanlov bo'lmasa). */
function detectLanguage(): Language {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "uz" || saved === "ru" || saved === "en") return saved;
  const browser = navigator.language.slice(0, 2).toLowerCase();
  if (browser === "ru") return "ru";
  if (browser === "en") return "en";
  return "uz";
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  /** Tarjima qiladi. Ikkinchi argument - {kalit} o'rniga qo'yiladigan qiymatlar. */
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectLanguage);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((lang: Language) => setLanguageState(lang), []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      const dict = translations[language] as Record<string, string>;
      // Tarjima topilmasa - o'zbekchaga, u ham bo'lmasa kalitning o'ziga qaytamiz
      let text = dict[key] ?? (translations.uz as Record<string, string>)[key] ?? key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
        }
      }
      return text;
    },
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage faqat LanguageProvider ichida ishlatiladi");
  return ctx;
}

/** Qulaylik uchun - faqat tarjima funksiyasi kerak bo'lganda. */
export function useT() {
  return useLanguage().t;
}
