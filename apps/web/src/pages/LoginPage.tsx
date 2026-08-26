import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Eye, EyeOff, ShieldCheck, GitBranch, BarChart3 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import { LANGUAGES } from "../i18n/translations";

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

  const features = [
    { icon: GitBranch, key: "login.featureFlow" },
    { icon: BarChart3, key: "login.featureAnalytics" },
    { icon: ShieldCheck, key: "login.featureShariah" },
  ] as const;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F6F8F7]">
      {/* Islom geometriyasi - fon naqshi */}
      <div className="login-pattern" aria-hidden="true" />

      {/* Tilni tanlash - yuqori o'ng burchakda, xalaqit bermaydi */}
      <div className="absolute right-6 top-6 z-20 flex gap-1 rounded-full border border-slate-200/80 bg-white/80 p-1 backdrop-blur-sm">
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

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col items-center gap-12 px-6 py-16 lg:flex-row lg:justify-between lg:gap-16">
        {/* Chap tomon - tizim haqida */}
        <div className="w-full max-w-xl">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-8 bg-gold-500" />
            {/* Xatam yulduzi - islomiy geometriyaga ishora */}
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-gold-600" aria-hidden="true">
              <path
                fill="none" stroke="currentColor" strokeWidth="1.3"
                d="M12 2.5 L14 7.4 L19 5.4 L17 10.3 L21.5 12 L17 13.7 L19 18.6 L14 16.6 L12 21.5 L10 16.6 L5 18.6 L7 13.7 L2.5 12 L7 10.3 L5 5.4 L10 7.4 Z"
              />
            </svg>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
              {t("login.eyebrow")}
            </span>
          </div>

          <h1 className="text-4xl font-bold leading-tight tracking-tight text-brand-950 sm:text-5xl">
            {t("login.heroLine1")}{" "}
            <span className="text-brand-600">{t("login.heroAccent")}</span>{" "}
            {t("login.heroLine2")}
          </h1>

          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-slate-500">
            {t("login.heroText")}
          </p>

          <div className="mt-8 flex flex-wrap gap-2.5">
            {features.map((f) => (
              <span
                key={f.key}
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-[13px] font-medium text-slate-700 shadow-[0_2px_10px_-6px_rgba(11,51,39,0.4)] backdrop-blur-sm"
              >
                <f.icon size={15} className="text-brand-600" />
                {t(f.key)}
              </span>
            ))}
          </div>
        </div>

        {/* O'ng tomon - kirish oynasi */}
        <div className="w-full max-w-sm">
          <div className="overflow-hidden rounded-[26px] border border-slate-200/70 bg-white shadow-[0_30px_80px_-45px_rgba(11,51,39,0.5)]">
            <div className="gold-rule" aria-hidden="true" />
            <div className="px-8 pb-8 pt-9">
              <div className="mb-7 text-center">
                <img src="/assets/wafa-logo.png" alt="WAFA" className="mx-auto h-auto w-[190px] object-contain" />
                <h2 className="mt-4 text-lg font-semibold text-brand-950">{t("login.title")}</h2>
                <p className="mt-1 text-sm text-slate-400">{t("login.subtitle")}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {t("login.emailPlaceholder")}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {t("login.passwordPlaceholder")}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 pr-11 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-500">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {t("login.remember")}
                </label>

                {error && (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-800 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  {t("login.submit")}
                </button>
              </form>
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            <a href="mailto:it@wafagroup.uz" className="transition hover:text-brand-700">
              {t("login.help")}
            </a>
          </p>
        </div>
      </div>

      <footer className="relative z-10 pb-8 text-center text-xs text-slate-400">
        <span className="font-semibold text-brand-800">WAFA</span>{" "}
        <span className="font-semibold text-gold-600">GROUP</span>
        <span className="mx-2">·</span>
        {t("login.footer")}
      </footer>
    </div>
  );
}
