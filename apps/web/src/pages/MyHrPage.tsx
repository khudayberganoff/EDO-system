import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Cake, PartyPopper, Award, Clock, Palmtree, UserCircle2 } from "lucide-react";
import { fetchMyHr } from "../api/hr";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n/LanguageContext";

const WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // dushanbadan boshlab

const LEAVE_TYPE_KEYS: Record<string, string> = {
  ANNUAL: "leave.annual", UNPAID: "leave.unpaid", SICK: "leave.sick",
  MATERNITY: "leave.maternity", STUDY: "leave.study",
};
const LEAVE_STATUS_DOT: Record<string, string> = {
  REQUESTED: "bg-amber-400", APPROVED: "bg-emerald-500", REJECTED: "bg-rose-500",
};
const LEAVE_STATUS_KEYS: Record<string, string> = {
  REQUESTED: "leaveStatus.requested", APPROVED: "leaveStatus.approved", REJECTED: "leaveStatus.rejected",
};
const ATT_LABELS: Record<string, { short: string; cls: string }> = {
  PRESENT: { short: "✓", cls: "bg-emerald-100 text-emerald-700" },
  LATE: { short: "!", cls: "bg-amber-100 text-amber-700" },
  ABSENT: { short: "×", cls: "bg-rose-100 text-rose-700" },
  LEAVE: { short: "T", cls: "bg-sky-100 text-sky-700" },
  SICK: { short: "K", cls: "bg-violet-100 text-violet-700" },
  BUSINESS_TRIP: { short: "S", cls: "bg-indigo-100 text-indigo-700" },
  DAYOFF: { short: "D", cls: "bg-slate-100 text-slate-500" },
};

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("uz-UZ") : "—");

/** Ish staji: yil, oy va kun hisobida */
function experience(hireDate: string, t: (k: any) => string): string {
  const start = new Date(hireDate);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();
  if (days < 0) { months -= 1; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (months < 0) { years -= 1; months += 12; }
  return [years > 0 ? `${years} ${t("myhr.year")}` : "", months > 0 ? `${months} ${t("myhr.month")}` : "", `${days} ${t("myhr.days")}`].filter(Boolean).join(" ");
}

export function MyHrPage() {
  const { user } = useAuth();
  const t = useT();
  const { data, isLoading } = useQuery({ queryKey: ["hr", "my"], queryFn: fetchMyHr });

  if (isLoading) return <div className="p-8 text-slate-400">{t("hr.loading")}</div>;

  const emp = data?.employee;

  return (
    <div className="p-8">
      {/* Profil sarlavhasi */}
      <div className="mb-6 flex items-center gap-5 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-brand-100 text-2xl font-semibold text-brand-800">
          {(emp?.fullName ?? user?.fullName ?? "?").charAt(0)}
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{emp?.fullName ?? user?.fullName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {emp ? [emp.position, emp.department].filter(Boolean).join(" · ") : t("myhr.notLinked")}
          </p>
        </div>
      </div>

      {!emp && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {t("myhr.notLinkedWarning")}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Profil ma'lumotlari */}
        <Card icon={UserCircle2} title={t("myhr.profile")}>
          {emp ? (
            <dl className="space-y-3 text-sm">
              <Row label={t("myhr.department")} value={emp.department ?? "—"} />
              <Row label={t("myhr.position")} value={emp.position} />
              <Row label={t("myhr.hireDate")} value={fmt(emp.hireDate)} />
              <Row label={t("myhr.experience")} value={experience(emp.hireDate, t)} />
              {emp.phone && <Row label={t("myhr.phone")} value={emp.phone} />}
              {emp.email && <Row label={t("myhr.email")} value={emp.email} />}
            </dl>
          ) : <Empty>{t("myhr.noData")}</Empty>}
        </Card>

        {/* Ta'til arizalarim */}
        <Card icon={Palmtree} title={t("myhr.myLeaves")}>
          {data?.myLeaves?.length ? (
            <ul className="space-y-3">
              {data.myLeaves.map((l: any) => (
                <li key={l.id} className="flex items-start gap-2.5">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${LEAVE_STATUS_DOT[l.status]}`} />
                  <div className="text-sm">
                    <div className="text-slate-800">{t(LEAVE_TYPE_KEYS[l.type] as any)} — {fmt(l.startDate)}</div>
                    <div className="text-xs text-slate-400">{t(LEAVE_STATUS_KEYS[l.status] as any)} · {l.days} {t("myhr.days")}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty>{t("myhr.noLeaves")}</Empty>}
        </Card>

        {/* Bugun ta'tilda */}
        <Card icon={Palmtree} title={t("myhr.onLeaveToday")}>
          {data?.onLeaveToday?.length ? (
            <ul className="space-y-3">
              {data.onLeaveToday.map((l: any) => (
                <li key={l.id} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" />
                  <div className="text-sm">
                    <div className="text-slate-800">{l.employee?.fullName}</div>
                    <div className="text-xs text-slate-400">{t(LEAVE_TYPE_KEYS[l.type] as any)} · {fmt(l.endDate)} {t("myhr.until")}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty>{t("myhr.everyoneAtWork")}</Empty>}
        </Card>

        {/* Smena tarkibi */}
        <Card icon={Clock} title={t("myhr.mySchedule")} className="lg:col-span-2">
          {data?.schedules?.length ? (
            <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
              {WEEKDAY_ORDER.map((wd) => {
                const sch = data.schedules.find((x: any) => x.weekday === wd);
                return (
                  <div key={wd} className="flex items-center gap-3 border-b border-slate-100 py-1.5 last:border-0">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                      {WEEKDAYS[wd].slice(0, 2)}
                    </span>
                    <span className="flex-1 text-sm text-slate-700">{sch?.shiftName ?? t("myhr.notSet")}</span>
                    <span className="text-sm text-slate-400">
                      {sch ? (sch.isDayOff ? t("myhr.dayOff") : `${sch.startTime ?? "—"} – ${sch.endTime ?? "—"}`) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : <Empty>{t("myhr.noSchedule")}</Empty>}
        </Card>

        {/* Davomat - oxirgi 7 kun */}
        <Card icon={CalendarDays} title={t("myhr.myAttendance")}>
          {data?.attendance?.length ? (
            <>
              <div className="flex flex-wrap gap-2">
                {data.attendance.map((a: any) => {
                  const st = ATT_LABELS[a.status];
                  return (
                    <div key={a.id} className="text-center">
                      <div className="mb-1 text-[11px] text-slate-400">{new Date(a.date).getDate()}</div>
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${st?.cls ?? "bg-slate-100"}`}>
                        {st?.short ?? "·"}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-slate-400">
                {t("myhr.atWork")}: {data.attendance.filter((a: any) => ["PRESENT", "LATE"].includes(a.status)).length} / {data.attendance.length}
              </p>
            </>
          ) : <Empty>{t("myhr.noAttendance")}</Empty>}
        </Card>

        {/* Bayram kunlari */}
        <Card icon={PartyPopper} title={t("myhr.holidays")}>
          {data?.holidays?.length ? (
            <ul className="space-y-2.5">
              {data.holidays.map((h: any) => (
                <li key={h.id} className="flex items-center gap-2.5 text-sm">
                  <span className="text-amber-500">★</span>
                  <span className="flex-1 text-slate-700">{h.name}</span>
                  <span className="text-xs text-slate-400">{fmt(h.date)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>{t("myhr.noHolidays")}</Empty>}
        </Card>

        {/* Tug'ilgan kunlar */}
        <Card icon={Cake} title={t("myhr.birthdays")}>
          {data?.upcomingBirthdays?.length ? (
            <ul className="space-y-2.5">
              {data.upcomingBirthdays.map((b: any) => (
                <li key={b.id} className="flex items-center gap-2.5 text-sm">
                  <span>🎂</span>
                  <div className="flex-1">
                    <div className="text-slate-700">{b.fullName}</div>
                    <div className="text-xs text-slate-400">{b.position}</div>
                  </div>
                  <span className="text-xs text-slate-400">
                    {b.daysLeft === 0 ? t("myhr.today") : `${b.daysLeft} ${t("myhr.inDays")}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : <Empty>{t("myhr.noBirthdays")}</Empty>}
        </Card>

        {/* Minnatdorchilik */}
        <Card icon={Award} title={t("myhr.gratitude")}>
          {data?.recentGratitudes?.length ? (
            <ul className="space-y-3">
              {data.recentGratitudes.map((g: any) => (
                <li key={g.id} className="text-sm">
                  <div className="font-medium text-slate-800">{g.employee?.fullName}</div>
                  <div className="text-slate-600">{g.message}</div>
                  <div className="mt-0.5 text-xs text-slate-400">{g.author?.fullName ?? "—"} · {fmt(g.createdAt)}</div>
                </li>
              ))}
            </ul>
          ) : <Empty>{t("myhr.noGratitude")}</Empty>}
        </Card>
      </div>
    </div>
  );
}

function Card({ icon: Icon, title, children, className = "" }: { icon: any; title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 ${className}`}>
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Icon size={16} className="text-brand-700" />
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}:</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-400">{children}</p>;
}
