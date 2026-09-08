import { useState, useEffect } from "react";
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
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  ScrollText,
  FileSignature,
  Palmtree,
  Building2,
  Briefcase,
  CalendarCheck,
  PartyPopper,
  UserCircle2,
  Award,
  Plug,
  Settings,
  Inbox,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { fetchMyAccess } from "../api/settings";
import { fetchDocuments } from "../api/documents";
import { fetchLetters } from "../api/letters";
import { fetchHrStats } from "../api/hr";
import { useLanguage } from "../i18n/LanguageContext";
import { LANGUAGES } from "../i18n/translations";

const TOP_NAV_ITEMS = [
  { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { to: "/my-hr", labelKey: "nav.myHr", icon: UserCircle2 },
  { to: "/documents?status=PENDING_SIGNATURE", labelKey: "nav.needApproval", icon: ClipboardList },
] as const;

/** Chiquvchi bo'limi ichidagi xat turlari */
const OUTGOING_SUB_ITEMS = [
  { to: "/letters/outgoing", labelKey: "nav.letter", icon: Mail },
  { to: "/letters/reference", labelKey: "nav.reference", icon: FileQuestion },
  { to: "/letters/warning", labelKey: "nav.warnings", icon: AlertTriangle },
] as const;

const HR_SUB_ITEMS = [
  { to: "/hr/departments", labelKey: "nav.hrDepartments", icon: Building2 },
  { to: "/hr/employees", labelKey: "nav.hrEmployees", icon: Users },
  { to: "/hr/positions", labelKey: "nav.hrPositions", icon: Briefcase },
  { to: "/hr/attendance", labelKey: "nav.hrAttendance", icon: CalendarCheck },
  { to: "/hr/leaves", labelKey: "nav.hrLeaves", icon: Palmtree },
  { to: "/hr/orders", labelKey: "nav.hrOrders", icon: ScrollText },
  { to: "/hr/contracts", labelKey: "nav.hrContracts", icon: FileSignature },
  { to: "/hr/holidays", labelKey: "nav.hrHolidays", icon: PartyPopper },
  { to: "/hr/gratitudes", labelKey: "nav.hrGratitudes", icon: Award },
] as const;


/** Bo'lim nomi yonida ko'rsatiladigan sondagi bo'rtma - tasdiq kutayotgan/yangi elementlar soni. 0 bo'lsa umuman ko'rinmaydi. */
function CountBadge({ count, tone = "blue" }: { count: number; tone?: "blue" | "red" }) {
  if (!count || count <= 0) return null;
  return (
    <span
      className={`ml-auto inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white ${
        tone === "red" ? "bg-red-500" : "bg-brand-accent"
      }`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function Item({ to, label, icon: Icon, badge, badgeTone }: { to: string; label: string; icon: typeof Mail; badge?: number; badgeTone?: "blue" | "red" }) {
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
      {typeof badge === "number" && <CountBadge count={badge} tone={badgeTone} />}
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
  // Interfeys foydalanuvchining ruxsatlariga qarab quriladi
  const { data: access } = useQuery({ queryKey: ["settings", "my-access"], queryFn: fetchMyAccess });
  const can = (module: string) => access?.[module]?.canView !== false;

  // Menyudagi son-bo'rtmalar - har biri o'z bo'limi uchun "diqqat talab qiladigan" elementlar soni.
  const { data: pendingSignatureDocs } = useQuery({
    queryKey: ["documents", "count", "pendingSignature"],
    queryFn: () => fetchDocuments({ status: "PENDING_SIGNATURE", page: 1 }),
    enabled: can("approvals"),
  });
  const { data: pendingLetters } = useQuery({
    queryKey: ["letters", "count", "pendingApproval"],
    queryFn: () => fetchLetters({ status: "PENDING_APPROVAL" as any }),
    enabled: can("approvals"),
  });
  const { data: draftLetters } = useQuery({
    queryKey: ["letters", "count", "draft"],
    queryFn: () => fetchLetters({ status: "DRAFT" as any }),
    enabled: can("letters"),
  });
  const { data: hrStats } = useQuery({
    queryKey: ["hr", "stats", "sidebar"],
    queryFn: fetchHrStats,
    enabled: can("hr"),
  });
  const needApprovalCount = (pendingSignatureDocs?.total ?? 0) + (pendingLetters?.items?.length ?? 0);
  const draftLettersCount = draftLetters?.items?.length ?? 0;
  const pendingLeavesCount = hrStats?.pendingLeaves ?? 0;
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();
  const isInLettersSection = location.pathname.startsWith("/letters") && location.pathname !== "/letters/archive";
  const [lettersOpen, setLettersOpen] = useState(isInLettersSection);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isInHrSection = location.pathname.startsWith("/hr");
  const [hrOpen, setHrOpen] = useState(isInHrSection);
  const isInOutgoingSection =
    location.pathname.startsWith("/letters/outgoing") ||
    location.pathname.startsWith("/letters/reference") ||
    location.pathname.startsWith("/letters/warning");
  const [outgoingOpen, setOutgoingOpen] = useState(isInOutgoingSection);

  // Boshqa sahifaga o'tilganda "Hujjatlar" ro'yxati avtomatik yig'iladi -
  // faqat shu bo'lim ichida qolsak ochiq turadi.
  useEffect(() => {
    setLettersOpen(isInLettersSection);
    setHrOpen(isInHrSection);
    setOutgoingOpen(isInOutgoingSection);
  }, [location.pathname, isInLettersSection, isInHrSection, isInOutgoingSection]);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside
        className={`girih-dark relative flex flex-col text-white transition-all duration-300 ${
          sidebarOpen ? "w-64" : "w-0 overflow-hidden"
        }`}
      >
        <div className="flex items-center gap-2 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-accent/20 text-brand-accent">
            <FileText size={20} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">WAFA</div>
            <div className="text-xs text-white/50">EDO tizimi</div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            title="Menyuni yopish"
            className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>
        {/* Islom hoshiyasiga ishora - ingichka oltin chiziq */}
        <div className="relative mx-4 h-px bg-gradient-to-r from-transparent via-gold-500/45 to-transparent" aria-hidden="true" />

        <nav className="relative flex-1 space-y-1 px-3">
          {TOP_NAV_ITEMS.filter((x) => can(x.to === "/" ? "dashboard" : x.to === "/my-hr" ? "my-hr" : "approvals"))
            .map((x) => (
              <Item
                key={x.to}
                to={x.to}
                label={t(x.labelKey)}
                icon={x.icon}
                badge={x.labelKey === "nav.needApproval" ? needApprovalCount : undefined}
                badgeTone="red"
              />
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
                {t("nav.lettersGroup")}
                <CountBadge count={draftLettersCount} />
              </span>
              <ChevronDown
                size={15}
                className={`transition-transform ${lettersOpen ? "rotate-180" : ""}`}
              />
            </button>

            {lettersOpen && (
              <div className="mt-0.5 space-y-0.5">
                {/* Yig'iladigan "Chiquvchi" guruhi - xat, ma'lumotnoma, ogohlantirish */}
                <div>
                  <button
                    onClick={() => setOutgoingOpen((v) => !v)}
                    className={`flex w-full items-center justify-between rounded-lg py-2 pl-9 pr-3 text-[13px] transition ${
                      isInOutgoingSection ? "text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-2.5"><Mail size={15} />{t("nav.outgoing")}</span>
                    <ChevronDown size={14} className={`transition-transform ${outgoingOpen ? "rotate-180" : ""}`} />
                  </button>
                  {outgoingOpen && (
                    <div className="mt-0.5 space-y-0.5">
                      {OUTGOING_SUB_ITEMS.map((x) => (
                        <SubSubItem key={x.to} to={x.to} label={t(x.labelKey)} icon={x.icon} />
                      ))}
                    </div>
                  )}
                </div>

                <SubItem to="/letters/incoming" label={t("nav.incoming")} icon={Inbox} />
              </div>
            )}
          </div>

          {/* Fayllar arxivi - alohida, "Hujjatlar" bo'limiga bog'liq emas */}
          {/* Yig'iladigan "Kadrlar" bo'limi */}
          <div>
            <button
              onClick={() => setHrOpen((v) => !v)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition ${
                isInHrSection ? "text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-3">
                <Users size={18} />
                {t("nav.hr")}
                <CountBadge count={pendingLeavesCount} />
              </span>
              <ChevronDown size={15} className={`transition-transform ${hrOpen ? "rotate-180" : ""}`} />
            </button>
            {hrOpen && (
              <div className="mt-0.5 space-y-0.5">
                {HR_SUB_ITEMS.map((x) => (
                  <SubItem key={x.to} to={x.to} label={t(x.labelKey)} icon={x.icon} />
                ))}
              </div>
            )}
          </div>

          {can("deleted") && <Item to="/letters/archive" label={t("nav.deleted")} icon={Trash2} />}
          {can("integrations") && <Item to="/integrations" label={t("nav.integrations")} icon={Plug} />}
          {can("settings") && <Item to="/settings" label={t("nav.settings")} icon={Settings} />}
        </nav>

        <div className="relative border-t border-white/10 px-3 py-4">
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

      <main className="relative flex-1 overflow-y-auto">
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            title="Menyuni ochish"
            className="absolute left-3 top-4 z-20 rounded-lg bg-brand-900 p-2 text-white shadow-lg transition hover:bg-brand-800"
          >
            <PanelLeftOpen size={18} />
          </button>
        )}
        <Outlet />
      </main>
    </div>
  );
}
