import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Eye, EyeOff, Mail, Users, QrCode } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import { LANGUAGES } from "../i18n/translations";

/** Sakkiz burchakli yulduz - islom geometriyasidagi asosiy motiv. */
function StarMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
        d="M12 2.5 L14 7.4 L19 5.4 L17 10.3 L21.5 12 L17 13.7 L19 18.6 L14 16.6 L12 21.5 L10 16.6 L5 18.6 L7 13.7 L2.5 12 L7 10.3 L5 5.4 L10 7.4 Z"
      />
    </svg>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ email, password }, remember);
      navigate("/");
    } catch {
      setError(t("login.error"));
    } finally {
      setLoading(false);
    }
  }

  const modules = [
    { icon: Mail, titleKey: "login.modLetters", textKey: "login.modLettersText" },
    { icon: Users, titleKey: "login.modHr", textKey: "login.modHrText" },
    { icon: QrCode, titleKey: "login.modQr", textKey: "login.modQrText" },
  ] as const;

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* ============ Chap panel: to'q zumrad, girih gazlamasi ============ */}
      <aside className="girih-light relative flex w-full flex-col justify-between overflow-hidden border-r border-slate-200/70 px-8 py-10 lg:w-[46%] lg:px-14 lg:py-14">
        {/* Yumshoq oq qatlam - naqsh matnni to'smasligi uchun */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/55 via-white/35 to-white/65" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <StarMark className="h-5 w-5 text-gold-600" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-700">
              {t("login.eyebrow")}
            </span>
          </div>
        </div>

        <div className="relative my-12 max-w-md lg:my-0">
          <h1 className="font-display text-[34px] font-semibold leading-[1.15] text-brand-950 lg:text-[42px]">
            {t("login.overviewTitle")}
          </h1>
          {/* Oltin hoshiya - sarlavha bilan matn orasidagi ajratgich */}
          <div className="mt-5 h-px w-16 bg-gradient-to-r from-gold-500 to-transparent" />
          <p className="mt-5 text-[15px] leading-relaxed text-slate-500">{t("login.overviewText")}</p>

          <div className="mt-9 space-y-5">
            {modules.map((m) => (
              <div key={m.titleKey} className="flex gap-4">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-brand-700 shadow-[0_2px_8px_-5px_rgba(11,51,39,0.5)]">
                  <m.icon size={16} />
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-slate-800">{t(m.titleKey)}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-slate-500">{t(m.textKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[11px] tracking-wide text-slate-400">{t("login.footer")}</p>
      </aside>

      {/* ============ O'ng panel: kirish ============ */}
      <main className="relative flex flex-1 items-center justify-center bg-white px-6 py-12">
        {/* Tilni tanlash */}
        <div className="absolute right-6 top-6 flex gap-1 rounded-full border border-slate-200 bg-white p-1">
          {LANGUAGES.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => setLanguage(item.code)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                language === item.code ? "bg-brand-800 text-white" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {item.short}
            </button>
          ))}
        </div>

        <div className="w-full max-w-[380px]">
          <div className="mb-9 text-center">
            <img src="/assets/wafa-logo.png" alt="WAFA" className="mx-auto h-auto w-[180px] object-contain" />
            <h2 className="mt-5 font-display text-[22px] font-semibold text-brand-950">{t("login.title")}</h2>
            <p className="mt-1.5 text-sm text-slate-400">{t("login.subtitle")}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {t("login.emailPlaceholder")}
              </label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/10"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {t("login.passwordPlaceholder")}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"} required value={password}
                  onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 pr-11 text-sm text-slate-900 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/10"
                />
                <button
                  type="button" onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 pt-1 text-sm text-slate-500">
              <input
                type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {t("login.remember")}
            </label>

            {error && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
            )}

            <button
              type="submit" disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-800 py-3.5 text-sm font-semibold tracking-wide text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {t("login.submit")}
            </button>
          </form>

          <p className="mt-7 text-center text-xs text-slate-400">
            <a href="mailto:it@wafagroup.uz" className="transition hover:text-brand-700">{t("login.help")}</a>
          </p>
        </div>
      </main>
    </div>
  );
}
