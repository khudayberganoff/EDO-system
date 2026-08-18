import { DocumentStatus } from "@edo/shared-types";
import clsx from "clsx";

const STATUS_CONFIG: Record<DocumentStatus, { label: string; className: string }> = {
  [DocumentStatus.DRAFT]: { label: "Qoralama", className: "bg-slate-100 text-slate-700" },
  [DocumentStatus.IN_REVIEW]: { label: "Ko'rib chiqilmoqda", className: "bg-amber-100 text-amber-800" },
  [DocumentStatus.PENDING_SIGNATURE]: { label: "Imzo kutilmoqda", className: "bg-sky-100 text-sky-800" },
  [DocumentStatus.SIGNED]: { label: "Imzolangan", className: "bg-emerald-100 text-emerald-800" },
  [DocumentStatus.REJECTED]: { label: "Rad etilgan", className: "bg-rose-100 text-rose-800" },
  [DocumentStatus.ARCHIVED]: { label: "Arxivlangan", className: "bg-slate-200 text-slate-600" },
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", config.className)}>
      {config.label}
    </span>
  );
}
