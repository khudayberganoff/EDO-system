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
  ChevronLeft,
  ChevronRight,
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

/** Sarlavhalar - joriy manzilga qarab tepadagi panelda ko'rsatish uchun. */
const PAGE_TITLES: { test: (path: string) => boolean; labelKey: string }[] = [
  { test: (p) => p === "/", labelKey: "nav.dashboard" },
  { test: (p) => p === "/my-hr", labelKey: "nav.myHr" },
  { test: (p) => p.startsWith("/documents"), labelKey: "nav.needApproval" },
  { test: (p) => p.startsWith("/letters/incoming"), labelKey: "nav.incoming" },
  { test: (p) => p.startsWith("/letters/outgoing"), labelKey: "nav.letter" },
  { test: (p) => p.startsWith("/letters/reference"), labelKey: "nav.reference" },
  { test: (p) => p.startsWith("/letters/warning"), labelKey: "nav.warnings" },
  { test: (p) => p.startsWith("/letters/archive"), labelKey: "nav.deleted" },
  { test: (p) => p.startsWith("/letters"), labelKey: "nav.lettersGroup" },
  { test: (p) => p.startsWith("/hr"), labelKey: "nav.hr" },
  { test: (p) => p.startsWith("/integrations"), labelKey: "nav.integrations" },
  { test: (p) => p.startsWith("/settings"), labelKey: "nav.settings" },
];

/** Bo'lim nomi yonida ko'rsatiladigan sondagi bo'rtma - tasdiq kutayotgan/yangi elementlar soni. 0 bo'lsa umuman ko'rinmaydi. */
function CountBadge({ count, tone = "blue" }: { count: number; tone?: "blue" | "red" }) {
  if (!count || count <= 0) return null;
  return (
    <span
      className={`ml-auto inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white ${
        tone === "red" ? "bg-red-500" : "bg-sky-600"
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
          isActive ? "bg-sky-50 text-sky-700 font-medium" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={18} className={isActive ? "text-sky-600" : "text-slate-400"} />
          {label}
          {typeof badge === "number" && <CountBadge count={badge} tone={badgeTone} />}
        </>
      )}
    </NavLink>
  );
}

function SubItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Mail }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-lg py-2 pl-9 pr-3 text-[13px] transition ${
          isActive ? "bg-sky-50 text-sky-700 font-medium" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
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
          isActive ? "bg-sky-50 text-sky-700 font-medium" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
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

  const pageTitleKey = PAGE_TITLES.find((x) => x.test(location.pathname))?.labelKey;
  const initials = (user?.fullName ?? "")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside
        className={`relative flex flex-col border-r border-slate-200 bg-white transition-all duration-300 ${
          sidebarOpen ? "w-64" : "w-0 overflow-hidden"
        }`}
      >
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-white">
            <FileText size={20} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-900">WAFA</div>
            <div className="text-xs text-slate-400">EDO tizimi</div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            title="Menyuni yopish"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <ChevronLeft size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Asosiy</div>
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
                isInLettersSection ? "text-slate-900 font-medium" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span className="flex items-center gap-3">
                <FileText size={18} className={isInLettersSection ? "text-sky-600" : "text-slate-400"} />
                {t("nav.lettersGroup")}
                <CountBadge count={draftLettersCount} />
              </span>
              <ChevronDown
                size={15}
                className={`text-slate-400 transition-transform ${lettersOpen ? "rotate-180" : ""}`}
              />
            </button>

            {lettersOpen && (
              <div className="mt-0.5 space-y-0.5">
                {/* Yig'iladigan "Chiquvchi" guruhi - xat, ma'lumotnoma, ogohlantirish */}
                <div>
                  <button
                    onClick={() => setOutgoingOpen((v) => !v)}
                    className={`flex w-full items-center justify-between rounded-lg py-2 pl-9 pr-3 text-[13px] transition ${
                      isInOutgoingSection ? "text-slate-900 font-medium" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
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

          {/* Yig'iladigan "Kadrlar" bo'limi */}
          <div>
            <button
              onClick={() => setHrOpen((v) => !v)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition ${
                isInHrSection ? "text-slate-900 font-medium" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span className="flex items-center gap-3">
                <Users size={18} className={isInHrSection ? "text-sky-600" : "text-slate-400"} />
                {t("nav.hr")}
                <CountBadge count={pendingLeavesCount} />
              </span>
              <ChevronDown size={15} className={`text-slate-400 transition-transform ${hrOpen ? "rotate-180" : ""}`} />
            </button>
            {hrOpen && (
              <div className="mt-0.5 space-y-0.5">
                {HR_SUB_ITEMS.map((x) => (
                  <SubItem key={x.to} to={x.to} label={t(x.labelKey)} icon={x.icon} />
                ))}
              </div>
            )}
          </div>

          <div className="my-2 border-t border-slate-100" />
          {can("deleted") && <Item to="/letters/archive" label={t("nav.deleted")} icon={Trash2} />}
          {can("integrations") && <Item to="/integrations" label={t("nav.integrations")} icon={Plug} />}
          {can("settings") && <Item to="/settings" label={t("nav.settings")} icon={Settings} />}
        </nav>

        <div className="border-t border-slate-100 px-3 py-3">
          {/* Tilni almashtirish - sessiya davomida ham o'zgartirish mumkin */}
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
            {LANGUAGES.map((item) => (
              <button
                key={item.code}
                onClick={() => setLanguage(item.code)}
                className={`rounded px-2 py-1.5 text-[11px] font-semibold transition ${
                  language === item.code ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-700"
                }`}
              >
                {item.short}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Tepadagi panel - menyuni ochish, joriy bo'lim, foydalanuvchi va chiqish */}
        <header className="flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Menyuni yopish" : "Menyuni ochish"}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
          <div className="flex-1 text-sm font-semibold text-slate-800">{pageTitleKey ? t(pageTitleKey as any) : ""}</div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-slate-800">{user?.fullName}</div>
              <div className="text-xs text-slate-400">{user?.role}</div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-700">
              {initials || <UserCircle2 size={20} />}
            </div>
            <button
              onClick={logout}
              title={t("nav.logout")}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="relative flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
