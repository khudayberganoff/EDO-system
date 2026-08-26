import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Plus, RefreshCw, Trash2, X, Paperclip, Mail, Plug, CheckCircle2, AlertCircle, Download, FileDown } from "lucide-react";
import {
  fetchMailAccounts, createMailAccount, deleteMailAccount, testMailAccount, syncMailAccount,
  fetchInbox, markMailRead, deleteMail, fetchFullMail, downloadAttachment,
  type MailAccount, type IncomingMail, type MailAttachment,
} from "../api/mail";
import { useAuth } from "../context/AuthContext";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("uz-UZ") : "—");

/**
 * Mashhur pochta xizmatlari uchun tayyor IMAP sozlamalari.
 * Ko'pchilik xizmatlar oddiy parolni qabul qilmaydi - alohida "ilova paroli"
 * yaratish kerak, shuning uchun har biriga qisqacha yo'riqnoma berilgan.
 */
interface Provider {
  id: string;
  label: string;
  host: string;
  port: number;
  domains: string[];
  /** Parol qanday olinishi haqida qisqacha izoh */
  note: string;
  helpUrl?: string;
}

const PROVIDERS: Provider[] = [
  {
    id: "gmail", label: "Gmail / Google Workspace", host: "imap.gmail.com", port: 993,
    domains: ["gmail.com", "googlemail.com"],
    note: "Oddiy Google paroli ISHLAMAYDI. 1) Hisobingizda 2 bosqichli tasdiqlashni yoqing. 2) \"Ilova parollari\" (App passwords) bo'limidan 16 belgili parol yarating. 3) Shu parolni bu yerga kiriting (bo'shliqlarni tizim o'zi olib tashlaydi). 4) Gmail sozlamalarida IMAP yoqilganini tekshiring.",
    helpUrl: "https://myaccount.google.com/apppasswords",
  },
  {
    id: "yahoo", label: "Yahoo Mail", host: "imap.mail.yahoo.com", port: 993,
    domains: ["yahoo.com", "ymail.com", "rocketmail.com"],
    note: "Yahoo hisobi sozlamalarida \"Generate app password\" orqali maxsus parol yarating.",
    helpUrl: "https://login.yahoo.com/account/security",
  },
  {
    id: "outlook", label: "Outlook / Hotmail / Office 365", host: "outlook.office365.com", port: 993,
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
    note: "Microsoft hisobida 2 bosqichli tasdiqlash yoqilgan bo'lsa, \"App passwords\" bo'limidan parol yarating.",
    helpUrl: "https://account.microsoft.com/security",
  },
  {
    id: "mailru", label: "Mail.ru", host: "imap.mail.ru", port: 993,
    domains: ["mail.ru", "inbox.ru", "bk.ru", "list.ru", "internet.ru"],
    note: "Mail.ru sozlamalarida \"Пароли для внешних приложений\" bo'limidan alohida parol yarating.",
    helpUrl: "https://account.mail.ru/user/2-step-auth/passwords",
  },
  {
    id: "yandex", label: "Yandex Mail", host: "imap.yandex.ru", port: 993,
    domains: ["yandex.ru", "yandex.com", "ya.ru", "yandex.uz"],
    note: "Yandex sozlamalarida IMAP yoqilgan bo'lishi va \"Пароли приложений\" orqali parol yaratilishi kerak.",
    helpUrl: "https://id.yandex.ru/security/app-passwords",
  },
  {
    id: "umail", label: "Umail.uz", host: "imap.umail.uz", port: 993,
    domains: ["umail.uz"],
    note: "Pochta qutingiz paroli bilan ulanadi. IMAP yoqilganini tekshiring.",
  },
  {
    id: "custom", label: "Boshqa (qo'lda kiritish)", host: "", port: 993, domains: [],
    note: "Korporativ pochta serveringiz IMAP manzilini va portini administratordan so'rang.",
  },
];

const findProviderByEmail = (email: string): Provider | undefined => {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return undefined;
  return PROVIDERS.find((p) => p.domains.includes(domain));
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
  // Xat ochilganda to'liq matn va ilovalar pochtadan yuklanadi
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["mail", "full", mail.id],
    queryFn: () => fetchFullMail(mail.id),
    retry: false,
  });
  const full = data ?? mail;
  const [showHtml, setShowHtml] = useState(true);

  const download = async (att: MailAttachment) => {
    try {
      const blob = await downloadAttachment(att.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { alert("Faylni yuklab bo'lmadi."); }
  };

  const sizeText = (bytes: number) =>
    bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{full.subject}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {full.fromName ? `${full.fromName} · ` : ""}{full.fromEmail} · {fmt(full.receivedAt)}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        {/* Ilovalar */}
        {full.attachments && full.attachments.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <Paperclip size={13} /> Biriktirilgan fayllar ({full.attachments.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {full.attachments.map((att) => (
                <button
                  key={att.id}
                  onClick={() => download(att)}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 transition hover:border-brand-300 hover:bg-white"
                >
                  <FileDown size={14} className="text-brand-700" />
                  <span className="max-w-[220px] truncate">{att.filename}</span>
                  <span className="text-slate-400">{sizeText(att.size)}</span>
                  <Download size={12} className="text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Matn */}
        {isLoading && <p className="py-8 text-center text-sm text-slate-400">Xat matni yuklanmoqda...</p>}
        {isError && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {(error as any)?.response?.data?.message ?? "Xat matnini yuklab bo'lmadi."}
          </p>
        )}
        {!isLoading && !isError && (
          <>
            {full.bodyHtml && (
              <div className="mb-2 flex gap-2 text-xs">
                <button onClick={() => setShowHtml(true)} className={`rounded-full px-3 py-1 ${showHtml ? "bg-brand-800 text-white" : "text-slate-500 hover:bg-slate-100"}`}>Ko'rinishi</button>
                <button onClick={() => setShowHtml(false)} className={`rounded-full px-3 py-1 ${!showHtml ? "bg-brand-800 text-white" : "text-slate-500 hover:bg-slate-100"}`}>Oddiy matn</button>
              </div>
            )}
            {full.bodyHtml && showHtml ? (
              // Tashqi xat HTML si - alohida ramkada, sayt uslubiga ta'sir qilmaydi
              <iframe
                title="Xat matni"
                sandbox=""
                srcDoc={full.bodyHtml}
                className="h-[420px] w-full rounded-lg border border-slate-200 bg-white"
              />
            ) : (
              <div className="whitespace-pre-wrap rounded-lg border border-slate-100 p-4 text-sm leading-relaxed text-slate-800">
                {full.body || "Xat matni bo'sh."}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AccountsModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: accounts } = useQuery({ queryKey: ["mail", "accounts"], queryFn: fetchMailAccounts });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["mail"] });

  const [providerId, setProviderId] = useState("gmail");
  const provider = PROVIDERS.find((p) => p.id === providerId) ?? PROVIDERS[0];
  const [form, setForm] = useState({
    name: "", email: "", imapHost: PROVIDERS[0].host, imapPort: String(PROVIDERS[0].port),
    username: "", password: "", useSsl: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const selectProvider = (id: string) => {
    const p = PROVIDERS.find((x) => x.id === id);
    setProviderId(id);
    if (p && p.id !== "custom") {
      setForm((f) => ({ ...f, imapHost: p.host, imapPort: String(p.port) }));
    }
  };

  // Email kiritilganda xizmat va IMAP manzili avtomatik aniqlanadi
  const onEmailChange = (email: string) => {
    const detected = findProviderByEmail(email);
    if (detected && detected.id !== providerId) setProviderId(detected.id);
    setForm((f) => ({
      ...f,
      email,
      username: f.username || email,
      imapHost: detected ? detected.host : f.imapHost,
      imapPort: detected ? String(detected.port) : f.imapPort,
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
          {/* Pochta xizmatini tanlash - sozlamalar avtomatik to'ldiriladi */}
          <div className="mb-4">
            <span className="mb-2 block text-sm font-medium text-slate-700">Pochta xizmati</span>
            <div className="flex flex-wrap gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectProvider(p.id)}
                  className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                    providerId === p.id ? "bg-brand-800 text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100"
                  } border border-slate-200`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Nomi *"><input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Kotibiyat pochtasi" className="input" /></Field>
            <Field label="Email *"><input value={form.email} onChange={(e) => onEmailChange(e.target.value)} placeholder="info@wafagroup.uz" className="input" /></Field>
            <Field label="IMAP server *">
              <input
                value={form.imapHost}
                onChange={(e) => set("imapHost", e.target.value)}
                readOnly={providerId !== "custom"}
                placeholder="imap.example.com"
                className={`input ${providerId !== "custom" ? "bg-slate-100 text-slate-500" : ""}`}
              />
            </Field>
            <Field label="Port">
              <input
                value={form.imapPort}
                onChange={(e) => set("imapPort", e.target.value.replace(/\D/g, ""))}
                readOnly={providerId !== "custom"}
                className={`input ${providerId !== "custom" ? "bg-slate-100 text-slate-500" : ""}`}
              />
            </Field>
            <Field label="Login *"><input value={form.username} onChange={(e) => set("username", e.target.value)} className="input" /></Field>
            <Field label={providerId === "custom" ? "Parol *" : "Ilova paroli *"}>
              <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder={providerId === "gmail" ? "abcd efgh ijkl mnop" : ""} className="input" />
            </Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.useSsl} onChange={(e) => set("useSsl", e.target.checked)} className="h-4 w-4" />
            SSL/TLS orqali ulanish (tavsiya etiladi)
          </label>
          <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
            <p className="font-medium">{provider.label} uchun:</p>
            <p className="mt-1">{provider.note}</p>
            {provider.helpUrl && (
              <a href={provider.helpUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-block font-medium underline">
                Parol yaratish sahifasi →
              </a>
            )}
          </div>
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
