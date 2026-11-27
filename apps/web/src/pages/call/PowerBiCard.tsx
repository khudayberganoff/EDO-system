import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Check, Copy, RefreshCw } from "lucide-react";
import { fetchReportFeedToken, regenerateReportFeedToken } from "../../api/calls";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";

/**
 * Sozlamalar -> Integratsiyalar: Power BI uchun doimiy havola (CSV). Power BI Desktop: Ma'lumot olish -> Veb -> havola;
 * Power BI Service'da jadval bo'yicha avtomatik yangilanadi. Faqat administrator.
 */
export function PowerBiCard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const isAdmin = user?.role === "ADMIN";
  const { data } = useQuery({ queryKey: ["calls", "report-feed-token"], queryFn: fetchReportFeedToken, enabled: isAdmin });
  const regen = useMutation({ mutationFn: regenerateReportFeedToken, onSuccess: () => qc.invalidateQueries({ queryKey: ["calls", "report-feed-token"] }) });
  const [copied, setCopied] = useState(false);
  if (!isAdmin || !data) return null;
  const url = `${window.location.origin}/api/calls/report/feed.csv?token=${data.token}`;
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* qo'lda nusxalanadi */ } };

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900"><BarChart3 size={16} className="text-amber-500" /> {t("pbi.title")}</h2>
      <p className="mb-3 text-sm text-slate-600">{t("pbi.desc")}</p>
      <div className="flex gap-2">
        <input id="pbi-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="input flex-1 font-mono text-xs" />
        <button onClick={copy} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50">{copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />} {copied ? t("tel.copied") : t("tel.copy")}</button>
        <button onClick={() => window.confirm(t("pbi.regenConfirm")) && regen.mutate()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50"><RefreshCw size={14} /> {t("tel.regen")}</button>
      </div>
      <details className="mt-3 text-xs text-slate-600">
        <summary className="cursor-pointer select-none font-medium text-slate-700">{t("pbi.howTitle")}</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>{t("pbi.how1")}</li>
          <li>{t("pbi.how2")}</li>
          <li>{t("pbi.how3")}</li>
          <li>{t("pbi.how4")}</li>
          <li>{t("pbi.how5")}</li>
        </ol>
      </details>
      <p className="mt-2 text-xs text-slate-400">{t("pbi.secret")}</p>
    </div>
  );
}
