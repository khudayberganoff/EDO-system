import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  FileText,
  LayoutDashboard,
  LogOut,
  ClipboardList,
  Mail,
  AlertTriangle,
  FileQuestion,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import { LANGUAGES } from "../i18n/translations";

const TOP_NAV_ITEMS = [
  { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { to: "/documents?status=PENDING_SIGNATURE", labelKey: "nav.needApproval", icon: ClipboardList },
] as const;

const LETTER_SUB_ITEMS = [
  { to: "/letters/letter", labelKey: "nav.letter", icon: Mail },
  { to: "/letters/reference", labelKey: "nav.reference", icon: FileQuestion },
] as const;

const WARNING_SUB_ITEMS = [
  { to: "/letters/first-warning", labelKey: "nav.firstWarning", icon: AlertTriangle },
  { to: "/letters/final-warning", labelKey: "nav.finalWarning", icon: AlertTriangle },
] as const;

function Item({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Mail }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
          isActive ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
        }`
      }
    >
      <Icon size={18} />
      {label}
    </NavLink>
  );
}

function SubItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Mail }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-lg py-2 pl-9 pr-3 text-[13px] transition ${
          isActive ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
        }`
      }
    >
      <Icon size={15} />
      {label}
    </NavLink>
  );
}

/** Uchinchi daraja - "Ogohlantirish" guruhi ichidagi elementlar (chuqurroq chapdan bo'shliq) */
function SubSubItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Mail }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-lg py-2 pl-14 pr-3 text-[13px] transition ${
          isActive ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
        }`
      }
    >
      <Icon size={14} />
      {label}
    </NavLink>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();
  const isInLettersSection = location.pathname.startsWith("/letters") && location.pathname !== "/letters/archive";
  const isInWarningSection = location.pathname.startsWith("/letters/first-warning") || location.pathname.startsWith("/letters/final-warning");
  const [lettersOpen, setLettersOpen] = useState(isInLettersSection);
  const [warningsOpen, setWarningsOpen] = useState(isInWarningSection);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-64 flex-col bg-gradient-to-b from-brand-950 via-brand-900 to-brand-800 text-white">
        <div className="flex items-center gap-2 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-accent/20 text-brand-accent">
            <FileText size={20} />
          </div>
          <div>
            <div className="text-sm font-semibold">WAFA GROUP</div>
            <div className="text-xs text-white/50">EDO tizimi</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {TOP_NAV_ITEMS.map((x) => (
            <Item key={x.to} to={x.to} label={t(x.labelKey)} icon={x.icon} />
          ))}

          {/* Yig'iladigan "Hujjatlar" bo'limi - Xat / Ogohlantirish / Ma'lumotnoma */}
          <div>
            <button
              onClick={() => setLettersOpen((v) => !v)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition ${
                isInLettersSection ? "text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-3">
                <FileText size={18} />
                {t("nav.documents")}
              </span>
              <ChevronDown
                size={15}
                className={`transition-transform ${lettersOpen ? "rotate-180" : ""}`}
              />
            </button>

            {lettersOpen && (
              <div className="mt-0.5 space-y-0.5">
                {LETTER_SUB_ITEMS.slice(0, 1).map((x) => (
                  <SubItem key={x.to} to={x.to} label={t(x.labelKey)} icon={x.icon} />
                ))}

                {/* Yig'iladigan "Ogohlantirish" guruhi - 1-ogohlantirish / Yakuniy ogohlantirish */}
                <div>
                  <button
                    onClick={() => setWarningsOpen((v) => !v)}
                    className={`flex w-full items-center justify-between rounded-lg py-2 pl-9 pr-3 text-[13px] transition ${
                      isInWarningSection ? "text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <AlertTriangle size={15} />
                      {t("nav.warnings")}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${warningsOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {warningsOpen && (
                    <div className="mt-0.5 space-y-0.5">
                      {WARNING_SUB_ITEMS.map((x) => (
                        <SubSubItem key={x.to} to={x.to} label={t(x.labelKey)} icon={x.icon} />
                      ))}
                    </div>
                  )}
                </div>

                {LETTER_SUB_ITEMS.slice(1).map((x) => (
                  <SubItem key={x.to} to={x.to} label={t(x.labelKey)} icon={x.icon} />
                ))}
              </div>
            )}
          </div>

          {/* Fayllar arxivi - alohida, "Hujjatlar" bo'limiga bog'liq emas */}
          <Item to="/letters/archive" label={t("nav.deleted")} icon={Trash2} />
        </nav>

        <div className="border-t border-white/10 px-3 py-4">
          {/* Tilni almashtirish - sessiya davomida ham o'zgartirish mumkin */}
          <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-white/5 p-1">
            {LANGUAGES.map((item) => (
              <button
                key={item.code}
                onClick={() => setLanguage(item.code)}
                className={`rounded px-2 py-1.5 text-[11px] font-semibold transition ${
                  language === item.code ? "bg-white/15 text-white" : "text-white/50 hover:text-white"
                }`}
              >
                {item.short}
              </button>
            ))}
          </div>
          <div className="mb-2 px-3 text-xs text-white/50">{user?.fullName}</div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white"
          >
            <LogOut size={18} />
            {t("nav.logout")}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
