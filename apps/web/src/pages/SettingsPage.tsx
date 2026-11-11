import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, ShieldCheck, Plus, X, Check, Ban, KeyRound, Copy, Info, Mail, Phone, Briefcase, Building2, CalendarDays, FileText, IdCard } from "lucide-react";
import { IS_CALL_SITE } from "../utils/site";
import { TelephonyCard } from "./IntegrationsPage";
import { useLanguage } from "../i18n/LanguageContext";
import { LOCALE_OF } from "../i18n/callsTranslations";
import type { TranslationKey } from "../i18n/translations";
import { fetchPermissions, setPermission, fetchUsers, createUser, updateUser, resetUserPassword, fetchUserDetails, type SystemUser, type PermissionRow } from "../api/settings";

const ROLES = ["ADMIN", "MANAGER", "EMPLOYEE", "OBSERVER", "OPERATOR"] as const;
const ROLE_KEYS: Record<string, TranslationKey> = {
  ADMIN: "settings.role.ADMIN",
  MANAGER: "settings.role.MANAGER",
  EMPLOYEE: "settings.role.EMPLOYEE",
  OBSERVER: "settings.role.OBSERVER",
  OPERATOR: "settings.role.OPERATOR",
};
/** Bo'lim kaliti -> menyudagi nom (tarjima kaliti) */
const MODULE_KEYS: Record<string, TranslationKey> = {
  dashboard: "nav.dashboard",
  "my-hr": "nav.myHr",
  approvals: "nav.needApproval",
  board: "nav.board",
  letters: "nav.lettersGroup",
  calls: "nav.calls",
  hr: "nav.hr",
  deleted: "nav.deleted",
  integrations: "nav.integrations",
  settings: "nav.settings",
};

/** Rol nomini joriy tilda qaytaradi */
function useRoleLabel() {
  const { t } = useLanguage();
  return (role: string) => (ROLE_KEYS[role] ? t(ROLE_KEYS[role]) : role);
}

export function SettingsPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<"users" | "permissions" | "telephony">("users");

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-display text-[30px] font-semibold tracking-tight text-brand-950">{t("nav.settings")}</h1>
        <p className="mt-1 text-sm text-slate-500">{IS_CALL_SITE ? t("settings.subtitleCall") : t("settings.subtitle")}</p>
      </div>

      <div className="mb-5 flex gap-2">
        {[
          { key: "users" as const, label: t("settings.tab.users"), icon: Users },
          { key: "permissions" as const, label: t("settings.tab.permissions"), icon: ShieldCheck },
          ...(IS_CALL_SITE ? [{ key: "telephony" as const, label: t("settings.tab.telephony"), icon: Phone }] : []),
        ].map((x) => (
          <button
            key={x.key}
            onClick={() => setTab(x.key)}
            className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition ${
              tab === x.key ? "bg-brand-800 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            <x.icon size={16} /> {x.label}
          </button>
        ))}
      </div>

      {tab === "users" ? <UsersTab /> : tab === "permissions" ? <PermissionsTab /> : <TelephonyCard />}
    </div>
  );
}

// ==================== FOYDALANUVCHILAR ====================

function UsersTab() {
  const { t } = useLanguage();
  const roleLabel = useRoleLabel();
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<SystemUser | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings", "users"], queryFn: fetchUsers });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["settings"] });

  const [error, setError] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => updateUser(id, payload),
    onSuccess: () => { setError(null); invalidate(); },
    onError: (e: any) => setError(e?.response?.data?.message ?? t("settings.updateFailed")),
  });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-800 px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-brand-700"
        >
          <Plus size={18} /> {t("settings.newUser")}
        </button>
      </div>

      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("settings.colName")}</th>
              <th className="px-4 py-3">{t("settings.colEmail")}</th>
              <th className="px-4 py-3">{t("settings.colRole")}</th>
              <th className="px-4 py-3" title={t("settings.colPinflHint")}>{t("settings.colPinfl")}</th>
              <th className="px-4 py-3">{t("settings.colStatus")}</th>
              <th className="px-4 py-3">{t("settings.colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">{t("calls.loading")}</td></tr>}
            {data?.map((u: SystemUser) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <button
                    onClick={() => setDetailsId(u.id)}
                    className="font-medium text-brand-800 transition hover:underline"
                  >
                    {u.fullName}
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-500">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => update.mutate({ id: u.id, payload: { role: e.target.value } })}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <PinflCell user={u} onSave={(pinfl) => update.mutate({ id: u.id, payload: { pinfl } })} />
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${u.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                    {u.isActive ? t("settings.active") : t("settings.blocked")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                  <button
                    title={t("settings.resetPassword")}
                    onClick={() => setResetTarget(u)}
                    className="rounded-lg p-2 text-brand-700 hover:bg-brand-50"
                  >
                    <KeyRound size={16} />
                  </button>
                  <button
                    title={u.isActive ? t("settings.block") : t("settings.activate")}
                    onClick={() => update.mutate({ id: u.id, payload: { isActive: !u.isActive } })}
                    className={`rounded-lg p-2 ${u.isActive ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                  >
                    {u.isActive ? <Ban size={16} /> : <Check size={16} />}
                  </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
      {resetTarget && <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />}
      {detailsId && <UserDetailsModal id={detailsId} onClose={() => setDetailsId(null)} />}
    </>
  );
}

/** JSHSHIR (14 raqam) - ERI kaliti shu raqam bo'yicha foydalanuvchiga bog'lanadi. Maydondan chiqqanda saqlanadi. */
function PinflCell({ user, onSave }: { user: SystemUser; onSave: (pinfl: string) => void }) {
  const { t } = useLanguage();
  const [value, setValue] = useState(user.pinfl ?? "");
  const valid = value === "" || /^\d{14}$/.test(value);
  return (
    <input
      value={value}
      inputMode="numeric"
      maxLength={14}
      placeholder="—"
      onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
      onBlur={() => { if (valid && value !== (user.pinfl ?? "")) onSave(value); }}
      className={`w-36 rounded-lg border px-2.5 py-1.5 font-mono text-xs ${valid ? "border-slate-200" : "border-rose-300 bg-rose-50"}`}
      title={valid ? t("settings.pinflHint") : t("settings.pinflInvalid")}
    />
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const roleLabel = useRoleLabel();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: "EMPLOYEE", pinfl: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => createUser({ ...form, pinfl: form.pinfl || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["settings"] }); onClose(); },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(". ") : typeof msg === "string" ? msg : t("settings.createFailed"));
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{t("settings.newUser")}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">{t("settings.colName")} *</span>
            <input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">{t("settings.colEmail")} *</span>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">{t("settings.password")} *</span>
            <input type="text" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder={t("settings.passwordMin")} className="input" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">{t("settings.pinflLabel")}</span>
            <input value={form.pinfl} inputMode="numeric" maxLength={14} onChange={(e) => set("pinfl", e.target.value.replace(/\D/g, ""))} placeholder={t("settings.pinflPlaceholder")} className="input font-mono" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">{t("settings.colRole")}</span>
            <select value={form.role} onChange={(e) => set("role", e.target.value)} className="input">
              {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </label>
          {form.role === "OPERATOR" && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {t("settings.operatorInfo")}
            </p>
          )}
          {form.role === "OBSERVER" && (
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              {t("settings.observerInfo")}
            </p>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm">{t("calls.cancel")}</button>
          <button
            disabled={mutation.isPending || !form.fullName || !form.email || form.password.length < 8 || (form.pinfl !== "" && form.pinfl.length !== 14)}
            onClick={() => mutation.mutate()}
            className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {t("settings.add")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Foydalanuvchi kartasi: tizim hisobi, kadrlar ma'lumoti va faoliyati. */
function UserDetailsModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, language } = useLanguage();
  const roleLabel = useRoleLabel();
  const locale = LOCALE_OF[language];
  const { data, isLoading } = useQuery({ queryKey: ["settings", "user", id], queryFn: () => fetchUserDetails(id) });
  const emp = data?.employeeCard;

  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString(locale) : "—");
  const money = (n?: number | null) =>
    n != null ? `${new Intl.NumberFormat("ru-RU").format(n)} ${t("calls.clients.currency")}` : "—";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {isLoading || !data ? (
          <p className="py-12 text-center text-slate-400">{t("calls.loading")}</p>
        ) : (
          <>
            {/* Sarlavha */}
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xl font-semibold text-brand-800">
                  {data.fullName.charAt(0)}
                </div>
                <div>
                  <h2 className="font-display text-xl font-semibold text-brand-950">{data.fullName}</h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {emp ? [emp.position, emp.departmentRef?.name ?? emp.department].filter(Boolean).join(" · ") : roleLabel(data.role)}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            {/* Tizim hisobi */}
            <Section title={t("settings.systemAccount")}>
              <Row icon={Mail} label={t("settings.colEmail")} value={data.email} />
              <Row icon={ShieldCheck} label={t("settings.colRole")} value={roleLabel(data.role)} />
              <Row icon={Check} label={t("settings.colStatus")} value={data.isActive ? t("settings.active") : t("settings.blocked")} />
              <Row icon={CalendarDays} label={t("settings.registered")} value={fmt(data.createdAt)} />
            </Section>

            {/* Kadrlar ma'lumoti */}
            {emp ? (
              <Section title={t("settings.hrInfo")}>
                <Row icon={Briefcase} label={t("settings.position")} value={emp.position} />
                <Row icon={Building2} label={t("settings.department")} value={emp.departmentRef?.name ?? emp.department ?? "—"} />
                <Row icon={Phone} label={t("calls.phone")} value={emp.phone ?? "—"} />
                <Row icon={CalendarDays} label={t("settings.hireDate")} value={fmt(emp.hireDate)} />
                {emp.birthDate && <Row icon={CalendarDays} label={t("settings.birthDate")} value={fmt(emp.birthDate)} />}
                {emp.passportSerial && (
                  <Row icon={IdCard} label={t("settings.passport")} value={`${emp.passportSerial}${emp.passportExpiry ? ` (${t("settings.until", { date: fmt(emp.passportExpiry) })})` : ""}`} />
                )}
                {emp.pinfl && <Row icon={IdCard} label={t("settings.colPinfl")} value={emp.pinfl} />}
                {emp.address && <Row icon={Building2} label={t("settings.address")} value={emp.address} />}
                {emp.contracts?.[0] && (
                  <Row
                    icon={FileText}
                    label={t("settings.contract")}
                    value={`№ ${emp.contracts[0].number} · ${money(emp.contracts[0].salary)}`}
                  />
                )}
              </Section>
            ) : (
              <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {t("settings.notLinked")}
              </div>
            )}

            {/* Faoliyati */}
            <Section title={t("settings.activity")}>
              <div className="grid grid-cols-3 gap-3">
                <Stat label={t("settings.lettersCreated")} value={data.activity.lettersCreated} />
                <Stat label={t("settings.approved")} value={data.activity.lettersApproved} />
                <Stat label={t("settings.documents")} value={data.activity.documentsOwned} />
              </div>
              {data.activity.lastAction && (
                <p className="mt-3 text-xs text-slate-400">
                  {t("settings.lastActivity", { date: new Date(data.activity.lastAction.createdAt).toLocaleString(locale) })}
                </p>
              )}
            </Section>

            {/* Ta'tillar */}
            {emp?.leaves?.length > 0 && (
              <Section title={t("settings.recentLeaves")}>
                <ul className="space-y-1.5 text-sm text-slate-600">
                  {emp.leaves.map((l: any) => (
                    <li key={l.id} className="flex justify-between">
                      <span>{fmt(l.startDate)} — {fmt(l.endDate)}</span>
                      <span className="text-slate-400">{t("settings.days", { n: l.days })}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <div className="mt-6 flex justify-end">
              <button onClick={onClose} className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white">{t("settings.close")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      <div className="space-y-2 rounded-xl border border-slate-200 p-4">{children}</div>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon size={15} className="shrink-0 text-slate-400" />
      <span className="w-40 shrink-0 text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-center">
      <p className="text-xl font-semibold text-brand-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

/**
 * Parolni tiklash oynasi.
 * Mavjud parolni ko'rsatib bo'lmaydi (u shifrlangan), shuning uchun bu yerda
 * yangi parol beriladi va u faqat shu safar ko'rinadi.
 */
function ResetPasswordModal({ user, onClose }: { user: SystemUser; onClose: () => void }) {
  const { t } = useLanguage();
  const [custom, setCustom] = useState("");
  const [result, setResult] = useState<{ password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => resetUserPassword(user.id, custom || undefined),
    onSuccess: (r) => setResult({ password: r.password }),
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(". ") : typeof msg === "string" ? msg : t("settings.resetFailed"));
    },
  });

  const copy = () => {
    if (!result) return;
    navigator.clipboard.writeText(`Login: ${user.email}\n${t("settings.password")}: ${result.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-brand-950">
              <KeyRound size={18} className="text-brand-700" /> {t("settings.resetPassword")}
            </h2>
            <p className="mt-1 text-xs text-slate-500">{user.fullName} — {user.email}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        {result ? (
          <>
            <div className="mb-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <Info size={16} className="mt-0.5 shrink-0" />
              <span>{t("settings.passwordShownOnce")}</span>
            </div>
            <div className="space-y-2 rounded-lg bg-slate-900 p-4 text-sm text-slate-100">
              <div><span className="text-slate-400">Login: </span>{user.email}</div>
              <div><span className="text-slate-400">{t("settings.password")}: </span><code className="text-base">{result.password}</code></div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={copy} className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm">
                {copied ? <Check size={15} /> : <Copy size={15} />} {t("settings.copy")}
              </button>
              <button onClick={onClose} className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white">{t("settings.close")}</button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 flex gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
              <Info size={15} className="mt-0.5 shrink-0" />
              <span>
                {t("settings.passwordHidden")}
              </span>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">{t("settings.newPassword")}</span>
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder={t("settings.newPasswordPlaceholder")}
                className="input"
              />
            </label>

            {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm">{t("calls.cancel")}</button>
              <button
                disabled={mutation.isPending || (custom.length > 0 && custom.length < 8)}
                onClick={() => { setError(null); mutation.mutate(); }}
                className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
              >
                {t("settings.reset")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ==================== RUXSATLAR ====================

function PermissionsTab() {
  const { t } = useLanguage();
  const roleLabel = useRoleLabel();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings", "permissions"], queryFn: fetchPermissions });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: setPermission,
    onSuccess: () => { setError(null); queryClient.invalidateQueries({ queryKey: ["settings", "permissions"] }); },
    onError: (e: any) => setError(e?.response?.data?.message ?? t("calls.saveFailed")),
  });

  if (isLoading) return <p className="text-slate-400">{t("calls.loading")}</p>;

  return (
    <>
      <p className="mb-4 text-sm text-slate-500">
        {t("settings.permissionsHelp")}
      </p>
      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">{t("settings.colModule")}</th>
              {data?.roles.map((r) => (
                <th key={r} className="px-4 py-3 text-center" colSpan={2}>{roleLabel(r)}</th>
              ))}
            </tr>
            <tr className="text-[11px] normal-case">
              <th />
              {data?.roles.map((r) => (
                <>
                  <th key={`${r}-v`} className="px-2 py-2 font-normal text-slate-400">{t("settings.view")}</th>
                  <th key={`${r}-e`} className="px-2 py-2 font-normal text-slate-400">{t("settings.edit")}</th>
                </>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.modules.filter((m: PermissionRow) => !IS_CALL_SITE || m.module === "calls").map((m: PermissionRow) => (
              <tr key={m.module} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{MODULE_KEYS[m.module] ? t(MODULE_KEYS[m.module]) : m.label}</td>
                {data.roles.map((role) => {
                  const perm = m.roles[role];
                  return (
                    <>
                      <td key={`${role}-view`} className="px-2 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={perm.canView}
                          onChange={(e) => save.mutate({ role, module: m.module, canView: e.target.checked, canEdit: e.target.checked ? perm.canEdit : false })}
                          className="h-4 w-4 cursor-pointer"
                        />
                      </td>
                      <td key={`${role}-edit`} className="px-2 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={perm.canEdit}
                          disabled={!perm.canView}
                          onChange={(e) => save.mutate({ role, module: m.module, canView: perm.canView, canEdit: e.target.checked })}
                          className="h-4 w-4 cursor-pointer disabled:opacity-30"
                        />
                      </td>
                    </>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
