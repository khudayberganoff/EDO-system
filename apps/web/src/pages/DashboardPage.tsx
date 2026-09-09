import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchDocuments } from "../api/documents";
import { fetchLetters } from "../api/letters";
import { LetterStatus } from "@edo/shared-types";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n/LanguageContext";
import { FileText, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { formatUzGregorian, formatHijri } from "../utils/hijriDate";
import { DailyPlanner } from "../components/DailyPlanner";

export function DashboardPage() {
  const { user } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  // Har bir katak uchun alohida so'rov - server umumiy sonni (total) qaytaradi,
  // shuning uchun bir sahifadagi elementlarni sanashdan ko'ra ishonchliroq.
  const useCount = (key: string, status?: string) =>
    useQuery({
      queryKey: ["documents", "count", key],
      queryFn: () => fetchDocuments({ status, page: 1 }),
    }).data?.total ?? 0;

  const totalAll = useCount("all");
  const archivedCount = useCount("archived", "ARCHIVED");
  const inReview = useCount("inReview", "IN_REVIEW");
  const pendingSignatureDocs = useCount("pendingSignature", "PENDING_SIGNATURE");
  const signed = useCount("signed", "SIGNED");

  // Rahbariyat tasdig'ini kutayotgan xatlar ham "Imzo kutilmoqda" hisobiga kiradi
  const { data: pendingLetters } = useQuery({
    queryKey: ["letters", "pending-approval-dashboard"],
    queryFn: () => fetchLetters({ status: LetterStatus.PENDING_APPROVAL as any }),
  });
  const pendingLettersCount = pendingLetters?.items?.length ?? 0;

  // "Jami hujjatlar" - arxivlangan (o'chirilgan) hujjatlardan tashqari hammasi
  const totalActive = Math.max(0, totalAll - archivedCount) + pendingLettersCount;
  const pendingSignature = pendingSignatureDocs + pendingLettersCount;

  const now = new Date();
  const today = formatUzGregorian(now);
  const todayHijri = formatHijri(now);

  return (
    <div className="p-8">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-sky-600">{t("dashboard.greeting")}</p>
        <h1 className="mt-1 text-[26px] font-semibold text-slate-900">{t("dashboard.hello")}, {user?.fullName}!</h1>
        <p className="mt-1 text-sm text-slate-500">{today} <span className="text-slate-300">•</span> {todayHijri}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FileText} label={t("dashboard.totalDocuments")} value={totalActive} onClick={() => navigate("/documents")} />
        <StatCard icon={Clock} label={t("dashboard.inReview")} value={inReview} accent="text-amber-600 bg-amber-50" onClick={() => navigate("/documents?status=IN_REVIEW")} />
        <StatCard icon={AlertCircle} label={t("dashboard.pendingSignature")} value={pendingSignature} accent="text-sky-600 bg-sky-50" onClick={() => navigate("/documents?status=PENDING_SIGNATURE")} />
        <StatCard icon={CheckCircle2} label={t("dashboard.signed")} value={signed} accent="text-emerald-600 bg-emerald-50" onClick={() => navigate("/documents?status=SIGNED")} />
      </div>

      <DailyPlanner />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent = "text-sky-700 bg-sky-50",
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
      className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-300"
    >
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
        <Icon size={18} />
      </div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </button>
  );
}
