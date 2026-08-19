import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import clsx from "clsx";
import { fetchLetterRenderedText, rejectLetter } from "../api/letters";
import { useT } from "../i18n/LanguageContext";

const STATUS_KEYS: Record<string, string> = {
  DRAFT: "letters.drafts",
  PENDING_APPROVAL: "letters.pendingApproval",
  APPROVED: "archive.approved",
  REJECTED: "letters.rejected",
  ARCHIVED: "letters.archived",
  DELETED: "archive.deleted",
};

export function LetterStatusPill({ status }: { status: string }) {
  const t = useT();
  const cls =
    status === "ARCHIVED" ? "bg-emerald-100 text-emerald-800"
    : status === "PENDING_APPROVAL" ? "bg-amber-100 text-amber-800"
    : status === "REJECTED" ? "bg-rose-100 text-rose-800"
    : "bg-slate-100 text-slate-700";
  return (
    <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", cls)}>
      {STATUS_KEYS[status] ? t(STATUS_KEYS[status] as any) : status}
    </span>
  );
}

/** Xatni to'liq o'qish oynasi - Word shablonidan olingan haqiqiy matn bilan. */
export function ViewLetterModal({ letter, onClose }: { letter: any; onClose: () => void }) {
  const t = useT();
  const { data: rendered, isLoading: textLoading } = useQuery({
    queryKey: ["letters", letter.id, "rendered-text"],
    queryFn: () => fetchLetterRenderedText(letter.id),
    retry: false,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">№ {letter.documentNumber} — {letter.counterpartyName}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {new Date(letter.documentDate).toLocaleDateString("uz-UZ")} &middot; <LetterStatusPill status={letter.status} />
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        {letter.counterpartyAddress && (
          <p className="mb-3 text-sm text-slate-500">{t("letterForm.address")}: {letter.counterpartyAddress}</p>
        )}

        {letter.rejectionReason && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <span className="font-medium">{t("letters.rejectReason")}: </span>{letter.rejectionReason}
          </div>
        )}

        <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <span className="font-medium text-slate-700">{t("letters.colSummary")}: </span>{letter.summary}
        </div>

        <div className="space-y-2 rounded-lg border border-slate-100 p-4 text-sm leading-relaxed text-slate-800">
          {textLoading && <p className="text-slate-400">{t("documents.loading")}</p>}
          {!textLoading && (rendered?.length
            ? rendered.map((line: string, i: number) => <p key={i}>{line}</p>)
            : <p className="whitespace-pre-wrap">{letter.bodyText || "Matn hali yaratilmagan."}</p>)}
        </div>
      </div>
    </div>
  );
}

/** Rad etish oynasi - sabab yozish majburiy. */
export function RejectLetterModal({ letter, onClose }: { letter: any; onClose: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => rejectLetter(letter.id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["letters"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      onClose();
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Rad etib bo'lmadi."),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{t("letters.rejectTitle")}</h2>
            <p className="mt-1 text-xs text-slate-500">№ {letter.documentNumber} — {letter.counterpartyName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">{t("letters.rejectReason")}</span>
          <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder={t("letters.rejectPlaceholder")} className="input" />
        </label>

        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm">{t("letterForm.cancel")}</button>
          <button
            disabled={mutation.isPending || reason.trim().length < 3}
            onClick={() => mutation.mutate()}
            className="rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t("letters.reject")}
          </button>
        </div>
      </div>
    </div>
  );
}
