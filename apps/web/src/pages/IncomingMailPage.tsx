import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Plus, RefreshCw, Trash2, X, Paperclip, Mail, Plug, CheckCircle2, AlertCircle } from "lucide-react";
import {
  fetchMailAccounts, createMailAccount, deleteMailAccount, testMailAccount, syncMailAccount,
  fetchInbox, markMailRead, deleteMail, type MailAccount, type IncomingMail,
} from "../api/mail";
import { useAuth } from "../context/AuthContext";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("uz-UZ") : "—");

/** Mashhur pochta xizmatlari uchun tayyor IMAP sozlamalari. */
const PRESETS: Record<string, { host: string; port: number }> = {
  "gmail.com": { host: "imap.gmail.com", port: 993 },
  "mail.ru": { host: "imap.mail.ru", port: 993 },
  "yandex.ru": { host: "imap.yandex.ru", port: 993 },
  "umail.uz": { host: "imap.umail.uz", port: 993 },
};

export function IncomingMailPage() {
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [showAccounts, setShowAccounts] = useState(false);
  const [selected, setSelected] = useState<IncomingMail | null>(null);
  const queryClient = useQueryClient();

  const { data: accounts } = useQuery({ queryKey: ["mail", "accounts"], queryFn: fetchMailAccounts });
  const { data: mails, isLoading } = useQuery({ queryKey: ["mail", "inbox"], queryFn: () => fetchInbox() });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["mail"] });

  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const sync = useMutation({
    mutationFn: syncMailAccount,
    onSuccess: (r) => { setSyncMsg(`${r.imported} ta yangi xat yuklandi.`); invalidate(); },
    onError: (e: any) => setSyncMsg(e?.response?.data?.message ?? "Xatlarni olib bo'lmadi."),
  });
  const remove = useMutation({ mutationFn: deleteMail, onSuccess: invalidate });
  const read = useMutation({ mutationFn: ({ id, v }: { id: string; v: boolean }) => markMailRead(id, v), onSuccess: invalidate });

  const activeAccount = accounts?.find((a) => a.isActive);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Kiruvchi xatlar</h1>
          <p className="mt-1 text-sm text-slate-500">Tashqi pochta orqali kelib tushgan xatlar</p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <button
              onClick={() => setShowAccounts(true)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Plug size={16} /> Pochta ulash
            </button>
          )}
          {canManage && activeAccount && (
            <button
              disabled={sync.isPending}
              onClick={() => { setSyncMsg(null); sync.mutate(activeAccount.id); }}
              className="flex items-center gap-2 rounded-lg bg-brand-800 px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
            >
              <RefreshCw size={18} className={sync.isPending ? "animate-spin" : ""} />
              {sync.isPending ? "Yuklanmoqda..." : "Yangilash"}
            </button>
          )}
        </div>
      </div>

      {syncMsg && <p className="mb-4 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">{syncMsg}</p>}

      {!accounts?.length && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Hali birorta pochta qutisi ulanmagan. Kiruvchi xatlar avtomatik kelishi uchun
          {canManage ? ' "Pochta ulash" tugmasi orqali IMAP sozlamalarini kiriting.' : " kadrlar/rahbariyatga murojaat qiling."}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Kimdan</th>
              <th className="px-4 py-3">Mavzusi</th>
              <th className="px-4 py-3">Pochta</th>
              <th className="px-4 py-3">Kelgan vaqti</th>
              <th className="px-4 py-3">Amallar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Yuklanmoqda...</td></tr>}
            {!isLoading && mails?.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Kiruvchi xatlar yo'q.</td></tr>
            )}
            {mails?.map((m) => (
              <tr key={m.id} className={`cursor-pointer hover:bg-slate-50 ${m.isRead ? "" : "bg-sky-50/40"}`} onClick={() => { setSelected(m); if (!m.isRead) read.mutate({ id: m.id, v: true }); }}>
                <td className="px-4 py-3">
                  <div className={`${m.isRead ? "text-slate-700" : "font-semibold text-slate-900"}`}>{m.fromName || m.fromEmail}</div>
                  {m.fromName && <div className="text-xs text-slate-400">{m.fromEmail}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className={m.isRead ? "text-slate-600" : "font-medium text-slate-900"}>{m.subject}</span>
                  {m.hasAttachments && <Paperclip size={13} className="ml-1.5 inline text-slate-400" />}
                </td>
                <td className="px-4 py-3 text-slate-500">{m.account?.name ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{fmt(m.receivedAt)}</td>
                <td className="px-4 py-3">
                  {canManage && (
                    <button
                      onClick={(e) => { e.stopPropagation(); remove.mutate(m.id); }}
                      className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAccounts && <AccountsModal onClose={() => setShowAccounts(false)} />}
      {selected && <MailModal mail={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function MailModal({ mail, onClose }: { mail: IncomingMail; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{mail.subject}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {mail.fromName ? `${mail.fromName} · ` : ""}{mail.fromEmail} · {fmt(mail.receivedAt)}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="whitespace-pre-wrap rounded-lg border border-slate-100 p-4 text-sm leading-relaxed text-slate-800">
          {mail.body || "Xat matni yuklanmagan. To'liq matnni pochta qutisidan ko'ring."}
        </div>
        {mail.hasAttachments && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
            <Paperclip size={13} /> Xatda ilova fayllar bor — ularni pochta qutisidan yuklab oling.
          </p>
        )}
      </div>
    </div>
  );
}

function AccountsModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: accounts } = useQuery({ queryKey: ["mail", "accounts"], queryFn: fetchMailAccounts });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["mail"] });

  const [form, setForm] = useState({ name: "", email: "", imapHost: "", imapPort: "993", username: "", password: "", useSsl: true });
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  // Email kiritilganda IMAP manzilini avtomatik taklif qilamiz
  const onEmailChange = (email: string) => {
    const domain = email.split("@")[1]?.toLowerCase();
    const preset = domain ? PRESETS[domain] : undefined;
    setForm((f) => ({
      ...f,
      email,
      username: f.username || email,
      imapHost: preset ? preset.host : f.imapHost,
      imapPort: preset ? String(preset.port) : f.imapPort,
    }));
  };

  const create = useMutation({
    mutationFn: () => createMailAccount({ ...form, imapPort: Number(form.imapPort) }),
    onSuccess: () => { setForm({ name: "", email: "", imapHost: "", imapPort: "993", username: "", password: "", useSsl: true }); invalidate(); },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Saqlab bo'lmadi."),
  });
  const remove = useMutation({ mutationFn: deleteMailAccount, onSuccess: invalidate });
  const test = useMutation({
    mutationFn: testMailAccount,
    onSuccess: (r, id) => setTestResult((prev) => ({ ...prev, [id]: r })),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Inbox size={18} className="text-brand-700" /> Pochta qutilari
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        {/* Mavjud qutilar */}
        {accounts?.length ? (
          <div className="mb-6 space-y-2">
            {accounts.map((a: MailAccount) => (
              <div key={a.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <Mail size={14} className="text-slate-400" /> {a.name}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {a.email} · {a.imapHost}:{a.imapPort} · {a._count?.mails ?? 0} ta xat
                    </div>
                    <div className="text-xs text-slate-400">Oxirgi yangilanish: {fmt(a.lastSyncAt)}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => test.mutate(a.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                      Tekshirish
                    </button>
                    <button onClick={() => remove.mutate(a.id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                {(testResult[a.id] || a.lastError) && (
                  <p className={`mt-2 flex items-center gap-1.5 text-xs ${testResult[a.id]?.ok ? "text-emerald-700" : "text-rose-600"}`}>
                    {testResult[a.id]?.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                    {testResult[a.id]?.message ?? a.lastError}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {/* Yangi quti */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Plus size={15} /> Yangi pochta qutisi
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nomi *"><input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Kotibiyat pochtasi" className="input" /></Field>
            <Field label="Email *"><input value={form.email} onChange={(e) => onEmailChange(e.target.value)} placeholder="info@wafagroup.uz" className="input" /></Field>
            <Field label="IMAP server *"><input value={form.imapHost} onChange={(e) => set("imapHost", e.target.value)} placeholder="imap.gmail.com" className="input" /></Field>
            <Field label="Port"><input value={form.imapPort} onChange={(e) => set("imapPort", e.target.value.replace(/\D/g, ""))} className="input" /></Field>
            <Field label="Login *"><input value={form.username} onChange={(e) => set("username", e.target.value)} className="input" /></Field>
            <Field label="Parol *"><input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} className="input" /></Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.useSsl} onChange={(e) => set("useSsl", e.target.checked)} className="h-4 w-4" />
            SSL/TLS orqali ulanish (tavsiya etiladi)
          </label>
          <p className="mt-2 text-xs text-slate-400">
            Gmail va Yandex uchun oddiy parol emas, "ilova paroli" (app password) kerak bo'ladi.
          </p>
          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
          <div className="mt-4 flex justify-end">
            <button
              disabled={create.isPending || !form.name || !form.email || !form.imapHost || !form.username || !form.password}
              onClick={() => { setError(null); create.mutate(); }}
              className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              Ulash
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>{children}</label>;
}
