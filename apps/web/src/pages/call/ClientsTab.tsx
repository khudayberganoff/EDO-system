import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Pencil, Phone, Plus, Search, X } from "lucide-react";
import clsx from "clsx";
import { fetchCrmClients, setClientPhone, type CrmClient } from "../../api/calls";

const FILTERS = [
  { key: "all", label: "Hammasi" },
  { key: "overdue", label: "Muddati o'tgan" },
  { key: "soon", label: "7 kun ichida to'lov" },
  { key: "nophone", label: "Telefonsiz" },
] as const;
const SORTS = [
  { key: "payment", label: "To'lov sanasi bo'yicha" },
  { key: "dpd", label: "Kechikish bo'yicha" },
  { key: "name", label: "Ism bo'yicha" },
] as const;

const money = (n?: number | null) => (n == null ? "—" : `${Math.round(n).toLocaleString("ru-RU")} so'm`);
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("uz-UZ", { timeZone: "UTC" }) : "—");
const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;
const rel = (days: number | null) => (days === null ? "" : days === 0 ? "bugun" : days === 1 ? "ertaga" : `${days} kundan keyin`);

/** CRM'dagi majburiyati bor mijozlar: to'lov sanalari, qarz va telefon (CRM ro'yxatidan yoki qo'lda qo'shilgan). */
export function ClientsTab({ canEdit }: { canEdit: boolean }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["key"]>("payment");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CrmClient | null>(null);
  const q = search.trim();
  const { data, isLoading, error } = useQuery({
    queryKey: ["calls", "clients", filter, sort, q],
    queryFn: () => fetchCrmClients({ filter, sort, q: q || undefined }),
  });
  const items = data?.items ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={clsx("rounded-full border px-3.5 py-1.5 text-sm transition", filter === f.key ? "border-brand-700 bg-brand-800 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-brand-400")}>
            {f.label}{data?.counts?.[f.key] != null && <span className={clsx("ml-1.5 text-xs", filter === f.key ? "text-white/80" : "text-slate-400")}>{data.counts[f.key]}</span>}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-600">
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mijoz yoki shartnoma..." className="input w-60" style={{ paddingLeft: 36 }} />
          </div>
        </div>
      </div>

      {data && !data.enabled && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">CRM bilan ulanish sozlanmagan, shuning uchun mijozlar ro'yxati yo'q (bax. docs/CRM-INTEGRATION.md).</p>}
      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Ro'yxatni yuklab bo'lmadi (CRM javob bermadi yoki ruxsat yo'q).</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Mijoz</th><th className="px-4 py-3">Telefon</th><th className="px-4 py-3">Keyingi to'lov</th>
              <th className="px-4 py-3 text-right">Oylik to'lov</th><th className="px-4 py-3 text-right">Muddati o'tgan</th><th className="px-4 py-3 text-right">Asosiy qoldiq</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Yuklanmoqda...</td></tr>}
            {!isLoading && data?.enabled && items.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Bu bo'limda mijoz yo'q.</td></tr>}
            {items.map((c) => {
              const overdue = (c.overdueAmount ?? 0) > 0 || (c.dpd ?? 0) > 0;
              return (
                <tr key={`${c.organization}-${c.clientId}`} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{c.clientName}</div>
                    <div className="text-xs text-slate-500">{c.contractKind === "LEASING" ? "Lizing" : "Murobaha"} · №{c.contractNumber ?? "—"}{c.endDate ? ` · tugash ${fmtDate(c.endDate)}` : ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    {c.phone ? (
                      <div className="flex items-center gap-1.5">
                        <a href={telHref(c.phone)} className="flex items-center gap-1.5 whitespace-nowrap font-medium text-emerald-700 hover:underline"><Phone size={13} /> {c.phone}</a>
                        {c.phoneSource === "manual" && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700" title="CRM ro'yxatida emas, qo'lda kiritilgan">qo'lda</span>}
                        {canEdit && <button onClick={() => setEditing(c)} title="Raqamni o'zgartirish" className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"><Pencil size={13} /></button>}
                      </div>
                    ) : canEdit ? (
                      <button onClick={() => setEditing(c)} className="flex items-center gap-1.5 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"><Plus size={12} /> Raqam qo'shish</button>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {c.nextPaymentDate ? (
                      <div>
                        <div className="flex items-center gap-1.5 font-medium text-slate-800"><CalendarClock size={13} className="text-slate-400" /> {fmtDate(c.nextPaymentDate)}</div>
                        <div className={clsx("text-xs", (c.daysToPayment ?? 99) <= 3 ? "font-medium text-amber-700" : "text-slate-400")}>{rel(c.daysToPayment)}{c.paymentDay ? ` · har oy ${c.paymentDay}-sana` : ""}</div>
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{money(c.monthlyPayment)}</td>
                  <td className="px-4 py-3 text-right">
                    {overdue ? (
                      <div>
                        <div className="font-semibold text-rose-700">{money(c.overdueAmount)}</div>
                        <div className="text-xs text-rose-500">{c.dpd ?? 0} kun{c.firstOverdueDate ? ` · ${fmtDate(c.firstOverdueDate)} dan` : ""}</div>
                      </div>
                    ) : <span className="text-xs text-emerald-600">kechikish yo'q</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{money(c.principalBalance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data?.enabled && <p className="mt-2 text-xs text-slate-400">Ma'lumot CRM'dan o'qiladi (faqat o'qish) va har ochilganda yangilanadi. CRM'da raqam bo'lmasa, «Raqam qo'shish» bilan shu yerda saqlanadi; qo'lda kiritilgan raqam CRM raqamidan ustun turadi.</p>}

      {editing && <PhoneModal client={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PhoneModal({ client, onClose }: { client: CrmClient; onClose: () => void }) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState(client.manualPhone ?? client.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (value: string) => setClientPhone({ crmOrg: client.organization, clientId: client.clientId, phone: value }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["calls", "clients"] }); onClose(); },
    onError: (e: any) => {
      const m = e?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(". ") : typeof m === "string" ? m : m?.message ?? "Saqlab bo'lmadi.");
    },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Telefon raqami</h3>
            <p className="text-sm text-slate-500">{client.clientName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        {client.crmPhone && <p className="mb-2 text-xs text-slate-400">CRM ro'yxatidagi raqam: {client.crmPhone}</p>}
        <input autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" inputMode="tel" className="input" onKeyDown={(e) => e.key === "Enter" && phone.trim() && save.mutate(phone)} />
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        <div className="mt-5 flex items-center justify-between gap-2">
          {client.manualPhone ? <button onClick={() => save.mutate("")} disabled={save.isPending} className="text-xs text-rose-600 hover:text-rose-700">Qo'lda kiritilganni o'chirish</button> : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">Bekor qilish</button>
            <button disabled={!phone.trim() || save.isPending} onClick={() => save.mutate(phone)} className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">{save.isPending ? "Saqlanmoqda..." : "Saqlash"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
