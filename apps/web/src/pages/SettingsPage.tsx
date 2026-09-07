import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, ShieldCheck, Plus, X, Check, Ban, KeyRound, Copy, Info } from "lucide-react";
import { fetchPermissions, setPermission, fetchUsers, createUser, updateUser, resetUserPassword, type SystemUser, type PermissionRow } from "../api/settings";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrator",
  MANAGER: "Rahbariyat",
  EMPLOYEE: "Xodim",
};

export function SettingsPage() {
  const [tab, setTab] = useState<"users" | "permissions">("users");

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-display text-[30px] font-semibold tracking-tight text-brand-950">Sozlamalar</h1>
        <p className="mt-1 text-sm text-slate-500">Foydalanuvchilar, rollar va bo'limlarga ruxsatlar</p>
      </div>

      <div className="mb-5 flex gap-2">
        {[
          { key: "users" as const, label: "Foydalanuvchilar", icon: Users },
          { key: "permissions" as const, label: "Rollar va ruxsatlar", icon: ShieldCheck },
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

      {tab === "users" ? <UsersTab /> : <PermissionsTab />}
    </div>
  );
}

// ==================== FOYDALANUVCHILAR ====================

function UsersTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<SystemUser | null>(null);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings", "users"], queryFn: fetchUsers });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["settings"] });

  const [error, setError] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => updateUser(id, payload),
    onSuccess: () => { setError(null); invalidate(); },
    onError: (e: any) => setError(e?.response?.data?.message ?? "O'zgartirib bo'lmadi."),
  });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-800 px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-brand-700"
        >
          <Plus size={18} /> Yangi foydalanuvchi
        </button>
      </div>

      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">F.I.Sh.</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Roli</th>
              <th className="px-4 py-3">Holati</th>
              <th className="px-4 py-3">Amallar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Yuklanmoqda...</td></tr>}
            {data?.map((u: SystemUser) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{u.fullName}</td>
                <td className="px-4 py-3 text-slate-500">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => update.mutate({ id: u.id, payload: { role: e.target.value } })}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                  >
                    {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${u.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                    {u.isActive ? "Faol" : "Bloklangan"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                  <button
                    title="Parolni tiklash"
                    onClick={() => setResetTarget(u)}
                    className="rounded-lg p-2 text-brand-700 hover:bg-brand-50"
                  >
                    <KeyRound size={16} />
                  </button>
                  <button
                    title={u.isActive ? "Bloklash" : "Faollashtirish"}
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
    </>
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: "EMPLOYEE" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => createUser(form),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["settings"] }); onClose(); },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(". ") : typeof msg === "string" ? msg : "Qo'shib bo'lmadi. Ma'lumotlarni tekshiring.");
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Yangi foydalanuvchi</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">F.I.Sh. *</span>
            <input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Email *</span>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Parol *</span>
            <input type="text" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Kamida 8 ta belgi" className="input" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Roli</span>
            <select value={form.role} onChange={(e) => set("role", e.target.value)} className="input">
              {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>

        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm">Bekor qilish</button>
          <button
            disabled={mutation.isPending || !form.fullName || !form.email || form.password.length < 8}
            onClick={() => mutation.mutate()}
            className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            Qo'shish
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Parolni tiklash oynasi.
 * Mavjud parolni ko'rsatib bo'lmaydi (u shifrlangan), shuning uchun bu yerda
 * yangi parol beriladi va u faqat shu safar ko'rinadi.
 */
function ResetPasswordModal({ user, onClose }: { user: SystemUser; onClose: () => void }) {
  const [custom, setCustom] = useState("");
  const [result, setResult] = useState<{ password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => resetUserPassword(user.id, custom || undefined),
    onSuccess: (r) => setResult({ password: r.password }),
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(". ") : typeof msg === "string" ? msg : "Tiklab bo'lmadi.");
    },
  });

  const copy = () => {
    if (!result) return;
    navigator.clipboard.writeText(`Login: ${user.email}\nParol: ${result.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-brand-950">
              <KeyRound size={18} className="text-brand-700" /> Parolni tiklash
            </h2>
            <p className="mt-1 text-xs text-slate-500">{user.fullName} — {user.email}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        {result ? (
          <>
            <div className="mb-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <Info size={16} className="mt-0.5 shrink-0" />
              <span>Bu parol faqat hozir ko'rsatiladi. Nusxa olib, xodimga yetkazing.</span>
            </div>
            <div className="space-y-2 rounded-lg bg-slate-900 p-4 text-sm text-slate-100">
              <div><span className="text-slate-400">Login: </span>{user.email}</div>
              <div><span className="text-slate-400">Parol: </span><code className="text-base">{result.password}</code></div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={copy} className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm">
                {copied ? <Check size={15} /> : <Copy size={15} />} Nusxa olish
              </button>
              <button onClick={onClose} className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white">Yopish</button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 flex gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
              <Info size={15} className="mt-0.5 shrink-0" />
              <span>
                Mavjud parolni ko'rsatib bo'lmaydi — u shifrlangan holda saqlanadi va uni hech kim
                (jumladan administrator ham) o'qiy olmaydi. Buning o'rniga yangi parol beriladi.
              </span>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Yangi parol</span>
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Bo'sh qoldirilsa - tizim o'zi yaratadi"
                className="input"
              />
            </label>

            {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm">Bekor qilish</button>
              <button
                disabled={mutation.isPending || (custom.length > 0 && custom.length < 8)}
                onClick={() => { setError(null); mutation.mutate(); }}
                className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
              >
                Tiklash
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
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings", "permissions"], queryFn: fetchPermissions });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: setPermission,
    onSuccess: () => { setError(null); queryClient.invalidateQueries({ queryKey: ["settings", "permissions"] }); },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Saqlab bo'lmadi."),
  });

  if (isLoading) return <p className="text-slate-400">Yuklanmoqda...</p>;

  return (
    <>
      <p className="mb-4 text-sm text-slate-500">
        Har bir rol qaysi bo'limni ko'rishi va o'zgartirishi mumkinligini belgilang. O'zgarish darhol kuchga kiradi.
      </p>
      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Bo'lim</th>
              {data?.roles.map((r) => (
                <th key={r} className="px-4 py-3 text-center" colSpan={2}>{ROLE_LABELS[r] ?? r}</th>
              ))}
            </tr>
            <tr className="text-[11px] normal-case">
              <th />
              {data?.roles.map((r) => (
                <>
                  <th key={`${r}-v`} className="px-2 py-2 font-normal text-slate-400">ko'rish</th>
                  <th key={`${r}-e`} className="px-2 py-2 font-normal text-slate-400">o'zgartirish</th>
                </>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.modules.map((m: PermissionRow) => (
              <tr key={m.module} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{m.label}</td>
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
