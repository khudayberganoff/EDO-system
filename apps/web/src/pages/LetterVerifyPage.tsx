import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, FileText, Download } from "lucide-react";
import { apiClient } from "../api/client";
import { useLanguage } from "../i18n/LanguageContext";
import { LANGUAGES } from "../i18n/translations";

async function fetchVerify(id: string, token: string) {
  const { data } = await apiClient.get(`/letters/verify/${id}`, { params: { token } });
  return data;
}

export function LetterVerifyPage() {
  const { language, setLanguage, t } = useLanguage();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["letters", "verify", id, token],
    queryFn: () => fetchVerify(id!, token),
    enabled: !!id && !!token,
    retry: false,
  });

  return (
    <div className="min-h-screen bg-[#F4F6F5] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex justify-center gap-1">
          {LANGUAGES.map((item) => (
            <button
              key={item.code}
              onClick={() => setLanguage(item.code)}
              className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
                language === item.code ? "bg-white text-brand-800 shadow-sm" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {item.short}
            </button>
          ))}
        </div>
        <div className="mb-6 flex justify-center">
          <img src="/assets/wafa-logo.png" alt="WAFA" className="h-auto w-[220px] object-contain" />
        </div>

        {isLoading && (
          <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">{t("verify.checking")}</div>
        )}

        {!isLoading && (isError || !data) && (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <XCircle className="mx-auto mb-3 text-rose-500" size={40} />
            <h1 className="text-lg font-semibold text-slate-900">{t("verify.invalidTitle")}</h1>
            <p className="mt-2 text-sm text-slate-500">
              {t("verify.invalidText")}
            </p>
          </div>
        )}

        {!isLoading && data && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="flex items-center gap-3 bg-emerald-50 px-6 py-4">
              <CheckCircle2 className="text-emerald-600" size={28} />
              <div>
                <p className="text-sm font-semibold text-emerald-800">{t("verify.validTitle")}</p>
                <p className="text-xs text-emerald-700">{t("verify.validSubtitle")}</p>
              </div>
            </div>

            <div className="space-y-4 p-6">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <FileText size={16} />
                {t(`letters.type.${data.type}` as any)}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-xs uppercase tracking-wide text-slate-400">{t("letters.colNumber")}</p><p className="mt-0.5 font-medium text-slate-900">№ {data.documentNumber}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-slate-400">{t("letters.colDate")}</p><p className="mt-0.5 font-medium text-slate-900">{new Date(data.documentDate).toLocaleDateString("uz-UZ")}</p></div>
                <div className="col-span-2"><p className="text-xs uppercase tracking-wide text-slate-400">{t("letters.colTo")}</p><p className="mt-0.5 font-medium text-slate-900">{data.counterpartyName}</p>{data.counterpartyAddress && <p className="text-xs text-slate-500">{data.counterpartyAddress}</p>}</div>
                <div className="col-span-2"><p className="text-xs uppercase tracking-wide text-slate-400">{t("verify.approvedAt")}</p><p className="mt-0.5 font-medium text-slate-900">{data.approvedAt ? new Date(data.approvedAt).toLocaleString("uz-UZ") : "—"}</p></div>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><span className="font-medium text-slate-700">{t("letters.colSummary")}: </span>{data.summary}</div>

              <div className="whitespace-pre-wrap rounded-lg border border-slate-100 p-4 text-sm leading-relaxed text-slate-800">{data.bodyText}</div>

              {data.finalFileUrl && (
                <a
                  href={`${(import.meta as any).env.VITE_API_URL ?? ""}${data.finalFileUrl}`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-800 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700"
                >
                  <Download size={16} /> {t("verify.downloadCopy")}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
