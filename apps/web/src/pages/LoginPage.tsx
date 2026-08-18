import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Eye, EyeOff, ArrowRight, KeySquare } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
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
      setError("Login yoki parol noto'g'ri.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell relative flex min-h-screen flex-col overflow-hidden bg-[#F4F6F5]">
      <div className="login-pattern" aria-hidden="true" />
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <div className="rounded-[28px] bg-white/95 p-8 shadow-[0_20px_60px_-25px_rgba(15,27,23,0.3)] backdrop-blur-sm sm:p-10">
            {/* WAFA logotipi */}
            <div className="mb-8 flex justify-center">
              <img
                src="/assets/wafa-logo.png"
                alt="WAFA"
                className="h-auto w-[330px] object-contain"
              />
            </div>

            <div className="mb-6 text-center">
              <h1 className="text-xl font-bold tracking-tight text-brand-950">Elektron hujjat aylanishi</h1>
              <p className="mt-1 text-sm text-slate-500">EDO tizimiga kirish</p>
            </div>

            {/* Kirish usuli tab'lari */}
            <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-1">
              <button
                type="button"
                disabled
                title="Tez orada"
                className="cursor-not-allowed rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400"
              >
                <span className="flex items-center justify-center gap-1.5">
                  <KeySquare size={15} />
                  El. raqamli imzo
                </span>
              </button>
              <button
                type="button"
                className="rounded-lg border border-brand-700/30 bg-white px-3 py-2.5 text-sm font-semibold text-brand-800 shadow-sm"
              >
                Login va parol
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Login (email)"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
              />

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Parol"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-11 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                  aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <label className="flex select-none items-center gap-2.5 pt-1 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600/30"
                />
                Meni eslab qol
              </label>

              {error && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-900 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                Kirish
              </button>
            </form>
          </div>

          <div className="mt-6 flex items-center justify-center">
            <a
              href="mailto:it@wafagroup.uz"
              className="group flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-brand-800"
            >
              Yordam kerakmi? IT bo'limiga murojaat
              <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>
      </div>

      <footer className="relative z-10 border-t border-slate-200/70 bg-white/40 px-6 py-6 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 text-xs text-slate-400 sm:flex-row">
          <div className="flex items-center gap-1.5 font-semibold text-slate-500">
            <span className="text-brand-800">WAFA</span>
            <span className="text-gold-600">GROUP</span>
          </div>
          <p>Elektron hujjat aylanishi tizimi &middot; Toshkent</p>
        </div>
      </footer>
    </div>
  );
}
