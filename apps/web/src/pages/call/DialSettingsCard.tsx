import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, PhoneCall } from "lucide-react";
import clsx from "clsx";
import { fetchDialSettings, saveDialSettings, type DialFormat } from "../../api/calls";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import type { TranslationKey } from "../../i18n/translations";
import { dialNumber } from "../../utils/dial";

const FORMATS: DialFormat[] = ["local", "intl", "plus"];
const SAMPLE = "+998 90 123 45 67";

/**
 * Sozlamalar -> Integratsiyalar: tizimdagi raqam bosilganda MicroSIP (yoki boshqa softfon) qaysi ko'rinishda
 * terishi. ATS "+" belgisini yoki xalqaro kodni qabul qilmasa, shu yerdan o'zgartiriladi (faqat administrator).
 */
export function DialSettingsCard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const isAdmin = user?.role === "ADMIN";
  const { data } = useQuery({ queryKey: ["calls", "dial-settings"], queryFn: fetchDialSettings, enabled: isAdmin });
  const [format, setFormat] = useState<DialFormat>("local");
  const [prefix, setPrefix] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (data) { setFormat(data.format); setPrefix(data.prefix); } }, [data]);
  const save = useMutation({
    mutationFn: () => saveDialSettings({ format, prefix }),
    onSuccess: () => { setError(null); setSaved(true); setTimeout(() => setSaved(false), 2000); qc.invalidateQueries({ queryKey: ["calls", "dial-settings"] }); },
    onError: (e: any) => { const m = e?.response?.data?.message; setError(Array.isArray(m) ? m.join(". ") : typeof m === "string" ? m : m?.message ?? t("calls.saveFailed")); },
  });
  if (!isAdmin || !data) return null;
  const changed = format !== data.format || prefix !== data.prefix;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900"><PhoneCall size={16} className="text-emerald-600" /> {t("dial.title")}</h2>
      <p className="mb-4 text-sm text-slate-600">{t("dial.desc")}</p>
      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">{error}</p>}

      <div className="grid gap-2 sm:grid-cols-3">
        {FORMATS.map((f) => (
          <label key={f} className={clsx("flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-sm", format === f ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:bg-slate-50")}>
            <span className="flex items-center gap-2 font-medium text-slate-800">
              <input type="radio" name="dial-format" id={`dial-${f}`} checked={format === f} onChange={() => setFormat(f)} /> {t(`dial.f.${f}` as TranslationKey)}
            </span>
            <span className="pl-5 font-mono text-xs text-slate-500">{dialNumber(SAMPLE, { format: f, prefix })}</span>
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block text-xs text-slate-500">{t("dial.prefix")}
          <input id="dial-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value.replace(/[^0-9*#]/g, "").slice(0, 6))} placeholder={t("dial.prefixPh")} className="input mt-1 w-40" />
        </label>
        <div className="text-xs text-slate-500">{t("dial.preview")}: <b className="font-mono text-slate-800">{dialNumber(SAMPLE, { format, prefix })}</b></div>
        <button onClick={() => save.mutate()} disabled={!changed || save.isPending} className="ml-auto rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{t("calls.save")}</button>
        {saved && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check size={13} /> {t("meta.saved")}</span>}
      </div>

      <details className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">{t("dial.howTitle")}</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>{t("dial.how1")}</li>
          <li>{t("dial.how2")}</li>
          <li>{t("dial.how3")}</li>
        </ol>
      </details>
    </div>
  );
}
