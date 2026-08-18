import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, FileSignature, FileText } from "lucide-react";
import { fetchDocument, approveStep, rejectStep, signDocument } from "../api/documents";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: document, isLoading } = useQuery({
    queryKey: ["documents", id],
    queryFn: () => fetchDocument(id!),
    enabled: !!id,
  });

  const approveMutation = useMutation({
    mutationFn: (stepId: string) => approveStep(stepId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents", id] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (stepId: string) => rejectStep(stepId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents", id] }),
  });

  const signMutation = useMutation({
    mutationFn: () => signDocument(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents", id] }),
  });

  if (isLoading || !document) {
    return <div className="p-8 text-slate-400">Yuklanmoqda...</div>;
  }

  const doc = document as any;
  const latestVersion = doc.versions?.[0];
  const canSign = doc.status === "PENDING_SIGNATURE";

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{doc.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {doc.type} {doc.contractRefId && `· CRM: ${doc.contractRefId}`}
          </p>
        </div>
        <StatusBadge status={doc.status} />
      </div>

      {canSign && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 p-4">
          <div className="flex items-center gap-3 text-sky-800">
            <FileSignature size={20} />
            <span className="text-sm font-medium">Hujjat imzo qo'yishga tayyor</span>
          </div>
          <button
            onClick={() => signMutation.mutate()}
            disabled={signMutation.isPending}
            className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-60"
          >
            Elektron imzo bilan imzolash
          </button>
        </div>
      )}

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Fayl versiyalari</h2>
        {latestVersion ? (
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <FileText size={16} className="text-slate-400" />
            <span>
              v{latestVersion.versionNumber} — {latestVersion.fileName}
            </span>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Hali fayl yuklanmagan.</p>
        )}
      </section>

      {doc.workflow && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Tasdiqlash zanjiri</h2>
          <ol className="space-y-3">
            {doc.workflow.steps.map((step: any) => {
              const isMine = step.approver?.id === user?.id;
              const isPending = step.status === "PENDING";
              return (
                <li
                  key={step.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                      {step.order}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{step.approver?.fullName}</p>
                      <p className="text-xs text-slate-400">{step.status}</p>
                    </div>
                  </div>

                  {isMine && isPending && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => approveMutation.mutate(step.id)}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        <CheckCircle2 size={14} />
                        Tasdiqlash
                      </button>
                      <button
                        onClick={() => rejectMutation.mutate(step.id)}
                        className="flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                      >
                        <XCircle size={14} />
                        Rad etish
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
