import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { AlertTriangle, Check, Eye, FileText, XCircle, Plus, SendHorizontal, Trash2, X, Sparkles, Image as ImageIcon, Upload } from "lucide-react";
import { LetterStatus, LetterType } from "@edo/shared-types";
import clsx from "clsx";
import { aiGenerateLetter, approveLetter, createLetter, deleteLetter, downloadLetter, fetchAiAgentStats, fetchLetterheadStatus, fetchLetters, fetchNextLetterNumber, removeLetterhead, submitLetter, uploadLetterhead, downloadLetterPdf } from "../api/letters";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n/LanguageContext";
import { ViewLetterModal, RejectLetterModal, LetterStatusPill } from "../components/LetterModals";
import { formatUzPhone, normalizeUzPhone, isValidUzPhone, formatMoney, parseMoney } from "../utils/format";

const STATUS_KEYS: Record<string, string> = { DRAFT: "letters.drafts", PENDING_APPROVAL: "letters.pendingApproval", APPROVED: "archive.approved", REJECTED: "letters.rejected", ARCHIVED: "letters.archived", DELETED: "archive.deleted" };

export function LettersPage() {
  const t = useT();
  const { kind } = useParams<{ kind?: string }>();
  // "Ogohlantirish" bo'limi ikkala turni (1-ogohlantirish va yakuniy) birga ko'rsatadi
  const isWarningSection = kind === "warning";
  const selectedType =
    isWarningSection ? LetterType.FIRST_WARNING :
    kind === "reference" ? LetterType.REFERENCE : LetterType.LETTER;
  // "Xat" bo'limi chiquvchi va kiruvchiga bo'lingan
  const direction = kind === "incoming" ? "INCOMING" : kind === "outgoing" ? "OUTGOING" : undefined;
  const [status, setStatus] = useState<string | undefined>();
  const [showCreate, setShowCreate] = useState(false);
  const [viewLetter, setViewLetter] = useState<any | null>(null);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["letters", isWarningSection ? "warnings" : selectedType, status, direction],
    queryFn: () => fetchLetters(isWarningSection
      ? { status: status as any }
      : { type: selectedType, status: status as any, direction: direction as any }),
  });
  // Ogohlantirish bo'limida faqat ikkala ogohlantirish turi qoldiriladi
  const letters = (data?.items ?? []).filter((l: any) =>
    !isWarningSection || l.type === LetterType.FIRST_WARNING || l.type === LetterType.FINAL_WARNING);
  const approve = useMutation({ mutationFn: approveLetter, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["letters"] }) });
  const del = useMutation({ mutationFn: deleteLetter, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["letters"] }) });
  const download = async (id: string, kind: "draft" | "final", documentNumber?: string) => {
    try {
      const blob = await downloadLetter(id, kind);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `xat-${documentNumber ?? id}${kind === "final" ? "" : "-qoralama"}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      alert(e?.response?.status === 404 ? "Fayl topilmadi. Iltimos, qaytadan urinib ko'ring." : "Faylni yuklab bo'lmadi.");
    }
  };
  const downloadPdf = async (id: string, documentNumber?: string) => {
    try {
      const blob = await downloadLetterPdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `xat-${documentNumber ?? id}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { alert("PDF yuklab bo'lmadi."); }
  };
  const canApprove = user?.role === "ADMIN" || user?.role === "MANAGER";

  return <div className="p-8">
    <div className="mb-6 flex items-start justify-between">
      <div><h1 className="font-display text-[30px] font-semibold tracking-tight text-brand-950">{isWarningSection ? t("nav.warnings") : direction ? t(direction === "INCOMING" ? "nav.incoming" : "nav.outgoing") : t(`letters.type.${selectedType}` as any)}</h1><p className="mt-1 text-sm text-slate-500">{isWarningSection ? t("letters.descWarnings") : direction ? t(direction === "INCOMING" ? "letters.descIncoming" : "letters.descOutgoing") : t(`letters.desc.${selectedType}` as any)}</p></div>
      <div className="flex gap-2">
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-brand-800 px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-brand-700"><Plus size={18}/> {t("letters.new")} {(isWarningSection ? t("nav.warnings") : t(`letters.type.${selectedType}` as any)).toLowerCase()}</button>
      </div>
    </div>

    {canApprove && <LetterheadPanel />}

    <div className="mb-5 flex flex-wrap gap-2">
      {[undefined, LetterStatus.DRAFT, LetterStatus.PENDING_APPROVAL].map((s) => <button key={s ?? "all"} onClick={() => setStatus(s)} className={clsx("rounded-full px-6 py-2.5 text-sm font-medium transition", status === s ? "bg-brand-800 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800")}>{s ? t(STATUS_KEYS[s] as any) : t("letters.all")}</button>)}
    </div>

    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">{t("letters.colStatus")}</th><th className="px-4 py-3">{t("letters.colDate")}</th>{isWarningSection && <th className="px-4 py-3">{t("hr.colType")}</th>}<th className="px-4 py-3">{t("letters.colTo")}</th><th className="px-4 py-3">{t("letters.colNumber")}</th><th className="px-4 py-3">{t("letters.colSummary")}</th><th className="px-4 py-3">{t("letters.colActions")}</th></tr></thead>
      <tbody className="divide-y divide-slate-100">
        {isLoading && <tr><td colSpan={isWarningSection ? 7 : 6} className="px-4 py-8 text-center text-slate-400">{t("documents.loading")}</td></tr>}
        {!isLoading && letters.length === 0 && <tr><td colSpan={isWarningSection ? 7 : 6} className="px-4 py-8 text-center text-slate-400">{t("letters.empty")}</td></tr>}
        {letters.map((letter: any) => <tr key={letter.id} className="align-top hover:bg-slate-50">
          <td className="px-4 py-4"><LetterStatusPill status={letter.status}/></td>
          <td className="px-4 py-4 text-slate-500">{new Date(letter.documentDate).toLocaleDateString("uz-UZ")}</td>
          {isWarningSection && <td className="px-4 py-4 text-slate-600">{t(`letters.type.${letter.type}` as any)}</td>}
          <td className="px-4 py-4"><div className="font-medium text-slate-800">{letter.counterpartyName}</div><div className="text-xs text-slate-400">{letter.counterpartyAddress || ""}</div></td>
          <td className="px-4 py-4 text-slate-500">№ {letter.documentNumber}</td>
          <td className="px-4 py-4 text-slate-600"><div className="max-w-[360px]">{letter.summary}</div></td>
          <td className="px-4 py-4"><div className="flex flex-wrap gap-1.5">
            <button title={t("letters.view")} onClick={() => setViewLetter(letter)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Eye size={16}/></button>
            {(letter.draftFileUrl || letter.finalFileUrl) && <button title={t("letters.download")} onClick={() => download(letter.id, letter.status === LetterStatus.ARCHIVED ? "final" : "draft", letter.documentNumber)} className="rounded-lg p-2 text-sky-600 hover:bg-sky-50"><FileText size={16}/></button>}
            {letter.status === LetterStatus.DRAFT && <button title="Rahbariyatga yuborish" onClick={() => submitLetter(letter.id).then(() => queryClient.invalidateQueries({ queryKey: ["letters"] }))} className="rounded-lg p-2 text-brand-700 hover:bg-brand-50"><SendHorizontal size={16}/></button>}
            {letter.status === LetterStatus.PENDING_APPROVAL && canApprove && <button title="Tasdiqlash va arxivlash" onClick={() => approve.mutate(letter.id)} className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"><Check size={16}/></button>}
            {letter.status === LetterStatus.PENDING_APPROVAL && canApprove && <button title={t("letters.reject")} onClick={() => setRejectTarget(letter)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><XCircle size={16}/></button>}
            {letter.status === LetterStatus.ARCHIVED && <button title="PDF" onClick={() => downloadPdf(letter.id, letter.documentNumber)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><FileText size={16}/></button>}
            {letter.status !== LetterStatus.ARCHIVED && <button title="O‘chirish" onClick={() => del.mutate(letter.id)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><Trash2 size={16}/></button>}
          </div></td>
        </tr>)}
      </tbody></table>
    </div>
    {showCreate && <CreateLetterModal type={selectedType} direction={direction} allowTypeChoice={isWarningSection} onClose={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ["letters"] }); }}/>}
    {viewLetter && <ViewLetterModal letter={viewLetter} onClose={() => setViewLetter(null)} />}
    {rejectTarget && <RejectLetterModal letter={rejectTarget} onClose={() => setRejectTarget(null)} />}
  </div>;
}

function CreateLetterModal({ type: initialType, direction, allowTypeChoice, onClose }: { type: LetterType; direction?: string; allowTypeChoice?: boolean; onClose: () => void }) {
  const [type, setType] = useState<LetterType>(initialType);
  const [documentDate, setDocumentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const t = useT();
  const [counterpartyType, setCounterpartyType] = useState(type === LetterType.FIRST_WARNING ? "CITIZEN" : "ORGANIZATION");
  const [counterpartyName, setCounterpartyName] = useState(""); const [counterpartyAddress, setCounterpartyAddress] = useState(""); const [phoneNumber, setPhoneNumber] = useState(""); const [summary, setSummary] = useState(""); const [bodyText, setBodyText] = useState(""); const [provider, setProvider] = useState(""); const [nextNumber, setNextNumber] = useState("");
  // Faqat "Ogohlantirish" (FIRST_WARNING/FINAL_WARNING) xatlari uchun qo'shimcha maydonlar
  const [contractNumber, setContractNumber] = useState(""); const [contractDate, setContractDate] = useState(""); const [monthlyPaymentAmount, setMonthlyPaymentAmount] = useState(""); const [overdueDays, setOverdueDays] = useState(""); const [charityAmount, setCharityAmount] = useState(""); const [paymentDueDay, setPaymentDueDay] = useState("");
  const [aiLoading, setAiLoading] = useState(false); const [learnedFrom, setLearnedFrom] = useState<number | null>(null); const queryClient = useQueryClient();
  const isFirstWarning = type === LetterType.FIRST_WARNING;
  const isWarning = type === LetterType.FIRST_WARNING || type === LetterType.FINAL_WARNING;
  const { data: agentStats } = useQuery({ queryKey: ["letters", "ai-agent-stats"], queryFn: fetchAiAgentStats });
  useEffect(() => { fetchNextLetterNumber(type).then((x) => setNextNumber(x.documentNumber)).catch(() => {}); }, [type]);
  const warningPayload = () => (isWarning ? {
    contractNumber: contractNumber || undefined,
    contractDate: contractDate || undefined,
    monthlyPaymentAmount: parseMoney(monthlyPaymentAmount),
    overdueDays: overdueDays ? Number(overdueDays) : undefined,
    charityAmount: parseMoney(charityAmount),
    paymentDueDay: isFirstWarning && paymentDueDay ? Number(paymentDueDay) : undefined,
  } : {});
  const generate = async () => { setAiLoading(true); try { const r = await aiGenerateLetter({ type, documentDate, counterpartyType, counterpartyName, counterpartyAddress, summary, ...warningPayload() }); setBodyText(r.text); setProvider(r.provider); setLearnedFrom(r.learnedFrom ?? null); } finally { setAiLoading(false); } };
  // 1-ogohlantirishda qisqacha mazmun so'ralmaydi - u shartnoma ma'lumotlaridan
  // avtomatik tuziladi: kimga, shartnoma raqami/sanasi va qarzdorlik summasi.
  const effectiveSummary = (() => {
    if (!isFirstWarning) return summary;
    const parts: string[] = [];
    if (counterpartyName) parts.push(counterpartyName);
    if (contractNumber) {
      const dateText = contractDate ? new Date(contractDate).toLocaleDateString("uz-UZ") : "";
      parts.push(`shartnoma № ${contractNumber}${dateText ? ` (${dateText})` : ""}`);
    }
    const debt = parseMoney(monthlyPaymentAmount);
    if (debt) parts.push(`qarzdorlik: ${formatMoney(String(debt))} so'm`);
    if (overdueDays) parts.push(`${overdueDays} kun kechikish`);
    return parts.join(" · ") || "1-ogohlantirish";
  })();
  const mutation = useMutation({ mutationFn: () => createLetter({ type, direction, documentDate, counterpartyType, counterpartyName, counterpartyAddress: counterpartyAddress || undefined, phoneNumber: normalizeUzPhone(phoneNumber) || undefined, summary: effectiveSummary, bodyText, aiGenerated: !!bodyText, ...warningPayload() }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["letters"] }); onClose(); } });
  const agentLearnedCount = agentStats?.[type] ?? 0;
  const canSubmit = isFirstWarning
    ? !mutation.isPending && !!counterpartyName && !!contractNumber && !!overdueDays
    : !mutation.isPending && !!counterpartyName && !!summary && !!bodyText;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
    <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-slate-900">{t("letterForm.title", { type: t(`letters.type.${type}` as any) })}</h2><p className="text-xs text-slate-500">{t("letterForm.subtitle")}</p></div><button onClick={onClose}><X size={20}/></button></div>
    <div className="grid grid-cols-2 gap-4">
      <Field label={t("letterForm.type")}>{allowTypeChoice
        ? <select value={type} onChange={(e) => setType(e.target.value as LetterType)} className="input">
            <option value={LetterType.FIRST_WARNING}>{t("letters.type.FIRST_WARNING")}</option>
            <option value={LetterType.FINAL_WARNING}>{t("letters.type.FINAL_WARNING")}</option>
          </select>
        : <input readOnly value={t(`letters.type.${type}` as any)} className="input bg-slate-50"/>}</Field><Field label={t("letterForm.number")}><input readOnly value={nextNumber ? `№ ${nextNumber}` : "—"} className="input bg-slate-50"/></Field>
      <Field label={t("letterForm.date")}><input type="date" value={documentDate} onChange={e=>setDocumentDate(e.target.value)} className="input"/></Field>{isFirstWarning ? <Field label={t("letterForm.recipientType")}><input value={t("letterForm.citizen")} disabled className="input bg-slate-50 text-slate-500"/></Field> : <Field label={t("letterForm.recipientType")}><select value={counterpartyType} onChange={e=>setCounterpartyType(e.target.value)} className="input"><option value="ORGANIZATION">{t("letterForm.organization")}</option><option value="CITIZEN">{t("letterForm.citizen")}</option></select></Field>}
    </div>
    <div className="mt-4 grid grid-cols-2 gap-4"><Field label={counterpartyType === "CITIZEN" ? t("letterForm.citizenName") : t("letterForm.orgName")}><input required value={counterpartyName} onChange={e=>setCounterpartyName(e.target.value)} placeholder={counterpartyType === "CITIZEN" ? t("letterForm.citizenName") : '"MISOL KOMPANIYASI" MCHJ'} className="input"/></Field><Field label={t("letterForm.address")}><input value={counterpartyAddress} onChange={e=>setCounterpartyAddress(e.target.value)} className="input"/></Field></div>
    <div className="mt-4 grid grid-cols-2 gap-4"><Field label={t("letterForm.phone")}><input inputMode="tel" value={phoneNumber} onChange={e=>setPhoneNumber(formatUzPhone(e.target.value))} placeholder="+998 90 123 45 67" className="input"/>{phoneNumber && !isValidUzPhone(phoneNumber) && <span className="mt-1 block text-xs text-amber-600">Raqam to'liq emas (9 ta raqam kerak)</span>}</Field><div/></div>
    {!isFirstWarning && <div className="mt-4"><Field label={t("letterForm.summary")}><textarea required value={summary} onChange={e=>setSummary(e.target.value)} rows={3} placeholder="Masalan: shartnoma shartlari bo‘yicha to‘lovni o‘z vaqtida amalga oshirish zarurligi haqida..." className="input"/></Field></div>}

    {isWarning && (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle size={16}/> {t("letterForm.financialData")}</div>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("letterForm.contractNumber")}><input value={contractNumber} onChange={e=>setContractNumber(e.target.value)} placeholder="SH-2026-0451" className="input"/></Field>
          <Field label={t("letterForm.contractDate")}><input type="date" value={contractDate} onChange={e=>setContractDate(e.target.value)} className="input"/></Field>
          {isFirstWarning && <Field label={t("letterForm.paymentDueDay")}><input type="number" min="1" max="31" value={paymentDueDay} onChange={e=>setPaymentDueDay(e.target.value)} placeholder="15" className="input"/></Field>}
          <Field label={t("letterForm.monthlyPayment")}><input inputMode="decimal" value={monthlyPaymentAmount} onChange={e=>setMonthlyPaymentAmount(formatMoney(e.target.value))} placeholder="4 500 000" className="input"/></Field>
          <Field label={t("letterForm.overdueDays")}><input type="number" min="0" value={overdueDays} onChange={e=>setOverdueDays(e.target.value)} placeholder="12" className="input"/></Field>
          <Field label={t("letterForm.charityAmount")}><input inputMode="decimal" value={charityAmount} onChange={e=>setCharityAmount(formatMoney(e.target.value))} placeholder="150 000" className="input"/></Field>
        </div>
      </div>
    )}

    {isFirstWarning ? (
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        {t("letterForm.templateNote")}
      </div>
    ) : (
      <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/50 p-4"><div className="mb-2 flex items-center justify-between"><div><div className="flex items-center gap-2 font-semibold text-brand-900"><Sparkles size={17}/> {t("letterForm.aiTitle")}</div><p className="text-xs text-slate-500">{t("letterForm.aiDescription")}{agentLearnedCount > 0 && <> Hozircha <strong>{agentLearnedCount} ta</strong> tasdiqlangan "{t(`letters.type.${type}` as any).toLowerCase()}" namunasidan o'rgangan.</>}</p></div><button type="button" disabled={aiLoading || !summary || !counterpartyName} onClick={generate} className="rounded-lg bg-brand-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 whitespace-nowrap">{aiLoading ? t("letterForm.aiWriting") : t("letterForm.aiGenerate")}</button></div>{provider && <div className="mb-2 text-[11px] text-slate-500">Provayder: {provider === "openai" ? "AI" : "mahalliy yordamchi"}{learnedFrom != null && learnedFrom > 0 && <> &middot; {learnedFrom} ta namunadan foydalanildi</>}</div>}<textarea value={bodyText} onChange={e=>setBodyText(e.target.value)} rows={10} placeholder={t("letterForm.aiPlaceholder")} className="input bg-white"/></div>
    )}
    <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm">{t("letterForm.cancel")}</button><button disabled={!canSubmit} onClick={()=>mutation.mutate()} className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">{t("letterForm.save")}</button></div>
  </div></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>{children}</label>; }

function LetterheadPanel() {
  const t = useT();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["letters", "letterhead"], queryFn: fetchLetterheadStatus });

  const upload = useMutation({
    mutationFn: uploadLetterhead,
    onSuccess: () => { setError(null); queryClient.invalidateQueries({ queryKey: ["letters", "letterhead"] }); },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Yuklashda xatolik yuz berdi."),
  });
  const remove = useMutation({
    mutationFn: removeLetterhead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["letters", "letterhead"] }),
  });

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload.mutate(file);
    e.target.value = "";
  };

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-800"><ImageIcon size={18}/></div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{t("letterhead.title")}</p>
            <p className="text-xs text-slate-500">
              {data?.exists
                ? t("letterhead.exists")
                : t("letterhead.missing")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data?.exists && data.url && (
            <a href={`${(import.meta as any).env.VITE_API_URL ?? ""}${data.url}`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">{t("letterhead.download")}</a>
          )}
          <input ref={inputRef} type="file" accept=".docx" className="hidden" onChange={onFileChange} />
          <button onClick={() => inputRef.current?.click()} disabled={upload.isPending} className="flex items-center gap-2 rounded-lg bg-brand-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            <Upload size={14}/> {upload.isPending ? t("letterhead.uploading") : data?.exists ? t("letterhead.replace") : t("letterhead.upload")}
          </button>
          {data?.exists && (
            <button onClick={() => remove.mutate()} disabled={remove.isPending} className="flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">
              <Trash2 size={14}/> {t("letterhead.remove")}
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      <p className="mt-2 text-xs text-slate-400">
        {t("letterhead.hintIntro")}{" "}
        <code className="rounded bg-slate-100 px-1">{"{raqam}"}</code> <code className="rounded bg-slate-100 px-1">{"{sana}"}</code> <code className="rounded bg-slate-100 px-1">{"{kimga}"}</code> <code className="rounded bg-slate-100 px-1">{"{manzil}"}</code> <code className="rounded bg-slate-100 px-1">{"{telefon}"}</code> <code className="rounded bg-slate-100 px-1">{"{sarlavha}"}</code> <code className="rounded bg-slate-100 px-1">{"{matn}"}</code> <code className="rounded bg-slate-100 px-1">{"{%qr_kod}"}</code>
        {" — "}{t("letterhead.hintWarning")}{" "}
        <code className="rounded bg-slate-100 px-1">{"{shartnoma_raqami}"}</code> <code className="rounded bg-slate-100 px-1">{"{shartnoma_sanasi}"}</code> <code className="rounded bg-slate-100 px-1">{"{oylik_tolov}"}</code> <code className="rounded bg-slate-100 px-1">{"{kechikkan_kun}"}</code> <code className="rounded bg-slate-100 px-1">{"{xayriya_summasi}"}</code>.
      </p>
    </div>
  );
}
