import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { fetchCrmStatus, searchCrmContracts, type CrmContract } from "../api/crm";
import { formatMoney } from "../utils/format";

const money = (n: number | null) => (n === null ? "—" : `${formatMoney(String(Math.round(n)))} so'm`);

/** Ogohlantirish xati shaklida: CRM portfelidan mijoz/shartnomani tanlash. */
export function CrmContractPicker({ onSelect, overdueOnly = true }: { onSelect: (c: CrmContract) => void; overdueOnly?: boolean }) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const status = useQuery({ queryKey: ["crm", "status"], queryFn: fetchCrmStatus, staleTime: 5 * 60_000 });

  useEffect(() => {
    const id = setTimeout(() => setQ(text), 300);
    return () => clearTimeout(id);
  }, [text]);

  const list = useQuery({
    queryKey: ["crm", "contracts", q, overdueOnly],
    queryFn: () => searchCrmContracts(q, overdueOnly),
    enabled: !!status.data?.enabled && open,
    retry: false,
  });

  if (!status.data?.enabled) return null;

  return (
    <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
      <div className="mb-2 text-sm font-semibold text-sky-900">CRM'dan tanlash{!overdueOnly && <span className="ml-2 text-xs font-normal text-slate-500">ixtiyoriy - qo'lda ham yozish mumkin</span>}</div>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={overdueOnly ? "Mijoz nomi yoki shartnoma raqami bo'yicha qidiring (kechikkanlar)" : "Mijoz nomi yoki shartnoma raqami bo'yicha qidiring (ixtiyoriy)"}
          className="input pl-9"
        />
      </div>
      {open && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {list.isLoading && <div className="px-3 py-3 text-sm text-slate-500">Yuklanmoqda...</div>}
          {list.isError && <div className="px-3 py-3 text-sm text-rose-600">CRM'dan ma'lumot olib bo'lmadi.</div>}
          {list.data?.length === 0 && <div className="px-3 py-3 text-sm text-slate-500">{overdueOnly ? "Kechikkan shartnoma topilmadi." : "Mijoz topilmadi."}</div>}
          {list.data?.map((c) => (
            <button
              key={`${c.organization}-${c.contractId}`}
              type="button"
              onClick={() => { onSelect(c); setOpen(false); setText(""); }}
              className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-sky-50"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-800">{c.clientName}</span>
                <span className="block text-xs text-slate-500">№ {c.contractNumber ?? "—"}{c.contractDate ? ` · ${new Date(c.contractDate).toLocaleDateString("uz-UZ")}` : ""}</span>
              </span>
              <span className="shrink-0 text-right">
                {overdueOnly || (c.overdueAmount ?? 0) > 0 ? (
                  <>
                    <span className="block text-xs font-semibold text-rose-600">{money(c.overdueAmount)}</span>
                    <span className="block text-xs text-slate-500">{c.dpd ?? 0} kun</span>
                  </>
                ) : (
                  <span className="block text-xs text-slate-500">{c.clientType === "ORGANIZATION" ? "Kompaniya" : "Fuqaro"}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
