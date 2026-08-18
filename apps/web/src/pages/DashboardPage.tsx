import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchDocuments } from "../api/documents";
import { useAuth } from "../context/AuthContext";
import { FileText, Clock, CheckCircle2, AlertCircle } from "lucide-react";

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ["documents", "dashboard"], queryFn: () => fetchDocuments({ page: 1 }) });

  const documents = data?.items ?? [];
  const inReview = documents.filter((d) => d.status === "IN_REVIEW").length;
  const pendingSignature = documents.filter((d) => d.status === "PENDING_SIGNATURE").length;
  const signed = documents.filter((d) => d.status === "SIGNED").length;

  const today = new Date().toLocaleDateString("uz-UZ", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="p-8">
      <div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900 to-brand-700 p-6 text-white">
        <p className="text-xs uppercase tracking-wide text-white/60">Xayrli kun</p>
        <h1 className="mt-1 text-2xl font-semibold">Assalomu alaykum, {user?.fullName}!</h1>
        <p className="mt-1 text-sm text-white/70">{today}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FileText} label="Jami hujjatlar" value={data?.total ?? 0} onClick={() => navigate("/documents")} />
        <StatCard icon={Clock} label="Ko'rib chiqilmoqda" value={inReview} accent="text-amber-600 bg-amber-50" onClick={() => navigate("/documents?status=IN_REVIEW")} />
        <StatCard icon={AlertCircle} label="Imzo kutilmoqda" value={pendingSignature} accent="text-sky-600 bg-sky-50" onClick={() => navigate("/documents?status=PENDING_SIGNATURE")} />
        <StatCard icon={CheckCircle2} label="Imzolangan" value={signed} accent="text-emerald-600 bg-emerald-50" onClick={() => navigate("/documents?status=SIGNED")} />
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent = "text-brand-700 bg-brand-50",
  onClick,
}: {
  icon: typeof FileText;
  label: string;
  value: number;
  accent?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-300"
    >
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
        <Icon size={18} />
      </div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </button>
  );
}
