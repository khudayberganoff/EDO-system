import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Headset, Phone, PhoneCall, Search, X, Clock, AlertTriangle, CalendarClock } from "lucide-react";
import clsx from "clsx";
import {
  fetchCallHistory, fetchCallQueue, fetchCallStats, saveCallLog,
  type CallOutcome, type QueueItem,
} from "../api/calls";
import { useAuth } from "../context/AuthContext";

const OUTCOMES: { value: CallOutcome; label: string; tone: string }[] = [
  { value: "ANSWERED", label: "Gaplashildi", tone: "bg-sky-100 text-sky-800" },
  { value: "PROMISE", label: "To'lashga va'da berdi", tone: "bg-emerald-100 text-emerald-800" },
  { value: "CALLBACK", label: "Qayta qo'ng'iroq so'radi", tone: "bg-amber-100 text-amber-800" },
  { value: "NO_ANSWER", label: "Javob bermadi", tone: "bg-slate-100 text-slate-700" },
  { value: "BUSY", label: "Band", tone: "bg-slate-100 text-slate-700" },
  { value: "REFUSED", label: "To'lashdan bosh tortdi", tone: "bg-rose-100 text-rose-800" },
  { value: "WRONG_NUMBER", label: "Raqam noto'g'ri", tone: "bg-rose-50 text-rose-700" },
];
const outcomeMeta = (o: string) => OUTCOMES.find((x) => x.value === o);

const FILTERS: { key: "todo" | "callback" | "broken" | "promise" | "today" | "all"; label: string }[] = [
  { key: "todo", label: "Qo'ng'iroq qilinadi" },
  { key: "callback", label: "Qayta qo'ng'iroq" },
  { key: "broken", label: "Va'da buzilgan" },
  { key: "promise", label: "Va'da berganlar" },
  { key: "today", label: "Bugun qo'ng'iroq qilingan" },
  { key: "all", label: "Hammasi" },
];

const money = (n?: number | null) => (n == null ? "—" : `${Math.round(n).toLocaleString("ru-RU")} so'm`);
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("uz-UZ") : "—");
const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString("uz-UZ", { dateStyle: "short", timeStyle: "short" }) : "—");
const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;

function dpdTone(dpd: number | null) {
  const d = dpd ?? 0;
  if (d >= 90) return "bg-rose-100 text-rose-800";
  if (d >= 30) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

export function CallCenterPage() {
  const { user } = useAuth();
  const canEdit = user?.role !== "OBSERVER";
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("todo");
  const [search, setSearch] = useState("");
  const [days, setDays] = useState(1);
  const [active, setActive] = useState<QueueItem | null>(null);

  const q = search.trim();
  const { data, isLoading, error } = useQuery({
    queryKey: ["calls", "queue", filter, q],
    queryFn: () => fetchCallQueue({ filter, q: q || undefined }),
  });
  const { data: stats } = useQuery({ queryKey: ["calls", "stats", days], queryFn: () => fetchCallStats(days) });
  const items = data?.items ?? [];

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display flex items-center gap-3 text-[30px] font-semibold tracking-tight text-brand-950"><Headset size={28} className="text-brand-700" /> Call-markaz</h1>
          <p className="mt-1 text-sm text-slate-500">Muddati o'tgan to'lovlar bo'yicha mijozlarga qo'ng'iroq: natija, va'da va qayta qo'ng'iroq shu yerda yuritiladi.</p>
        </div>
        <div className="flex gap-1 rounded-full border border-slate-200 bg-white p-1">
          {[{ d: 1, l: "Bugun" }, { d: 7, l: "7 kun" }, { d: 30, l: "30 kun" }].map((x) => (
            <button key={x.d} onClick={() => setDays(x.d)} className={clsx("rounded-full px-3 py-1.5 text-xs font-semibold transition", days === x.d ? "bg-brand-800 text-white" : "text-slate-500 hover:text-slate-800")}>{x.l}</button>
          ))}
        </div>
      </div>

      {/* Statistika */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Qo'ng'iroqlar" value={stats?.total ?? 0} sub={`${stats?.uniqueClients ?? 0} ta mijoz`} />
        <Stat label="Gaplashildi" value={`${stats?.reachRate ?? 0}%`} sub={`${stats?.reached ?? 0} ta`} />
        <Stat label="Va'dalar" value={stats?.promises ?? 0} sub={money(stats?.promiseSum)} />
        <Stat label="Javob bermadi / band" value={(stats?.outcomes?.NO_ANSWER ?? 0) + (stats?.outcomes?.BUSY ?? 0)} sub="qayta urinish kerak" />
      </div>
      {stats && stats.operators.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2.5">Operator</th><th className="px-4 py-2.5">Qo'ng'iroq</th><th className="px-4 py-2.5">Gaplashildi</th><th className="px-4 py-2.5">Va'da</th><th className="px-4 py-2.5">Va'da summasi</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.operators.map((o) => (
                <tr key={o.name}><td className="px-4 py-2.5 font-medium text-slate-800">{o.name}</td><td className="px-4 py-2.5">{o.calls}</td><td className="px-4 py-2.5">{o.reached}</td><td className="px-4 py-2.5">{o.promises}</td><td className="px-4 py-2.5">{money(o.promiseSum)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Navbat */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={clsx("rounded-full border px-3.5 py-1.5 text-sm transition", filter === f.key ? "border-brand-700 bg-brand-800 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-brand-400")}>
            {f.label}{data?.counts?.[f.key] != null && <span className={clsx("ml-1.5 text-xs", filter === f.key ? "text-white/80" : "text-slate-400")}>{data.counts[f.key]}</span>}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mijoz yoki shartnoma..." className="input w-64" style={{ paddingLeft: 36 }} />
        </div>
      </div>

      {data && !data.enabled && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">CRM bilan ulanish sozlanmagan, shuning uchun qarzdorlar ro'yxati yo'q (bax. docs/CRM-INTEGRATION.md).</p>}
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Ro'yxatni yuklab bo'lmadi (CRM javob bermadi yoki ruxsat yo'q).</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Mijoz</th><th className="px-4 py-3">Telefon</th><th className="px-4 py-3 text-right">Muddati o'tgan</th>
              <th className="px-4 py-3">Kun</th><th className="px-4 py-3">Oxirgi qo'ng'iroq</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Yuklanmoqda...</td></tr>}
            {!isLoading && data?.enabled && items.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Bu bo'limda mijoz yo'q.</td></tr>}
            {items.map((c) => (
              <tr key={`${c.organization}-${c.clientId}`} className="cursor-pointer hover:bg-slate-50" onClick={() => setActive(c)}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{c.clientName}</div>
                  <div className="text-xs text-slate-500">{c.contractKind === "LEASING" ? "Lizing" : "Murobaha"} · №{c.contractNumber ?? "—"}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{c.phone ?? <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">{money(c.overdueAmount)}</td>
                <td className="px-4 py-3"><span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", dpdTone(c.dpd))}>{c.dpd ?? 0} kun</span></td>
                <td className="px-4 py-3">
                  {c.lastCall ? (
                    <div>
                      <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", outcomeMeta(c.lastCall.outcome)?.tone)}>{outcomeMeta(c.lastCall.outcome)?.label}</span>
                      <div className="mt-0.5 text-xs text-slate-400">{fmtDateTime(c.lastCall.at)} · {c.lastCall.by}</div>
                      {c.promise?.active && <div className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700"><CalendarClock size={12} /> {fmtDate(c.promise.date)} gacha{c.promise.amount ? ` · ${money(c.promise.amount)}` : ""}</div>}
                      {c.promise?.broken && <div className="mt-0.5 flex items-center gap-1 text-xs text-rose-700"><AlertTriangle size={12} /> Va'da muddati o'tdi ({fmtDate(c.promise.date)})</div>}
                      {c.callbackAt && <div className={clsx("mt-0.5 flex items-center gap-1 text-xs", c.callbackDue ? "font-semibold text-amber-700" : "text-slate-500")}><Clock size={12} /> {fmtDateTime(c.callbackAt)}</div>}
                    </div>
                  ) : <span className="text-xs text-slate-300">hali qilinmagan</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  {c.phone && <a href={telHref(c.phone)} onClick={(e) => e.stopPropagation()} title="Qo'ng'iroq qilish" className="inline-flex rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"><Phone size={16} /></a>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.enabled && <p className="mt-2 text-xs text-slate-400">Ro'yxat CRM'dan olinadi va har ochilganda yangilanadi. Tartib: qayta qo'ng'iroq vaqti kelganlar, buzilgan va'dalar, hali qo'ng'iroq qilinmaganlar, so'ng kechikish kuni bo'yicha.</p>}

      {active && <CallPanel item={active} canEdit={canEdit} onClose={() => setActive(null)} />}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-brand-950">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/** Mijoz kartochkasi: qo'ng'iroq qilish, natijani yozish va oldingi qo'ng'iroqlar tarixi. */
function CallPanel({ item, canEdit, onClose }: { item: QueueItem; canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [note, setNote] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: history = [] } = useQuery({ queryKey: ["calls", "history", item.clientId], queryFn: () => fetchCallHistory(item.clientId) });

  const save = useMutation({
    mutationFn: () => saveCallLog({
      clientId: item.clientId, clientName: item.clientName, contractNumber: item.contractNumber ?? undefined, phone: item.phone ?? undefined,
      outcome: outcome!, note: note.trim() || undefined,
      promiseDate: outcome === "PROMISE" ? promiseDate : undefined,
      promiseAmount: outcome === "PROMISE" && promiseAmount ? Number(promiseAmount) : undefined,
      callbackAt: outcome === "CALLBACK" && callbackAt ? new Date(callbackAt).toISOString() : undefined,
      dpd: item.dpd ?? undefined, overdueAmount: item.overdueAmount ?? undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["calls"] }); onClose(); },
    onError: (e: any) => {
      const m = e?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(". ") : typeof m === "string" ? m : m?.message ?? "Saqlab bo'lmadi.");
    },
  });

  const ready = !!outcome && (outcome !== "PROMISE" || !!promiseDate) && (outcome !== "CALLBACK" || !!callbackAt);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{item.clientName}</h2>
            <p className="text-sm text-slate-500">{item.contractKind === "LEASING" ? "Lizing" : "Murobaha"} · №{item.contractNumber ?? "—"} {item.contractDate ? `· ${fmtDate(item.contractDate)}` : ""}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
          <Info label="Muddati o'tgan" value={money(item.overdueAmount)} />
          <Info label="Kechikish" value={`${item.dpd ?? 0} kun`} />
          <Info label="Oylik to'lov" value={money(item.monthlyPayment)} />
          <Info label="Asosiy qoldiq" value={money(item.principalBalance)} />
          <Info label="To'lov kuni" value={item.paymentDay ? `har oy ${item.paymentDay}-sana` : "—"} />
          <Info label="Tugash" value={fmtDate(item.endDate)} />
        </div>

        {item.phone ? (
          <a href={telHref(item.phone)} className="mb-5 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700">
            <PhoneCall size={17} /> Qo'ng'iroq qilish · {item.phone}
          </a>
        ) : (
          <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Telefon raqami topilmadi (CRM ro'yxatida yo'q).</p>
        )}

        {canEdit && (
          <div className="mb-6 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Qo'ng'iroq natijasi</div>
            <div className="flex flex-wrap gap-2">
              {OUTCOMES.map((o) => (
                <button key={o.value} onClick={() => setOutcome(o.value)} className={clsx("rounded-full border px-3 py-1.5 text-sm transition", outcome === o.value ? "border-brand-700 bg-brand-800 text-white" : "border-slate-200 text-slate-600 hover:border-brand-400")}>{o.label}</button>
              ))}
            </div>
            {outcome === "PROMISE" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-slate-500">Qachon to'laydi *<input type="date" min={today} value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} className="input mt-1" /></label>
                <label className="block text-xs text-slate-500">Summa (so'm)<input inputMode="numeric" value={promiseAmount} onChange={(e) => setPromiseAmount(e.target.value.replace(/\D/g, ""))} placeholder={item.overdueAmount ? String(item.overdueAmount) : ""} className="input mt-1" /></label>
              </div>
            )}
            {outcome === "CALLBACK" && (
              <label className="block text-xs text-slate-500">Qachon qayta qo'ng'iroq qilish *<input type="datetime-local" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} className="input mt-1" /></label>
            )}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Izoh (suhbat mazmuni, sabab...)" className="input" />
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button disabled={!ready || save.isPending} onClick={() => save.mutate()} className="w-full rounded-xl bg-brand-800 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">
              {save.isPending ? "Saqlanmoqda..." : "Natijani saqlash"}
            </button>
          </div>
        )}

        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Qo'ng'iroqlar tarixi</div>
        <div className="mt-2 space-y-3">
          {history.length === 0 && <p className="text-sm text-slate-400">Hali qo'ng'iroq qilinmagan.</p>}
          {history.map((h) => (
            <div key={h.id} className="rounded-lg border border-slate-100 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className={clsx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", outcomeMeta(h.outcome)?.tone)}>{outcomeMeta(h.outcome)?.label}</span>
                <span className="text-xs text-slate-400">{fmtDateTime(h.createdAt)} · {h.operator.fullName}</span>
              </div>
              {h.promiseDate && <div className="mt-1 text-xs text-emerald-700">Va'da: {fmtDate(h.promiseDate)}{h.promiseAmount ? ` · ${money(h.promiseAmount)}` : ""}</div>}
              {h.callbackAt && <div className="mt-1 text-xs text-amber-700">Qayta qo'ng'iroq: {fmtDateTime(h.callbackAt)}</div>}
              {h.note && <p className="mt-1 whitespace-pre-wrap text-slate-600">{h.note}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="font-medium text-slate-800">{value}</div>
    </div>
  );
}
