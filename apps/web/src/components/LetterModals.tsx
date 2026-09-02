import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, FileText } from "lucide-react";
import clsx from "clsx";
import { fetchLetterRenderedText, rejectLetter, updateLetterBody, downloadLetterPdf } from "../api/letters";
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
/**
 * Xatni ASL BLANK ko'rinishida ko'rsatadi: server hujjatni shakllantirib
 * PDF ga aylantiradi, oyna ichida esa o'sha PDF ochiladi.
 * Shu sababli ekranda ko'rinayotgan narsa chop etiladigan hujjatning aynan o'zi.
 */
export function ViewLetterModal({ letter, onClose }: { letter: any; onClose: () => void }) {
  const t = useT();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Zaxira variant: blank ochilmasa - hujjat matnini ko'rsatamiz
  const { data: rendered } = useQuery({
    queryKey: ["letters", letter.id, "rendered-text"],
    queryFn: () => fetchLetterRenderedText(letter.id),
    enabled: failed,
    retry: false,
  });

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    downloadLetterPdf(letter.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [letter.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sarlavha */}
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-brand-950">
              № {letter.documentNumber} — {letter.counterpartyName}
            </h2>
            <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              {new Date(letter.documentDate).toLocaleDateString("uz-UZ")}
              <LetterStatusPill status={letter.status} />
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 transition hover:text-slate-600"><X size={20} /></button>
        </div>

        {letter.rejectionReason && (
          <div className="border-b border-rose-100 bg-rose-50 px-6 py-3 text-sm text-rose-800">
            <span className="font-medium">{t("letters.rejectReason")}: </span>{letter.rejectionReason}
          </div>
        )}

        {/* Hujjat ko'rinishi */}
        <div className="flex-1 overflow-hidden bg-slate-100 p-4">
          {!pdfUrl && !failed && (
            <div className="flex h-[560px] items-center justify-center text-sm text-slate-400">
              {t("letters.previewLoading")}
            </div>
          )}

          {pdfUrl && (
            <iframe
              title={t("letters.preview")}
              src={`${pdfUrl}#toolbar=0&navpanes=0&view=FitH`}
              className="h-[560px] w-full rounded-lg border border-slate-200 bg-white"
            />
          )}

          {failed && (
            <div className="h-[560px] overflow-y-auto rounded-lg border border-slate-200 bg-white p-8">
              <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t("letters.previewFallback")}
              </p>
              <div className="space-y-3 text-sm leading-relaxed text-slate-800">
                {rendered?.length
                  ? rendered.map((line: string, i: number) => <p key={i}>{line}</p>)
                  : <p className="whitespace-pre-wrap">{letter.bodyText || "—"}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Pastki qator */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3">
          <p className="max-w-[60%] truncate text-xs text-slate-500">
            <span className="font-medium text-slate-600">{t("letters.colSummary")}: </span>{letter.summary}
          </p>
          {pdfUrl && (
            <a
              href={pdfUrl}
              download={`xat-${letter.documentNumber}.pdf`}
              className="rounded-lg bg-brand-800 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-700"
            >
              {t("letters.download")} PDF
            </a>
          )}
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


/**
 * Xat matnini tahrirlash oynasi - konstruktor.
 * Bu yerda yozilgan matn Word blankasidagi {matn} tegi o'rniga joylashadi.
 */
export function EditLetterModal({ letter, onClose }: { letter: any; onClose: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [bodyText, setBodyText] = useState<string>(letter.bodyText ?? "");
  const [summary, setSummary] = useState<string>(letter.summary ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => updateLetterBody(letter.id, { bodyText, summary }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["letters"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      onClose();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      setError(typeof msg === "string" ? msg : "Saqlab bo'lmadi.");
    },
  });

  const paragraphs = bodyText.split(/\n+/).filter((x) => x.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-brand-950">{t("letters.editTitle")}</h2>
            <p className="mt-1 text-xs text-slate-500">№ {letter.documentNumber} — {letter.counterpartyName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Chap: yozish maydoni */}
          <div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">{t("letters.colSummary")}</span>
              <input value={summary} onChange={(e) => setSummary(e.target.value)} className="input" />
            </label>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">{t("letters.bodyLabel")}</span>
              <textarea
                autoFocus
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={16}
                placeholder={t("letters.bodyPlaceholder")}
                className="input font-sans leading-relaxed"
              />
            </label>
            <p className="mt-1.5 text-xs text-slate-400">{t("letters.bodyHint")}</p>
          </div>

          {/* O'ng: qanday ko'rinishi */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <FileText size={14} className="text-brand-700" /> {t("letters.preview")}
            </p>
            <div className="h-[430px] overflow-y-auto rounded-xl border border-slate-200 bg-[#FCFCFB] p-6">
              <div className="mb-4 flex justify-between text-[13px] text-slate-500">
                <span>№ {letter.documentNumber}</span>
                <span>{new Date(letter.documentDate).toLocaleDateString("uz-UZ")}</span>
              </div>
              <p className="mb-4 text-[13px] text-slate-700">
                <span className="font-medium">{letter.counterpartyName}</span>
                {letter.counterpartyAddress && <><br /><span className="text-slate-500">{letter.counterpartyAddress}</span></>}
              </p>
              <div className="space-y-3 text-[13px] leading-relaxed text-slate-800">
                {paragraphs.length ? (
                  paragraphs.map((line, i) => <p key={i} className="indent-6 text-justify">{line}</p>)
                ) : (
                  <p className="text-slate-300">{t("letters.previewEmpty")}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm">{t("letterForm.cancel")}</button>
          <button
            disabled={mutation.isPending || !bodyText.trim()}
            onClick={() => mutation.mutate()}
            className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {t("letterForm.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
