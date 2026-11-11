import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Play, PhoneIncoming, PhoneMissed, PhoneOutgoing, Search } from "lucide-react";
import clsx from "clsx";
import { fetchPhoneCalls, fetchRecordingLink, type PhoneCall } from "../../api/calls";
import { useLanguage } from "../../i18n/LanguageContext";
import { LOCALE_OF } from "../../i18n/callsTranslations";
import type { TranslationKey } from "../../i18n/translations";

export const CALL_STATUS: Record<PhoneCall["status"], { label: TranslationKey; tone: string }> = {
  ANSWERED: { label: "calls.status.ANSWERED", tone: "bg-emerald-100 text-emerald-800" },
  MISSED: { label: "calls.status.MISSED", tone: "bg-rose-100 text-rose-800" },
  BUSY: { label: "calls.status.BUSY", tone: "bg-amber-100 text-amber-800" },
  FAILED: { label: "calls.status.FAILED", tone: "bg-slate-100 text-slate-600" },
};
export const fmtDur = (s: number) => (s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "—");
const fmtDT = (d: string, locale: string) => new Date(d).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;

const FILTERS = [
  { key: "", label: "calls.calls.filterAll" },
  { key: "IN", label: "calls.calls.filterIn" },
  { key: "OUT", label: "calls.calls.filterOut" },
  { key: "MISSED", label: "calls.calls.filterMissed" },
] as const satisfies readonly { key: string; label: TranslationKey }[];

/** IP-telefoniya (ATS) orqali kelgan va ketgan barcha qo'ng'iroqlar - har 15 soniyada yangilanadi. */
export function PhoneCallsTab() {
  const { t, language } = useLanguage();
  const locale = LOCALE_OF[language];
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("");
  const [search, setSearch] = useState("");
  const q = search.trim();
  const params = filter === "MISSED" ? { status: "MISSED", direction: "IN" } : filter ? { direction: filter } : {};
  const { data, isLoading, error } = useQuery({
    queryKey: ["calls", "phone-calls", filter, q],
    queryFn: () => fetchPhoneCalls({ ...params, q: q || undefined }),
    refetchInterval: 15_000,
  });
  const items = data?.items ?? [];

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label={t("calls.calls.todayIn")} value={data?.today.in ?? 0} />
        <Stat label={t("calls.calls.todayOut")} value={data?.today.out ?? 0} />
        <Stat label={t("calls.calls.todayMissed")} value={data?.today.missed ?? 0} tone="text-rose-600" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={clsx("rounded-full border px-3.5 py-1.5 text-sm transition", filter === f.key ? "border-brand-700 bg-brand-800 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-brand-400")}>{t(f.label)}</button>
        ))}
        <div className="relative ml-auto">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("calls.calls.search")} className="input w-64" style={{ paddingLeft: 36 }} />
        </div>
      </div>
      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{t("calls.calls.loadError")}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">{t("calls.calls.colTime")}</th><th className="px-4 py-3">{t("calls.calls.colNumber")}</th><th className="px-4 py-3">{t("calls.calls.colLead")}</th><th className="px-4 py-3">{t("calls.calls.colStatus")}</th><th className="px-4 py-3">{t("calls.calls.colDuration")}</th><th className="px-4 py-3">{t("calls.calls.colExt")}</th><th className="px-4 py-3">{t("calls.calls.colRecording")}</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">{t("calls.loading")}</td></tr>}
            {!isLoading && items.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">{t("calls.calls.empty")}</td></tr>}
            {items.map((c) => {
              const Icon = c.direction === "OUT" ? PhoneOutgoing : c.status === "ANSWERED" ? PhoneIncoming : PhoneMissed;
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDT(c.startedAt, locale)}</td>
                  <td className="px-4 py-3">
                    <a href={telHref(c.phone)} className="flex items-center gap-2 font-medium text-slate-900 hover:underline">
                      <Icon size={15} className={c.direction === "OUT" ? "text-sky-600" : c.status === "ANSWERED" ? "text-emerald-600" : "text-rose-600"} /> {c.phone}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.lead && c.lead.name !== c.phone ? c.lead.name : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3"><span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", CALL_STATUS[c.status].tone)}>{t(CALL_STATUS[c.status].label)}</span></td>
                  <td className="px-4 py-3 text-slate-600">{fmtDur(c.durationSec)}</td>
                  <td className="px-4 py-3 text-slate-500">{c.extension ?? "—"}</td>
                  <td className="px-4 py-3">{c.hasRecording || c.recordingUrl ? <RecordingPlayer callId={c.id} /> : <span className="text-slate-300">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">{t("calls.calls.footnote")}</p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className={clsx("mt-1 text-2xl font-semibold", tone ?? "text-brand-950")}>{value}</div>
    </div>
  );
}

/** Yozuvni tinglash: bosilganda qisqa muddatli havola olinadi, so'ng audio pleyer (oldinga o'tkazish bilan) va yuklab olish chiqadi. */
export function RecordingPlayer({ callId }: { callId: string }) {
  const { t } = useLanguage();
  const [src, setSrc] = useState<string | null>(null);
  const [external, setExternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function load() {
    setBusy(true); setError(false);
    try { const l = await fetchRecordingLink(callId); setSrc(l.url); setExternal(l.external); } catch { setError(true); } finally { setBusy(false); }
  }

  if (!src) {
    return (
      <button onClick={load} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} className="text-emerald-600" />} {error ? t("calls.rec.retry") : t("calls.rec.listen")}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <audio controls autoPlay preload="metadata" src={src} className="h-8 w-52" onError={() => { setSrc(null); setError(true); }} />
      <a href={external ? src : `${src}&download=1`} target="_blank" rel="noreferrer" title={t("calls.rec.download")} className="text-slate-400 hover:text-slate-700"><Download size={15} /></a>
    </div>
  );
}
