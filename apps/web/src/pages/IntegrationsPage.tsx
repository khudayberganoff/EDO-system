import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Trash2, Ban, Copy, Check, X } from "lucide-react";
import { fetchApiKeys, createApiKey, revokeApiKey, deleteApiKey, type ApiKeyItem } from "../api/api-keys";

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
