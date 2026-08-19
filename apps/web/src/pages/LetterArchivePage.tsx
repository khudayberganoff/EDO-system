import { useQuery } from "@tanstack/react-query";
import { Archive, Download, FileText, QrCode, Trash2 } from "lucide-react";
import { downloadLetter, downloadLetterPdf, fetchArchive } from "../api/letters";
import { useT } from "../i18n/LanguageContext";

export function LetterArchivePage() {
  const t = useT();
  const { data, isLoading } = useQuery({ queryKey: ["letters", "archive"], queryFn: fetchArchive });
  const download = async (id: string, name: string) => {
    try {
      const blob = await downloadLetter(id, "final");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { alert("Faylni yuklab bo'lmadi."); }
  };
  const downloadPdf = async (id: string, num: string) => {
    try {
      const blob = await downloadLetterPdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `xat-${num}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { alert("PDF yuklab bo'lmadi."); }
  };
  return <div className="p-8"><div className="mb-6 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-800"><Archive size={20}/></div><div><h1 className="text-xl font-semibold">{t("archive.title")}</h1><p className="text-sm text-slate-500">{t("archive.subtitle")}</p></div></div><div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">{t("letters.colNumber")}</th><th className="px-4 py-3">{t("letters.colTo")}</th><th className="px-4 py-3">{t("letters.colStatus")}</th><th className="px-4 py-3">{t("letters.colDate")}</th><th className="px-4 py-3">{t("archive.colFile")}</th></tr></thead><tbody className="divide-y divide-slate-100">{isLoading ? <tr><td colSpan={5} className="px-4 py-8 text-center">{t("documents.loading")}</td></tr> : data?.map((x:any)=>{
    const isDeleted = x.status === "DELETED";
    return <tr key={x.id}>
      <td className="px-4 py-4">№ {x.documentNumber}</td>
      <td className="px-4 py-4 font-medium">{x.counterpartyName}</td>
      <td className="px-4 py-4">{isDeleted ? <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"><Trash2 size={12}/> {t("archive.deleted")}</span> : <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800"><QrCode size={12}/> {t("archive.approved")}</span>}</td>
      <td className="px-4 py-4 text-slate-500">{x.approvedAt ? new Date(x.approvedAt).toLocaleString("uz-UZ") : new Date(x.updatedAt).toLocaleString("uz-UZ")}</td>
      <td className="px-4 py-4">{!isDeleted ? <div className="flex gap-2">
        <button onClick={()=>download(x.id, `xat-${x.documentNumber}.docx`)} className="flex items-center gap-1.5 rounded-lg bg-brand-800 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700"><Download size={13}/> Word</button>
        <button onClick={()=>downloadPdf(x.id, x.documentNumber)} className="flex items-center gap-1.5 rounded-lg border border-brand-800 px-3 py-2 text-xs font-medium text-brand-800 hover:bg-brand-50"><FileText size={13}/> PDF</button>
      </div> : <span className="text-slate-400">—</span>}</td>
    </tr>;
  })}</tbody></table></div></div>;
}
