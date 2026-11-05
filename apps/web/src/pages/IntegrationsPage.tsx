import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Trash2, Ban, Copy, Check, X, Send, ShieldCheck, PhoneCall as PhoneIcon, RefreshCw } from "lucide-react";
import { fetchApiKeys, createApiKey, revokeApiKey, deleteApiKey, type ApiKeyItem } from "../api/api-keys";
import { fetchTelegramConfig, saveTelegramToken, removeTelegramToken } from "../api/telegram";
import { fetchEimzoSettings, saveEimzoSettings, removeEimzoSettings } from "../api/auth";
import { fetchTelephonySettings, saveTelephonySettings, regenerateTelephonyToken } from "../api/calls";
import { useAuth } from "../context/AuthContext";

const SCOPES = [
  { value: "hr", label: "Kadrlar (xodimlar, buyruqlar, davomat...)" },
  { value: "letters", label: "Xatlar va ogohlantirishlar" },
  { value: "documents", label: "Hujjatlar" },
];

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("uz-UZ") : "—");

/**
 * Tashqi tizimlarni ulash sahifasi: API kalitlarni yaratish va bekor qilish,
 * hamda ulanish bo'yicha qisqacha qo'llanma.
 */
export function IntegrationsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["api-keys"], queryFn: fetchApiKeys });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["api-keys"] });
  const revoke = useMutation({ mutationFn: revokeApiKey, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: deleteApiKey, onSuccess: invalidate });

  const baseUrl = `${window.location.origin}/api/public/v1`;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-tight text-brand-950">Tashqi tizimlar (API)</h1>
          <p className="mt-1 text-sm text-slate-500">
            Boshqa saytlar shu kalitlar orqali tizim ma'lumotlarini o'z sahifalarida ko'rsatishi mumkin.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-800 px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-brand-700"
        >
          <Plus size={18} /> Yangi kalit
        </button>
      </div>

      <TelegramBotCard />
      <EimzoCard />
      <TelephonyCard />

      {/* Qisqacha qo'llanma */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Qanday ulanadi</h2>
        <p className="mb-3 text-sm text-slate-600">
          Har bir so'rovga <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">X-API-Key</code> sarlavhasini qo'shing:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
{`fetch("${baseUrl}/hr/employees", {
  headers: { "X-API-Key": "edo_live_..." }
})
  .then(r => r.json())
  .then(xodimlar => console.log(xodimlar));`}
        </pre>
        <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "GET /hr/employees", "GET /hr/departments", "GET /hr/positions",
            "GET /hr/orders", "GET /hr/contracts", "GET /hr/leaves",
            "GET /hr/attendance?year=&month=", "GET /hr/holidays", "GET /hr/gratitudes",
            "GET /letters", "GET /letters/:id/text", "GET /documents",
          ].map((ep) => (
            <code key={ep} className="rounded bg-slate-50 px-2 py-1.5">{ep}</code>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          To'liq hujjat: <code className="rounded bg-slate-100 px-1">/api/docs</code>
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Nomi</th>
              <th className="px-4 py-3">Kalit</th>
              <th className="px-4 py-3">Ruxsatlar</th>
              <th className="px-4 py-3">Holati</th>
              <th className="px-4 py-3">Oxirgi ishlatilgan</th>
              <th className="px-4 py-3">Amallar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Yuklanmoqda...</td></tr>}
            {!isLoading && data?.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Hali kalit yaratilmagan.</td></tr>
            )}
            {data?.map((k: ApiKeyItem) => (
              <tr key={k.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{k.name}</div>
                  <div className="text-xs text-slate-400">{k.createdBy ?? "—"} · {fmt(k.createdAt)}</div>
                </td>
                <td className="px-4 py-3"><code className="rounded bg-slate-100 px-2 py-1 text-xs">{k.maskedKey}</code></td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {k.scopes.map((s) => (
                      <span key={s} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-800">{s}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${k.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                    {k.isActive ? "Faol" : "Bekor qilingan"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{fmt(k.lastUsedAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {k.isActive && (
                      <button title="Bekor qilish" onClick={() => revoke.mutate(k.id)} className="rounded-lg p-2 text-amber-600 hover:bg-amber-50">
                        <Ban size={16} />
                      </button>
                    )}
                    <button title="O'chirish" onClick={() => remove.mutate(k.id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateKeyModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateKeyModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["hr", "letters", "documents"]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: () => createApiKey({ name, scopes }),
    onSuccess: (res) => {
      setCreatedKey(res.key);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const toggle = (s: string) =>
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const copy = () => {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <KeyRound size={18} className="text-brand-700" /> {createdKey ? "Kalit yaratildi" : "Yangi API kalit"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        {createdKey ? (
          <>
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Bu kalit faqat hozir ko'rsatiladi. Nusxa olib, xavfsiz joyda saqlang — keyin uni tiklab bo'lmaydi.
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg bg-slate-900 px-3 py-3 text-xs text-slate-100">{createdKey}</code>
              <button onClick={copy} className="rounded-lg bg-brand-800 p-3 text-white transition hover:bg-brand-700">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={onClose} className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white">Yopish</button>
            </div>
          </>
        ) : (
          <>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Kalit nomi *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Korporativ sayt" className="input" />
            </label>

            <div className="mt-4">
              <span className="mb-2 block text-sm font-medium text-slate-700">Ruxsat etilgan bo'limlar</span>
              <div className="space-y-2">
                {SCOPES.map((s) => (
                  <label key={s.value} className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
                    <input type="checkbox" checked={scopes.includes(s.value)} onChange={() => toggle(s.value)} className="h-4 w-4" />
                    <span className="text-slate-700">{s.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm">Bekor qilish</button>
              <button
                disabled={mutation.isPending || !name.trim() || scopes.length === 0}
                onClick={() => mutation.mutate()}
                className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
              >
                Yaratish
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Telegram bot sozlamasi (faqat administrator): BotFather bergan tokenni kiritish.
 * Token tekshiriladi, bazada shifrlangan holda saqlanadi va hech qachon qayta ko'rsatilmaydi.
 */
function TelegramBotCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "ADMIN";
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["telegram", "config"], queryFn: fetchTelegramConfig, enabled: isAdmin });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["telegram"] }); };
  const save = useMutation({
    mutationFn: () => saveTelegramToken(token.trim()),
    onSuccess: () => { setToken(""); setError(null); refresh(); },
    onError: (e: any) => {
      const m = e?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(". ") : typeof m === "string" ? m : "Saqlab bo'lmadi.");
    },
  });
  const remove = useMutation({ mutationFn: removeTelegramToken, onSuccess: refresh });
  if (!isAdmin) return null;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Send size={16} className="text-sky-600" /> Telegram bot (vazifalar doskasi)</h2>
        {data?.configured && (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
            Ulangan{data.botUsername ? ` · @${data.botUsername}` : ""}
          </span>
        )}
      </div>

      {data?.configured ? (
        <div className="space-y-2 text-sm text-slate-600">
          <p>Xodimlar Telegram orqali vazifa qo'sha oladi: <b>Vazifalar doskasi → Telegram</b> tugmasi orqali hisobini ulaydi. Ulangan xodimlar: <b>{data.linkedUsers}</b>.</p>
          <p className="text-xs text-slate-500">
            Webhook: {data.webhook?.url ? <code className="rounded bg-slate-100 px-1.5 py-0.5">{data.webhook.url}</code> : <span className="text-amber-700">ulanmagan (PUBLIC_APP_URL https:// bilan boshlanishi kerak: {data.publicUrl})</span>}
            {data.webhook && data.webhook.pending > 0 && <> · kutilayotgan: {data.webhook.pending}</>}
          </p>
          {data.webhook?.lastError && <p className="text-xs text-rose-600">Telegram xatosi: {data.webhook.lastError}</p>}
          {data.source === "db" ? (
            <button onClick={() => window.confirm("Telegram bot uzilsinmi? Token o'chiriladi.") && remove.mutate()} className="text-xs font-medium text-rose-600 hover:text-rose-700">Botni uzish (tokenni o'chirish)</button>
          ) : (
            <p className="text-xs text-slate-400">Token server sozlamasida (TELEGRAM_BOT_TOKEN) berilgan.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3 text-sm text-slate-600">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Telegram'da <b>@BotFather</b> ni oching → <code className="rounded bg-slate-100 px-1">/newbot</code> → bot nomini kiriting.</li>
            <li>BotFather bergan <b>tokenni</b> pastga qo'ying va "Ulash"ni bosing.</li>
            <li>(Guruhda ishlatmoqchi bo'lsangiz) botni guruhga qo'shing.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <input
              type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)}
              placeholder="123456789:AAH..." className="input max-w-md flex-1"
            />
            <button
              onClick={() => save.mutate()} disabled={!token.trim() || save.isPending}
              className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {save.isPending ? "Tekshirilmoqda..." : "Ulash"}
            </button>
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <p className="text-xs text-slate-400">Token maxfiy: u shifrlanib saqlanadi va qayta ko'rsatilmaydi. Tokenni boshqalarga yubormang.</p>
        </div>
      )}
    </div>
  );
}

/**
 * ERI (E-IMZO) orqali kirish sozlamasi (faqat administrator). Server manzili, sayt domeni va NIC NT bergan API-KEY.
 * Saqlashdan oldin e-imzo-server javob berishi tekshiriladi.
 */
function EimzoCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "ADMIN";
  const { data } = useQuery({ queryKey: ["eimzo", "settings"], queryFn: fetchEimzoSettings, enabled: isAdmin });
  const [form, setForm] = useState({ serverUrl: "", domain: window.location.hostname, apiKey: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const refresh = () => { qc.invalidateQueries({ queryKey: ["eimzo"] }); };
  const save = useMutation({
    mutationFn: () => saveEimzoSettings({ serverUrl: form.serverUrl.trim(), domain: form.domain.trim(), apiKey: form.apiKey.trim() }),
    onSuccess: () => { setError(null); setForm((f) => ({ ...f, apiKey: "" })); refresh(); },
    onError: (e: any) => {
      const m = e?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(". ") : typeof m === "string" ? m : "Saqlab bo'lmadi.");
    },
  });
  const remove = useMutation({ mutationFn: removeEimzoSettings, onSuccess: refresh });
  if (!isAdmin) return null;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><ShieldCheck size={16} className="text-brand-700" /> ERI (E-IMZO) orqali kirish</h2>
        {data?.configured && <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">Yoqilgan</span>}
      </div>

      {data?.configured ? (
        <div className="space-y-2 text-sm text-slate-600">
          <p>Kirish sahifasida <b>«ERI (E-IMZO) orqali kirish»</b> tugmasi ko'rinadi. Foydalanuvchi ERI kaliti JSHSHIR'i bo'yicha topiladi: <b>Sozlamalar → Foydalanuvchilar</b> jadvalidagi «JSHSHIR (ERI)» ustuniga kiriting (yoki kadrlar kartochkasidagi JSHSHIR ishlatiladi).</p>
          <p className="text-xs text-slate-500">Server: <code className="rounded bg-slate-100 px-1.5 py-0.5">{data.serverUrl}</code> · Domen: <code className="rounded bg-slate-100 px-1.5 py-0.5">{data.domain}</code></p>
          {data.source === "db" ? (
            <button onClick={() => window.confirm("ERI orqali kirish o'chirilsinmi?") && remove.mutate()} className="text-xs font-medium text-rose-600 hover:text-rose-700">O'chirish</button>
          ) : (
            <p className="text-xs text-slate-400">Sozlama server o'zgaruvchilarida (EIMZO_*) berilgan.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3 text-sm text-slate-600">
          <ol className="list-decimal space-y-1 pl-5">
            <li><b>e-imzo-server</b> ni o'rnating (E-IMZO bilan shartnoma asosida beriladi, VPN orqali sertifikat holatini tekshiradi) — <code className="rounded bg-slate-100 px-1">docs/ERI-E-IMZO.md</code>.</li>
            <li>Sayt domeni (<b>{window.location.hostname}</b>) uchun <b>API-KEY</b> oling. E-IMZO 6 da yoki «Developer mode» da kalit shart emas — bo'sh qoldirish mumkin.</li>
            <li>Foydalanuvchilarga JSHSHIR kiriting, ular kompyuterida <b>E-IMZO</b> dasturi o'rnatilgan bo'lsin.</li>
          </ol>
          <div className="grid gap-2 md:grid-cols-3">
            <input value={form.serverUrl} onChange={(e) => set("serverUrl", e.target.value)} placeholder="e-imzo-server: http://127.0.0.1:8080" className="input" />
            <input value={form.domain} onChange={(e) => set("domain", e.target.value)} placeholder="Domen: edo.wafagroup.uz" className="input" />
            <input value={form.apiKey} onChange={(e) => set("apiKey", e.target.value)} placeholder="API-KEY (ixtiyoriy)" className="input font-mono" />
          </div>
          <button
            onClick={() => save.mutate()} disabled={!form.serverUrl.trim() || !form.domain.trim() || save.isPending}
            className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {save.isPending ? "Tekshirilmoqda..." : "Tekshirib yoqish"}
          </button>
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * IP-telefoniya (ATS): har bir qo'ng'iroq shu manzilga yuboriladi va bazaga yoziladi (Call-markaz → Qo'ng'iroqlar).
 * Manzil maxfiy token bilan himoyalangan; ATS GET yoki POST (JSON / form) yuborishi mumkin.
 */
function TelephonyCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "ADMIN";
  const { data } = useQuery({ queryKey: ["telephony", "settings"], queryFn: fetchTelephonySettings, enabled: isAdmin, refetchInterval: 20_000 });
  const [copied, setCopied] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["telephony"] });
  const save = useMutation({ mutationFn: saveTelephonySettings, onSuccess: refresh });
  const regen = useMutation({ mutationFn: regenerateTelephonyToken, onSuccess: refresh });
  if (!isAdmin || !data) return null;

  const url = `${window.location.origin}/api/telephony/webhook?token=${data.token}`;
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* brauzer ruxsat bermasa - qo'lda nusxalanadi */ } };

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><PhoneIcon size={16} className="text-emerald-600" /> IP-telefoniya (ATS) qo'ng'iroqlari</h2>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${data.last24h > 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
          {data.last24h > 0 ? `Ishlayapti · 24 soatda ${data.last24h} ta` : "Hali qo'ng'iroq kelmagan"}
        </span>
      </div>
      <div className="space-y-3 text-sm text-slate-600">
        <p>ATS sozlamasida har bir qo'ng'iroq (kiruvchi va chiquvchi) tugaganda <b>shu manzilga</b> so'rov (GET yoki POST, JSON yoki form) yuborilsin. Kelgan qo'ng'iroqlar <b>Call-markaz → Qo'ng'iroqlar</b> bo'limida ko'rinadi, javob berilmagan kiruvchi qo'ng'iroqdan «Lidlar» da «Yangi lead» yaratiladi (javob berilgan va chiquvchi qo'ng'iroqlar lid bo'lmaydi).</p>
        <div className="flex gap-2">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="input flex-1 font-mono text-xs" />
          <button onClick={copy} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50">{copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />} {copied ? "Nusxalandi" : "Nusxalash"}</button>
          <button onClick={() => window.confirm("Token yangilansinmi? Eski manzil ishlamay qoladi, ATS'da yangisini kiritish kerak.") && regen.mutate()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50"><RefreshCw size={14} /> Yangilash</button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-500">Qaysi tashkilotga yoziladi
            <select value={data.organizationId ?? ""} onChange={(e) => save.mutate({ organizationId: e.target.value })} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700">
              {data.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={data.autoLead} onChange={(e) => save.mutate({ autoLead: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            Javob berilmagan kiruvchi qo'ng'iroqdan avtomatik lid yaratish
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>Yozuvlar: <b className="text-slate-700">{data.recordingCount}</b> ta · <b className="text-slate-700">{(data.recordingBytes / 1048576).toFixed(1)} MB</b></span>
          <label className="flex items-center gap-2">Saqlash muddati
            <select value={data.retentionDays} onChange={(e) => save.mutate({ retentionDays: Number(e.target.value) })} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700">
              <option value={0}>Doimiy</option><option value={30}>30 kun</option><option value={90}>90 kun</option><option value={180}>180 kun</option><option value={365}>1 yil</option>
            </select>
          </label>
          <span className="text-slate-400">Muddati o'tgan yozuv fayllari o'chiriladi (qo'ng'iroq yozuvi qoladi). Diskni nazorat qiling.</span>
        </div>
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer select-none text-slate-600">Qaysi maydonlar o'qiladi</summary>
          <p className="mt-2">Raqamlar: <code>caller / caller_id / src / from</code> va <code>callee / called_did / dst / to</code>; yo'nalish: <code>direction / call_type</code> (in/out; berilmasa ichki-tashqi raqamdan aniqlanadi); holat: <code>disposition / status</code>; davomiylik: <code>billsec / duration</code> (soniya); qo'ng'iroq ID: <code>uniqueid / call_id / pbx_call_id / uuid</code>; vaqt: <code>calldate / call_start / start_time</code> (ISO yoki epoch); yozuv: <code>recordingfile / record_url</code>; ichki raqam: <code>extension / ext / operator</code>. Bir qo'ng'iroq uchun bir necha hodisa kelsa, ID bo'yicha yangilanadi.</p>
        </details>
        <div className="rounded-lg bg-slate-50 p-3 text-xs">
          <div className="font-medium text-slate-700">Oxirgi kelgan so'rov</div>
          {data.last ? (
            <>
              <p className={data.last.ok ? "text-emerald-700" : "text-rose-700"}>{new Date(data.last.at).toLocaleString("uz-UZ")} · {data.last.ok ? "qabul qilindi" : `rad etildi: ${data.last.error}`}</p>
              <pre className="mt-1.5 max-h-40 overflow-auto rounded bg-white p-2 text-[11px] text-slate-600">{JSON.stringify(data.last.raw, null, 2)}</pre>
            </>
          ) : <p className="text-slate-400">Hali so'rov kelmagan. ATS ulangach, shu yerda ma'lumot ko'rinadi (format muammosini aniqlash uchun).</p>}
        </div>
      </div>
    </div>
  );
}
