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
  Archive,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const TOP_NAV_ITEMS = [
  { to: "/", label: "Bosh sahifa", icon: LayoutDashboard },
  { to: "/documents?status=IN_REVIEW", label: "Tasdiqlashim kerak", icon: ClipboardList },
];

const LETTER_SUB_ITEMS = [
  { to: "/letters/letter", label: "Xat", icon: Mail },
  { to: "/letters/first-warning", label: "1-ogohlantirish", icon: AlertTriangle },
  { to: "/letters/final-warning", label: "Yakuniy ogohlantirish", icon: AlertTriangle },
  { to: "/letters/reference", label: "Ma'lumotnoma", icon: FileQuestion },
];

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

export function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isInLettersSection = location.pathname.startsWith("/letters") && location.pathname !== "/letters/archive";
  const [lettersOpen, setLettersOpen] = useState(isInLettersSection);

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
            <Item key={x.to} {...x} />
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
                Hujjatlar
              </span>
              <ChevronDown
                size={15}
                className={`transition-transform ${lettersOpen ? "rotate-180" : ""}`}
              />
            </button>

            {lettersOpen && (
              <div className="mt-0.5 space-y-0.5">
                {LETTER_SUB_ITEMS.map((x) => (
                  <SubItem key={x.to} {...x} />
                ))}
              </div>
            )}
          </div>

          {/* Fayllar arxivi - alohida, "Hujjatlar" bo'limiga bog'liq emas */}
          <Item to="/letters/archive" label="Fayllar arxivi" icon={Archive} />
        </nav>

        <div className="border-t border-white/10 px-3 py-4">
          <div className="mb-2 px-3 text-xs text-white/50">{user?.fullName}</div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white"
          >
            <LogOut size={18} />
            Chiqish
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
