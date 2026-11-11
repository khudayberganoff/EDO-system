import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Pencil, Phone, Plus, Search, X } from "lucide-react";
import clsx from "clsx";
import { fetchCrmClients, setClientPhone, type CrmClient } from "../../api/calls";
import { useLanguage } from "../../i18n/LanguageContext";
import { LOCALE_OF } from "../../i18n/callsTranslations";
import type { TranslationKey } from "../../i18n/translations";

const FILTERS = [
  { key: "all", label: "calls.clients.filterAll" },
  { key: "overdue", label: "calls.clients.filterOverdue" },
  { key: "soon", label: "calls.clients.filterSoon" },
  { key: "nophone", label: "calls.clients.filterNoPhone" },
] as const satisfies readonly { key: string; label: TranslationKey }[];
const SORTS = [
  { key: "payment", label: "calls.clients.sortPayment" },
  { key: "dpd", label: "calls.clients.sortDpd" },
  { key: "name", label: "calls.clients.sortName" },
] as const satisfies readonly { key: string; label: TranslationKey }[];

const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;

/** Joriy tilga mos summa, sana va "necha kundan keyin" formatlari */
function useFormatters() {
  const { t, language } = useLanguage();
  const locale = LOCALE_OF[language];
  return {
    t,
    money: (n?: number | null) => (n == null ? "—" : `${Math.round(n).toLocaleString("ru-RU")} ${t("calls.clients.currency")}`),
    fmtDate: (d?: string | null) => (d ? new Date(d).toLocaleDateString(locale, { timeZone: "UTC" }) : "—"),
    rel: (days: number | null) => (days === null ? "" : days === 0 ? t("calls.clients.today") : days === 1 ? t("calls.clients.tomorrow") : t("calls.clients.inDays", { n: days })),
  };
}

/** CRM'dagi majburiyati bor mijozlar: to'lov sanalari, qarz va telefon (CRM ro'yxatidan yoki qo'lda qo'shilgan). */
export function ClientsTab({ canEdit }: { canEdit: boolean }) {
  const { t, money, fmtDate, rel } = useFormatters();
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
            {t(f.label)}{data?.counts?.[f.key] != null && <span className={clsx("ml-1.5 text-xs", filter === f.key ? "text-white/80" : "text-slate-400")}>{data.counts[f.key]}</span>}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-600">
            {SORTS.map((s) => <option key={s.key} value={s.key}>{t(s.label)}</option>)}
          </select>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("calls.clients.search")} className="input w-60" style={{ paddingLeft: 36 }} />
          </div>
        </div>
      </div>

      {data && !data.enabled && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{t("calls.clients.notConfigured")}</p>}
      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{t("calls.clients.loadError")}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("calls.clients.colClient")}</th><th className="px-4 py-3">{t("calls.phone")}</th><th className="px-4 py-3">{t("calls.clients.colNextPayment")}</th>
              <th className="px-4 py-3 text-right">{t("calls.clients.colMonthly")}</th><th className="px-4 py-3 text-right">{t("calls.clients.colOverdue")}</th><th className="px-4 py-3 text-right">{t("calls.clients.colPrincipal")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">{t("calls.loading")}</td></tr>}
            {!isLoading && data?.enabled && items.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">{t("calls.clients.empty")}</td></tr>}
            {items.map((c) => {
              const overdue = (c.overdueAmount ?? 0) > 0 || (c.dpd ?? 0) > 0;
              return (
                <tr key={`${c.organization}-${c.clientId}`} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{c.clientName}</div>
                    <div className="text-xs text-slate-500">{c.contractKind === "LEASING" ? t("calls.clients.leasing") : t("calls.clients.murabaha")} · №{c.contractNumber ?? "—"}{c.endDate ? ` · ${t("calls.clients.ends", { date: fmtDate(c.endDate) })}` : ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    {c.phone ? (
                      <div className="flex items-center gap-1.5">
                        <a href={telHref(c.phone)} className="flex items-center gap-1.5 whitespace-nowrap font-medium text-emerald-700 hover:underline"><Phone size={13} /> {c.phone}</a>
                        {c.phoneSource === "manual" && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700" title={t("calls.clients.manualHint")}>{t("calls.clients.manual")}</span>}
                        {canEdit && <button onClick={() => setEditing(c)} title={t("calls.clients.editPhone")} className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"><Pencil size={13} /></button>}
                      </div>
                    ) : canEdit ? (
                      <button onClick={() => setEditing(c)} className="flex items-center gap-1.5 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"><Plus size={12} /> {t("calls.clients.addPhone")}</button>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {c.nextPaymentDate ? (
                      <div>
                        <div className="flex items-center gap-1.5 font-medium text-slate-800"><CalendarClock size={13} className="text-slate-400" /> {fmtDate(c.nextPaymentDate)}</div>
                        <div className={clsx("text-xs", (c.daysToPayment ?? 99) <= 3 ? "font-medium text-amber-700" : "text-slate-400")}>{rel(c.daysToPayment)}{c.paymentDay ? ` · ${t("calls.clients.monthlyDay", { n: c.paymentDay })}` : ""}</div>
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{money(c.monthlyPayment)}</td>
                  <td className="px-4 py-3 text-right">
                    {overdue ? (
                      <div>
                        <div className="font-semibold text-rose-700">{money(c.overdueAmount)}</div>
                        <div className="text-xs text-rose-500">{t("calls.clients.days", { n: c.dpd ?? 0 })}{c.firstOverdueDate ? ` · ${t("calls.clients.since", { date: fmtDate(c.firstOverdueDate) })}` : ""}</div>
                      </div>
                    ) : <span className="text-xs text-emerald-600">{t("calls.clients.noDelay")}</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{money(c.principalBalance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data?.enabled && <p className="mt-2 text-xs text-slate-400">{t("calls.clients.footnote")}</p>}

      {editing && <PhoneModal client={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PhoneModal({ client, onClose }: { client: CrmClient; onClose: () => void }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [phone, setPhone] = useState(client.manualPhone ?? client.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (value: string) => setClientPhone({ crmOrg: client.organization, clientId: client.clientId, phone: value }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["calls", "clients"] }); onClose(); },
    onError: (e: any) => {
      const m = e?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(". ") : typeof m === "string" ? m : m?.message ?? t("calls.saveFailed"));
    },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{t("calls.clients.phoneTitle")}</h3>
            <p className="text-sm text-slate-500">{client.clientName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        {client.crmPhone && <p className="mb-2 text-xs text-slate-400">{t("calls.clients.crmPhone", { phone: client.crmPhone })}</p>}
        <input autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" inputMode="tel" className="input" onKeyDown={(e) => e.key === "Enter" && phone.trim() && save.mutate(phone)} />
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        <div className="mt-5 flex items-center justify-between gap-2">
          {client.manualPhone ? <button onClick={() => save.mutate("")} disabled={save.isPending} className="text-xs text-rose-600 hover:text-rose-700">{t("calls.clients.removeManual")}</button> : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">{t("calls.cancel")}</button>
            <button disabled={!phone.trim() || save.isPending} onClick={() => save.mutate(phone)} className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">{save.isPending ? t("calls.saving") : t("calls.save")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
