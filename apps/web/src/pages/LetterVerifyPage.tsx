import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, FileText, Download } from "lucide-react";
import { apiClient } from "../api/client";

async function fetchVerify(id: string, token: string) {
  const { data } = await apiClient.get(`/letters/verify/${id}`, { params: { token } });
  return data;
}

const TYPE_LABELS: Record<string, string> = { LETTER: "Xat", FIRST_WARNING: "1-ogohlantirish xati", FINAL_WARNING: "Yakuniy ogohlantirish xati", REFERENCE: "Ma'lumotnoma" };

export function LetterVerifyPage() {
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
        <div className="mb-6 flex justify-center">
          <img src="/assets/wafa-logo.png" alt="WAFA" className="h-auto w-[220px] object-contain" />
        </div>

        {isLoading && (
          <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">Tekshirilmoqda...</div>
        )}

        {!isLoading && (isError || !data) && (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <XCircle className="mx-auto mb-3 text-rose-500" size={40} />
            <h1 className="text-lg font-semibold text-slate-900">Hujjat tasdiqlanmadi</h1>
            <p className="mt-2 text-sm text-slate-500">
              Bu QR kod noto'g'ri, eskirgan yoki hujjat tizimda topilmadi. Iltimos, hujjatni qayta tekshiring yoki tashkilot bilan bog'laning.
            </p>
          </div>
        )}

        {!isLoading && data && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="flex items-center gap-3 bg-emerald-50 px-6 py-4">
              <CheckCircle2 className="text-emerald-600" size={28} />
              <div>
                <p className="text-sm font-semibold text-emerald-800">Hujjat tasdiqlangan va haqiqiy</p>
                <p className="text-xs text-emerald-700">WAFA LEASING elektron hujjat aylanish tizimida ro'yxatdan o'tgan</p>
              </div>
            </div>

            <div className="space-y-4 p-6">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <FileText size={16} />
                {TYPE_LABELS[data.type] ?? data.type}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-xs uppercase tracking-wide text-slate-400">Raqami</p><p className="mt-0.5 font-medium text-slate-900">№ {data.documentNumber}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-slate-400">Sana</p><p className="mt-0.5 font-medium text-slate-900">{new Date(data.documentDate).toLocaleDateString("uz-UZ")}</p></div>
                <div className="col-span-2"><p className="text-xs uppercase tracking-wide text-slate-400">Kimga</p><p className="mt-0.5 font-medium text-slate-900">{data.counterpartyName}</p>{data.counterpartyAddress && <p className="text-xs text-slate-500">{data.counterpartyAddress}</p>}</div>
                <div className="col-span-2"><p className="text-xs uppercase tracking-wide text-slate-400">Tasdiqlangan sana</p><p className="mt-0.5 font-medium text-slate-900">{data.approvedAt ? new Date(data.approvedAt).toLocaleString("uz-UZ") : "—"}</p></div>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><span className="font-medium text-slate-700">Qisqacha mazmuni: </span>{data.summary}</div>

              <div className="whitespace-pre-wrap rounded-lg border border-slate-100 p-4 text-sm leading-relaxed text-slate-800">{data.bodyText}</div>

              {data.finalFileUrl && (
                <a
                  href={`${(import.meta as any).env.VITE_API_URL ?? ""}${data.finalFileUrl}`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-800 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700"
                >
                  <Download size={16} /> Elektron nusxasini yuklab olish
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
