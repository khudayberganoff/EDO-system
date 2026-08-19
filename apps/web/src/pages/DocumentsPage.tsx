import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, X, Mail, Eye, FileText, CheckCircle2, Clock, ArrowRight, Check, XCircle } from "lucide-react";
import { fetchDocuments, createDocument, fetchDocument } from "../api/documents";
import { fetchLetters, approveLetter } from "../api/letters";
import { StatusBadge } from "../components/StatusBadge";
import { useT } from "../i18n/LanguageContext";
import { ViewLetterModal, RejectLetterModal, LetterStatusPill } from "../components/LetterModals";
import { useAuth } from "../context/AuthContext";
import type { DocumentType } from "@edo/shared-types";
import { DocumentStatus, LetterStatus } from "@edo/shared-types";

const STATUS_FILTERS: { value: DocumentStatus | ""; labelKey: string }[] = [
  { value: "", labelKey: "documents.all" },
  { value: DocumentStatus.DRAFT, labelKey: "documents.draft" },
  { value: DocumentStatus.IN_REVIEW, labelKey: "documents.inReview" },
  { value: DocumentStatus.PENDING_SIGNATURE, labelKey: "documents.pendingSignature" },
  { value: DocumentStatus.SIGNED, labelKey: "documents.signed" },
  { value: DocumentStatus.REJECTED, labelKey: "documents.rejected" },
  { value: DocumentStatus.ARCHIVED, labelKey: "documents.archived" },
];

export function DocumentsPage() {
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = (searchParams.get("status") as DocumentStatus | null) ?? "";
  const [showCreate, setShowCreate] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [viewLetter, setViewLetter] = useState<any | null>(null);
  const [rejectLetterTarget, setRejectLetterTarget] = useState<any | null>(null);
  const { user } = useAuth();
  const queryClientLocal = useQueryClient();
  const canApprove = user?.role === "ADMIN" || user?.role === "MANAGER";
  const approveLetterMutation = useMutation({
    mutationFn: approveLetter,
    onSuccess: () => {
      queryClientLocal.invalidateQueries({ queryKey: ["letters"] });
      queryClientLocal.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["documents", status],
    queryFn: () => fetchDocuments({ status: status || undefined, page: 1 }),
  });

  // Xat modulida yaratilgan xatlar ham shu ro'yxatda ko'rinadi. Xat holatlari
  // hujjat holatlariga moslashtiriladi, shunda "Qoralama", "Imzo kutilmoqda" va
  // "Imzolangan" bo'limlarida ikkala modul birga ko'rinadi.
  // (O'chirilgan xatlar bu yerga tushmaydi - ular "Fayllar arxivi"da.)
  const LETTER_TO_DOC_STATUS: Record<string, DocumentStatus> = {
    [LetterStatus.DRAFT]: DocumentStatus.DRAFT,
    [LetterStatus.PENDING_APPROVAL]: DocumentStatus.PENDING_SIGNATURE,
    [LetterStatus.ARCHIVED]: DocumentStatus.SIGNED,
  };

  const { data: lettersData, isLoading: lettersLoading } = useQuery({
    queryKey: ["letters", "all-for-documents"],
    queryFn: () => fetchLetters({}),
  });

  const visibleLetters = (lettersData?.items ?? []).filter((letter: any) => {
    const mapped = LETTER_TO_DOC_STATUS[letter.status];
    if (!mapped) return false; // moslik yo'q (masalan o'chirilgan) - ko'rsatmaymiz
    return status === "" || mapped === status;
  });

  const isLoadingCombined = isLoading || lettersLoading;
  const totalCombined = (data?.items.length ?? 0) + visibleLetters.length;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{t("documents.title")}</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus size={16} />
          {t("documents.new")}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setSearchParams(f.value ? { status: f.value } : {})}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              status === f.value ? "bg-brand-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            } border border-slate-200`}
          >
            {t(f.labelKey as any)}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("documents.colTitle")}</th>
              <th className="px-4 py-3">{t("documents.colType")}</th>
              <th className="px-4 py-3">{t("documents.colOwner")}</th>
              <th className="px-4 py-3">{t("documents.colStatus")}</th>
              <th className="px-4 py-3">{t("documents.colUpdated")}</th>
              <th className="px-4 py-3">{t("letters.colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoadingCombined && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  {t("documents.loading")}
                </td>
              </tr>
            )}
            {!isLoadingCombined && totalCombined === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  {t("documents.empty")}
                </td>
              </tr>
            )}
            {data?.items.map((doc: any) => (
              <tr key={doc.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link to={`/documents/${doc.id}`} className="font-medium text-brand-800 hover:underline">
                    {doc.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{doc.type}</td>
                <td className="px-4 py-3 text-slate-500">{doc.owner?.fullName ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={doc.status} />
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(doc.updatedAt).toLocaleDateString("uz-UZ")}
                </td>
                <td className="px-4 py-3">
                  <button
                    title={t("documents.quickPreview")}
                    onClick={() => setPreviewId(doc.id)}
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-800"
                  >
                    <Eye size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {visibleLetters.map((letter: any) => (
              <tr key={`letter-${letter.id}`} className="bg-sky-50/40 hover:bg-sky-50">
                <td className="px-4 py-3">
                  <button onClick={() => setViewLetter(letter)} className="flex items-center gap-1.5 text-left font-medium text-brand-800 hover:underline">
                    <Mail size={14} className="text-sky-600" />
                    {letter.counterpartyName} — № {letter.documentNumber}
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-500">{t(`letters.type.${letter.type}` as any)}</td>
                <td className="px-4 py-3 text-slate-500">{letter.createdBy?.fullName ?? "—"}</td>
                <td className="px-4 py-3">
                  <LetterStatusPill status={letter.status} />
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(letter.updatedAt).toLocaleDateString("uz-UZ")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button title={t("letters.view")} onClick={() => setViewLetter(letter)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Eye size={16} /></button>
                    {canApprove && letter.status === "PENDING_APPROVAL" && (
                      <>
                        <button title={t("letters.approve")} onClick={() => approveLetterMutation.mutate(letter.id)} className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"><Check size={16} /></button>
                        <button title={t("letters.reject")} onClick={() => setRejectLetterTarget(letter)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><XCircle size={16} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateDocumentModal onClose={() => setShowCreate(false)} />}
      {previewId && <DocumentPreviewModal id={previewId} onClose={() => setPreviewId(null)} />}
      {viewLetter && <ViewLetterModal letter={viewLetter} onClose={() => setViewLetter(null)} />}
      {rejectLetterTarget && <RejectLetterModal letter={rejectLetterTarget} onClose={() => setRejectLetterTarget(null)} />}
    </div>
  );
}

function CreateDocumentModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<DocumentType>("CONTRACT" as DocumentType);
  const [contractRefId, setContractRefId] = useState("");

  const mutation = useMutation({
    mutationFn: () => createDocument({ title, type, contractRefId: contractRefId || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Yangi hujjat yaratish</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Sarlavha</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Murobaha shartnomasi №..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Turi</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as DocumentType)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600"
            >
              <option value="CONTRACT">Shartnoma</option>
              <option value="INVOICE">Hisob-faktura</option>
              <option value="ORDER">Buyruq</option>
              <option value="APPLICATION">Ariza</option>
              <option value="OTHER">Boshqa</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              CRM shartnoma ID (ixtiyoriy)
            </label>
            <input
              value={contractRefId}
              onChange={(e) => setContractRefId(e.target.value)}
              placeholder="CRM-CONTRACT-045"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600"
            />
          </div>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full rounded-lg bg-brand-800 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            Yaratish
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * "Tasdiqlashim kerak" bo'limida hujjat bilan qisqacha tanishib chiqish oynasi.
 * To'liq sahifaga o'tmasdan turib: asosiy ma'lumotlar, fayl versiyalari va
 * tasdiqlash bosqichlarining holati ko'rinadi.
 */
function DocumentPreviewModal({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT();
  const { data, isLoading } = useQuery({ queryKey: ["documents", id], queryFn: () => fetchDocument(id) });
  const doc = data as any;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {isLoading || !doc ? (
          <p className="py-10 text-center text-slate-400">{t("documents.loading")}</p>
        ) : (
          <>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{doc.title}</h2>
                <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <FileText size={13} /> {doc.type}
                  {doc.contractRefId && <span>· CRM: {doc.contractRefId}</span>}
                </p>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">{t("documents.colOwner")}</p>
                <p className="mt-0.5 font-medium text-slate-800">{doc.owner?.fullName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">{t("documents.colStatus")}</p>
                <div className="mt-1"><StatusBadge status={doc.status} /></div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">{t("documents.colUpdated")}</p>
                <p className="mt-0.5 font-medium text-slate-800">{new Date(doc.updatedAt).toLocaleString("uz-UZ")}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">{t("documents.versions")}</p>
                <p className="mt-0.5 font-medium text-slate-800">{doc.versions?.length ?? 0}</p>
              </div>
            </div>

            {/* Tasdiqlash bosqichlari - har bir etapning holati */}
            {doc.workflows?.[0]?.steps?.length > 0 && (
              <div className="mb-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("documents.approvalSteps")}</p>
                <div className="space-y-2">
                  {doc.workflows[0].steps.map((step: any, i: number) => {
                    const done = step.status === "APPROVED";
                    const rejected = step.status === "REJECTED";
                    return (
                      <div key={step.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2.5 text-sm">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${done ? "bg-emerald-100 text-emerald-700" : rejected ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"}`}>
                          {done ? <CheckCircle2 size={14} /> : rejected ? <X size={14} /> : i + 1}
                        </span>
                        <span className="flex-1 text-slate-700">{step.approver?.fullName ?? "—"}</span>
                        <span className={`flex items-center gap-1 text-xs ${done ? "text-emerald-600" : rejected ? "text-rose-600" : "text-slate-400"}`}>
                          {!done && !rejected && <Clock size={12} />}
                          {done ? t("documents.stepApproved") : rejected ? t("documents.stepRejected") : t("documents.stepWaiting")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Oxirgi versiya fayli */}
            {doc.versions?.[0]?.fileUrl && (
              <a
                href={`${(import.meta as any).env.VITE_API_URL ?? ""}${doc.versions[0].fileUrl}`}
                className="mb-3 flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <FileText size={15} /> {t("letters.download")}
              </a>
            )}

            <Link
              to={`/documents/${doc.id}`}
              className="flex items-center justify-center gap-2 rounded-lg bg-brand-800 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {t("documents.openFull")} <ArrowRight size={15} />
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
