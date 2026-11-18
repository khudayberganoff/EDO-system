import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, Clock, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { addDefaultHolidays, addHoliday, fetchSlaSettings, removeHoliday, saveSlaSettings } from "../../api/calls";
import { useLanguage } from "../../i18n/LanguageContext";

const WEEKDAY_NAMES = {
  uz: ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"],
  ru: ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

const errText = (e: any, fallback: string) => {
  const m = e?.response?.data?.message;
  return (Array.isArray(m) ? m.join(". ") : typeof m === "string" ? m : m?.message) ?? fallback;
};

/**
 * Call-markaz ish vaqti va lidlar bo'yicha muddatlar: lidlarga qo'ng'iroq qilish vaqti (masalan 09:00-18:00),
 * javob va natija muddatlari (ish soatlarida), bayram va ish kuniga ko'chirilgan kunlar.
 */
export function SlaSettingsCard() {
  const { t, language } = useLanguage();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["calls", "sla-settings"], queryFn: fetchSlaSettings });
  const [form, setForm] = useState({ workStart: "09:00", workEnd: "18:00", responseHours: 8, resolveHours: 72 });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holiday, setHoliday] = useState({ date: "", name: "", type: "HOLIDAY" as "HOLIDAY" | "WORKDAY" });
  const [info, setInfo] = useState<string | null>(null);
  const year = new Date().getFullYear();

  useEffect(() => {
    if (data) setForm({ workStart: data.workStart, workEnd: data.workEnd, responseHours: data.responseHours, resolveHours: data.resolveHours });
  }, [data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["calls"] });
  const onErr = (e: any) => setError(errText(e, t("calls.saveFailed")));
  const save = useMutation({ mutationFn: () => saveSlaSettings(form), onSuccess: () => { setError(null); setSaved(true); setTimeout(() => setSaved(false), 2000); refresh(); }, onError: onErr });
  const add = useMutation({ mutationFn: () => addHoliday(holiday), onSuccess: () => { setError(null); setHoliday({ date: "", name: "", type: "HOLIDAY" }); refresh(); }, onError: onErr });
  const del = useMutation({ mutationFn: removeHoliday, onSuccess: refresh, onError: onErr });
  const defaults = useMutation({
    mutationFn: (y: number) => addDefaultHolidays(y),
    onSuccess: (r) => { setError(null); setInfo(t("sla.addedDefaults", { n: r.added })); setTimeout(() => setInfo(null), 3000); refresh(); },
    onError: onErr,
  });

  const toMin = (x: string) => { const [h, m] = x.split(":").map(Number); return h * 60 + (m || 0); };
  const dayLen = Math.max(1, (toMin(form.workEnd) - toMin(form.workStart)) / 60);
  const asDays = (h: number) => (h / dayLen).toFixed(1).replace(/\.0$/, "");
  // "18.11.2026, chorshanba" - brauzerning uz-UZ formati noqulay bo'lgani uchun qo'lda
  const fmtDate = (d: string) => {
    const x = new Date(d);
    const dd = String(x.getUTCDate()).padStart(2, "0"), mm = String(x.getUTCMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}.${x.getUTCFullYear()}, ${WEEKDAY_NAMES[language][x.getUTCDay()]}`;
  };

  if (!data) return <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-400">{t("calls.loading")}</div>;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900"><Clock size={16} className="text-brand-700" /> {t("sla.title")}</h2>
      <p className="mb-4 text-sm text-slate-600">{t("sla.desc")}</p>
      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-xs text-slate-500">{t("sla.workStart")}
          <input type="time" value={form.workStart} onChange={(e) => setForm({ ...form, workStart: e.target.value })} className="input mt-1" />
        </label>
        <label className="block text-xs text-slate-500">{t("sla.workEnd")}
          <input type="time" value={form.workEnd} onChange={(e) => setForm({ ...form, workEnd: e.target.value })} className="input mt-1" />
        </label>
        <label className="block text-xs text-slate-500">{t("sla.responseHours")}
          <input type="number" min={1} max={500} value={form.responseHours} onChange={(e) => setForm({ ...form, responseHours: Number(e.target.value) })} className="input mt-1" />
          <span className="mt-1 block text-[11px] text-slate-400">{t("sla.asDays", { d: asDays(form.responseHours) })}</span>
        </label>
        <label className="block text-xs text-slate-500">{t("sla.resolveHours")}
          <input type="number" min={1} max={1000} value={form.resolveHours} onChange={(e) => setForm({ ...form, resolveHours: Number(e.target.value) })} className="input mt-1" />
          <span className="mt-1 block text-[11px] text-slate-400">{t("sla.asDays", { d: asDays(form.resolveHours) })}</span>
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{t("calls.save")}</button>
        {saved && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check size={13} /> {t("meta.saved")}</span>}
        <span className={clsx("ml-auto rounded-full px-3 py-1 text-xs", data.workingNow ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>
          {data.workingNow ? t("sla.workingNow") : t("sla.notWorkingNow")}
        </span>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><CalendarDays size={15} className="text-brand-700" /> {t("sla.holidays")}</h3>
          <div className="flex gap-2">
            {[year, year + 1].map((y) => (
              <button key={y} onClick={() => defaults.mutate(y)} disabled={defaults.isPending} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">{t("sla.addDefaults", { year: y })}</button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-xs text-slate-500">{t("sla.hayitHint")}</p>
        {info && <p className="mb-2 text-xs text-emerald-700">{info}</p>}

        <div className="mb-3 grid gap-2 sm:grid-cols-[160px_1fr_200px_auto]">
          <input type="date" value={holiday.date} onChange={(e) => setHoliday({ ...holiday, date: e.target.value })} className="input" />
          <input value={holiday.name} onChange={(e) => setHoliday({ ...holiday, name: e.target.value })} placeholder={t("sla.namePlaceholder")} className="input" />
          <select value={holiday.type} onChange={(e) => setHoliday({ ...holiday, type: e.target.value as "HOLIDAY" | "WORKDAY" })} className="input">
            <option value="HOLIDAY">{t("sla.typeHoliday")}</option>
            <option value="WORKDAY">{t("sla.typeWorkday")}</option>
          </select>
          <button onClick={() => add.mutate()} disabled={!holiday.date || holiday.name.trim().length < 2 || add.isPending} className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"><Plus size={15} /> {t("settings.add")}</button>
        </div>

        {data.holidays.length === 0 ? (
          <p className="py-3 text-center text-sm text-slate-400">{t("sla.noHolidays")}</p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {data.holidays.map((h) => (
              <div key={h.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-48 shrink-0 text-slate-600">{fmtDate(h.date)}</span>
                <span className="flex-1 text-slate-800">{h.name}</span>
                <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-medium", h.type === "WORKDAY" ? "bg-sky-100 text-sky-800" : "bg-rose-50 text-rose-700")}>{h.type === "WORKDAY" ? t("sla.typeWorkday") : t("sla.typeHoliday")}</span>
                <button onClick={() => window.confirm(t("sla.deleteConfirm", { name: h.name })) && del.mutate(h.id)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
