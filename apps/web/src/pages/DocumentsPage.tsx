import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, X, Mail } from "lucide-react";
import { fetchDocuments, createDocument } from "../api/documents";
import { fetchLetters } from "../api/letters";
import { StatusBadge } from "../components/StatusBadge";
import type { DocumentType } from "@edo/shared-types";
import { DocumentStatus, LetterStatus } from "@edo/shared-types";

const STATUS_FILTERS: { value: DocumentStatus | ""; label: string }[] = [
  { value: "", label: "Barchasi" },
  { value: DocumentStatus.DRAFT, label: "Qoralama" },
  { value: DocumentStatus.IN_REVIEW, label: "Ko'rib chiqilmoqda" },
  { value: DocumentStatus.PENDING_SIGNATURE, label: "Imzo kutilmoqda" },
  { value: DocumentStatus.SIGNED, label: "Imzolangan" },
  { value: DocumentStatus.REJECTED, label: "Rad etilgan" },
  { value: DocumentStatus.ARCHIVED, label: "Arxivlangan" },
];

export function DocumentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = (searchParams.get("status") as DocumentStatus | null) ?? "";
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["documents", status],
    queryFn: () => fetchDocuments({ status: status || undefined, page: 1 }),
  });

  // "Imzo kutilmoqda" tanlanganda, rahbariyat tasdig'ini kutayotgan XATlar ham
  // shu ro'yxatda ko'rinadi (ikkala modul - Hujjatlar va Xat - shu tabda birlashadi)
  const showPendingLetters = status === DocumentStatus.PENDING_SIGNATURE;
  const { data: pendingLettersData, isLoading: lettersLoading } = useQuery({
    queryKey: ["letters", "pending-approval-for-documents"],
    queryFn: () => fetchLetters({ status: LetterStatus.PENDING_APPROVAL as any }),
    enabled: showPendingLetters,
  });
  const pendingLetters = showPendingLetters ? pendingLettersData?.items ?? [] : [];

  const isLoadingCombined = isLoading || (showPendingLetters && lettersLoading);
  const totalCombined = (data?.items.length ?? 0) + pendingLetters.length;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Hujjatlar</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus size={16} />
          Yangi hujjat
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
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Sarlavha</th>
              <th className="px-4 py-3">Turi</th>
              <th className="px-4 py-3">Egasi</th>
              <th className="px-4 py-3">Holati</th>
              <th className="px-4 py-3">Yangilangan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoadingCombined && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Yuklanmoqda...
                </td>
              </tr>
            )}
            {!isLoadingCombined && totalCombined === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Hujjatlar topilmadi.
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
              </tr>
            ))}
            {pendingLetters.map((letter: any) => (
              <tr key={`letter-${letter.id}`} className="bg-sky-50/40 hover:bg-sky-50">
                <td className="px-4 py-3">
                  <Link to="/letters" className="flex items-center gap-1.5 font-medium text-brand-800 hover:underline">
                    <Mail size={14} className="text-sky-600" />
                    {letter.counterpartyName} — № {letter.documentNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">Xat</td>
                <td className="px-4 py-3 text-slate-500">{letter.createdBy?.fullName ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800">
                    Imzo kutilmoqda
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(letter.updatedAt).toLocaleDateString("uz-UZ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateDocumentModal onClose={() => setShowCreate(false)} />}
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
