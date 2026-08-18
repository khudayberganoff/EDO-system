import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, Archive, Check, Download, Eye, FileQuestion, Mail, Plus, SendHorizontal, Trash2, X, Sparkles, Image as ImageIcon, Upload } from "lucide-react";
import { LetterStatus, LetterType } from "@edo/shared-types";
import clsx from "clsx";
import { aiGenerateLetter, approveLetter, createLetter, deleteLetter, downloadLetter, fetchAiAgentStats, fetchLetterheadStatus, fetchLetters, fetchNextLetterNumber, removeLetterhead, submitLetter, uploadLetterhead } from "../api/letters";
import { useAuth } from "../context/AuthContext";

const TYPE_LABELS: Record<string, { label: string; icon: any; description: string }> = {
  LETTER: { label: "Xat", icon: Mail, description: "Rasmiy murojaatlar va ish xatlari" },
  FIRST_WARNING: { label: "1-ogohlantirish", icon: AlertTriangle, description: "Kechikkan to'lov bo'yicha birinchi ogohlantirish (qat'iy yuridik shablon)" },
  FINAL_WARNING: { label: "Yakuniy ogohlantirish", icon: AlertTriangle, description: "Rasmiy yakuniy ogohlantirish va talabnoma" },
  REFERENCE: { label: "Ma’lumotnoma", icon: FileQuestion, description: "Ma’lumot va izohlar" },
};
const STATUS_LABELS: Record<string, string> = { DRAFT: "Qoralama", PENDING_APPROVAL: "Rahbariyat tasdig‘ida", APPROVED: "Tasdiqlangan", ARCHIVED: "Arxivda", DELETED: "O‘chirilgan" };

export function LettersPage() {
  const { kind } = useParams<{ kind?: string }>();
  const selectedType =
    kind === "first-warning" ? LetterType.FIRST_WARNING :
    kind === "final-warning" ? LetterType.FINAL_WARNING :
    kind === "reference" ? LetterType.REFERENCE : LetterType.LETTER;
  const [status, setStatus] = useState<string | undefined>();
  const [showCreate, setShowCreate] = useState(false);
  const [viewLetter, setViewLetter] = useState<any | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["letters", selectedType, status], queryFn: () => fetchLetters({ type: selectedType, status: status as any }) });
  const approve = useMutation({ mutationFn: approveLetter, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["letters"] }) });
  const del = useMutation({ mutationFn: deleteLetter, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["letters"] }) });
  const download = async (id: string, kind: "draft" | "final") => { const blob = await downloadLetter(id, kind); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${selectedType.toLowerCase()}-${id}.docx`; a.click(); URL.revokeObjectURL(url); };
  const canApprove = user?.role === "ADMIN" || user?.role === "MANAGER";

  return <div className="p-8">
    <div className="mb-6 flex items-start justify-between">
      <div><h1 className="text-xl font-semibold text-slate-900">{TYPE_LABELS[selectedType].label}</h1><p className="mt-1 text-sm text-slate-500">{TYPE_LABELS[selectedType].description}</p></div>
      <div className="flex gap-2">
        <Link to="/letters/archive" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"><Archive size={16}/> Arxiv</Link>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-brand-800 px-4 py-2 text-sm font-medium text-white"><Plus size={16}/> Yangi {TYPE_LABELS[selectedType].label.toLowerCase()}</button>
      </div>
    </div>

    {canApprove && <LetterheadPanel />}

    <div className="mb-5 flex flex-wrap gap-2">
      {[undefined, LetterStatus.DRAFT, LetterStatus.PENDING_APPROVAL, LetterStatus.ARCHIVED].map((s) => <button key={s ?? "all"} onClick={() => setStatus(s)} className={clsx("rounded-full border px-3 py-1.5 text-xs font-medium", status === s ? "border-brand-800 bg-brand-800 text-white" : "border-slate-200 bg-white text-slate-600")}>{s ? STATUS_LABELS[s] : "Barchasi"}</button>)}
    </div>

    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Holati</th><th className="px-4 py-3">Sana</th><th className="px-4 py-3">Kimga</th><th className="px-4 py-3">Raqami</th><th className="px-4 py-3">Qisqacha mazmuni</th><th className="px-4 py-3">Amallar</th></tr></thead>
      <tbody className="divide-y divide-slate-100">
        {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Yuklanmoqda...</td></tr>}
        {!isLoading && !data?.items?.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Xatlar topilmadi.</td></tr>}
        {data?.items?.map((letter: any) => <tr key={letter.id} className="align-top hover:bg-slate-50">
          <td className="px-4 py-4"><StatusPill status={letter.status}/></td>
          <td className="px-4 py-4 text-slate-500">{new Date(letter.documentDate).toLocaleDateString("uz-UZ")}</td>
          <td className="px-4 py-4"><div className="font-medium text-slate-800">{letter.counterpartyName}</div><div className="text-xs text-slate-400">{letter.counterpartyAddress || ""}</div></td>
          <td className="px-4 py-4 text-slate-500">№ {letter.documentNumber}</td>
          <td className="px-4 py-4 text-slate-600"><div className="max-w-[360px]">{letter.summary}</div></td>
          <td className="px-4 py-4"><div className="flex flex-wrap gap-1.5">
            <button title="To'liq o'qish" onClick={() => setViewLetter(letter)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Eye size={16}/></button>
            {letter.draftFileUrl && <button title="Qoralamani yuklash" onClick={() => download(letter.id, "draft")} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Download size={16}/></button>}
            {letter.status === LetterStatus.DRAFT && <button title="Rahbariyatga yuborish" onClick={() => submitLetter(letter.id).then(() => queryClient.invalidateQueries({ queryKey: ["letters"] }))} className="rounded-lg p-2 text-brand-700 hover:bg-brand-50"><SendHorizontal size={16}/></button>}
            {letter.status === LetterStatus.PENDING_APPROVAL && canApprove && <button title="Tasdiqlash va arxivlash" onClick={() => approve.mutate(letter.id)} className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"><Check size={16}/></button>}
            {letter.status === LetterStatus.ARCHIVED && letter.finalFileUrl && <button title="Tasdiqlangan fayl" onClick={() => download(letter.id, "final")} className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50"><Archive size={16}/></button>}
            {letter.status !== LetterStatus.ARCHIVED && <button title="O‘chirish" onClick={() => del.mutate(letter.id)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><Trash2 size={16}/></button>}
          </div></td>
        </tr>)}
      </tbody></table>
    </div>
    {showCreate && <CreateLetterModal type={selectedType} onClose={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ["letters"] }); }}/>}
    {viewLetter && <ViewLetterModal letter={viewLetter} onClose={() => setViewLetter(null)} />}
  </div>;
}

function ViewLetterModal({ letter, onClose }: { letter: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">№ {letter.documentNumber} — {letter.counterpartyName}</h2>
            <p className="mt-1 text-xs text-slate-500">{new Date(letter.documentDate).toLocaleDateString("uz-UZ")} &middot; <StatusPill status={letter.status} /></p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        {letter.counterpartyAddress && <p className="mb-3 text-sm text-slate-500">Manzil: {letter.counterpartyAddress}</p>}
        <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><span className="font-medium text-slate-700">Qisqacha mazmuni: </span>{letter.summary}</div>
        <div className="whitespace-pre-wrap rounded-lg border border-slate-100 p-4 text-sm leading-relaxed text-slate-800">{letter.bodyText || "Matn hali yaratilmagan."}</div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) { const cls = status === "ARCHIVED" ? "bg-emerald-100 text-emerald-800" : status === "PENDING_APPROVAL" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"; return <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", cls)}>{STATUS_LABELS[status] ?? status}</span>; }

function CreateLetterModal({ type, onClose }: { type: LetterType; onClose: () => void }) {
  const [documentDate, setDocumentDate] = useState(() => new Date().toISOString().slice(0, 10));
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
    monthlyPaymentAmount: monthlyPaymentAmount ? Number(monthlyPaymentAmount) : undefined,
    overdueDays: overdueDays ? Number(overdueDays) : undefined,
    charityAmount: charityAmount ? Number(charityAmount) : undefined,
    paymentDueDay: isFirstWarning && paymentDueDay ? Number(paymentDueDay) : undefined,
  } : {});
  const generate = async () => { setAiLoading(true); try { const r = await aiGenerateLetter({ type, documentDate, counterpartyType, counterpartyName, counterpartyAddress, summary, ...warningPayload() }); setBodyText(r.text); setProvider(r.provider); setLearnedFrom(r.learnedFrom ?? null); } finally { setAiLoading(false); } };
  // 1-ogohlantirishda qisqacha mazmun so'ralmaydi - u shartnoma ma'lumotlaridan avtomatik tuziladi
  const effectiveSummary = isFirstWarning
    ? `${contractNumber || "shartnoma"} bo'yicha ${overdueDays || 0} kunlik kechikish yuzasidan 1-ogohlantirish`
    : summary;
  const mutation = useMutation({ mutationFn: () => createLetter({ type, documentDate, counterpartyType, counterpartyName, counterpartyAddress: counterpartyAddress || undefined, phoneNumber: phoneNumber || undefined, summary: effectiveSummary, bodyText, aiGenerated: !!bodyText, ...warningPayload() }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["letters"] }); onClose(); } });
  const agentLearnedCount = agentStats?.[type] ?? 0;
  const canSubmit = isFirstWarning
    ? !mutation.isPending && !!counterpartyName && !!contractNumber && !!overdueDays
    : !mutation.isPending && !!counterpartyName && !!summary && !!bodyText;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
    <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-slate-900">Yangi {TYPE_LABELS[type].label.toLowerCase()} yaratish</h2><p className="text-xs text-slate-500">AI yordamida rasmiy xat matnini tayyorlash</p></div><button onClick={onClose}><X size={20}/></button></div>
    <div className="grid grid-cols-2 gap-4">
      <Field label="Turi"><input readOnly value={TYPE_LABELS[type].label} className="input bg-slate-50"/></Field><Field label="Hujjat raqami"><input readOnly value={nextNumber ? `№ ${nextNumber}` : "Avtomatik"} className="input bg-slate-50"/></Field>
      <Field label="Sanasi"><input type="date" value={documentDate} onChange={e=>setDocumentDate(e.target.value)} className="input"/></Field>{isFirstWarning ? <Field label="Qabul qiluvchi turi"><input value="Fuqaro" disabled className="input bg-slate-50 text-slate-500"/></Field> : <Field label="Qabul qiluvchi turi"><select value={counterpartyType} onChange={e=>setCounterpartyType(e.target.value)} className="input"><option value="ORGANIZATION">Tashkilot</option><option value="CITIZEN">Fuqaro</option></select></Field>}
    </div>
    <div className="mt-4 grid grid-cols-2 gap-4"><Field label={counterpartyType === "CITIZEN" ? "Fuqaro F.I.Sh." : "Tashkilot nomi"}><input required value={counterpartyName} onChange={e=>setCounterpartyName(e.target.value)} placeholder={counterpartyType === "CITIZEN" ? "F.I.Sh." : '"MISOL KOMPANIYASI" MCHJ'} className="input"/></Field><Field label="Manzil"><input value={counterpartyAddress} onChange={e=>setCounterpartyAddress(e.target.value)} className="input"/></Field></div>
    <div className="mt-4 grid grid-cols-2 gap-4"><Field label="Telefon"><input value={phoneNumber} onChange={e=>setPhoneNumber(e.target.value)} placeholder="+998 90 123 45 67" className="input"/></Field><div/></div>
    {!isFirstWarning && <div className="mt-4"><Field label="Qisqacha mazmuni"><textarea required value={summary} onChange={e=>setSummary(e.target.value)} rows={3} placeholder="Masalan: shartnoma shartlari bo‘yicha to‘lovni o‘z vaqtida amalga oshirish zarurligi haqida..." className="input"/></Field></div>}

    {isWarning && (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle size={16}/> Ogohlantirish uchun moliyaviy ma'lumotlar</div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Shartnoma raqami"><input value={contractNumber} onChange={e=>setContractNumber(e.target.value)} placeholder="SH-2026-0451" className="input"/></Field>
          <Field label="Shartnoma sanasi"><input type="date" value={contractDate} onChange={e=>setContractDate(e.target.value)} className="input"/></Field>
          {isFirstWarning && <Field label="Har oylik to'lov kuni (1-31)"><input type="number" min="1" max="31" value={paymentDueDay} onChange={e=>setPaymentDueDay(e.target.value)} placeholder="15" className="input"/></Field>}
          <Field label="Oylik to'lov summasi (so'm)"><input type="number" min="0" value={monthlyPaymentAmount} onChange={e=>setMonthlyPaymentAmount(e.target.value)} placeholder="4 500 000" className="input"/></Field>
          <Field label="Kechikkan kun"><input type="number" min="0" value={overdueDays} onChange={e=>setOverdueDays(e.target.value)} placeholder="12" className="input"/></Field>
          <Field label="Xayriya to'lovi summasi (so'm)"><input type="number" min="0" value={charityAmount} onChange={e=>setCharityAmount(e.target.value)} placeholder="150 000" className="input"/></Field>
        </div>
      </div>
    )}

    {isFirstWarning ? (
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Bu turdagi xat kompaniyaning qat'iy yuridik shabloni asosida yuqoridagi ma'lumotlardan avtomatik yaratiladi — qo'shimcha matn yozish shart emas.
      </div>
    ) : (
      <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/50 p-4"><div className="mb-2 flex items-center justify-between"><div><div className="flex items-center gap-2 font-semibold text-brand-900"><Sparkles size={17}/> Sun'iy idrok yordamchisi</div><p className="text-xs text-slate-500">Qisqacha mazmun va tasdiqlangan oldingi xatlar asosida professional matn tuzadi.{agentLearnedCount > 0 && <> Hozircha <strong>{agentLearnedCount} ta</strong> tasdiqlangan "{TYPE_LABELS[type].label.toLowerCase()}" namunasidan o'rgangan.</>}</p></div><button type="button" disabled={aiLoading || !summary || !counterpartyName} onClick={generate} className="rounded-lg bg-brand-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 whitespace-nowrap">{aiLoading ? "Yozmoqda..." : "AI bilan yozish"}</button></div>{provider && <div className="mb-2 text-[11px] text-slate-500">Provayder: {provider === "openai" ? "AI" : "mahalliy yordamchi"}{learnedFrom != null && learnedFrom > 0 && <> &middot; {learnedFrom} ta namunadan foydalanildi</>}</div>}<textarea value={bodyText} onChange={e=>setBodyText(e.target.value)} rows={10} placeholder="AI yaratgan xat shu yerda ko‘rinadi. Kerak bo‘lsa inson tomonidan tahrirlang." className="input bg-white"/></div>
    )}
    <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm">Bekor qilish</button><button disabled={!canSubmit} onClick={()=>mutation.mutate()} className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Xatni saqlash</button></div>
  </div></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>{children}</label>; }

function LetterheadPanel() {
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
            <p className="text-sm font-semibold text-slate-900">Firma blankasi (letterhead)</p>
            <p className="text-xs text-slate-500">
              {data?.exists
                ? "Yuklangan blank AI yozgan xatlarga avtomatik joylashadi."
                : "Blank yuklanmagan — xatlar standart WAFA LEASING sarlavhasi bilan yaratiladi."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data?.exists && data.url && (
            <a href={`${(import.meta as any).env.VITE_API_URL ?? ""}${data.url}`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">Yuklab olish</a>
          )}
          <input ref={inputRef} type="file" accept=".docx" className="hidden" onChange={onFileChange} />
          <button onClick={() => inputRef.current?.click()} disabled={upload.isPending} className="flex items-center gap-2 rounded-lg bg-brand-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            <Upload size={14}/> {upload.isPending ? "Yuklanmoqda..." : data?.exists ? "Almashtirish" : "Blank yuklash (.docx)"}
          </button>
          {data?.exists && (
            <button onClick={() => remove.mutate()} disabled={remove.isPending} className="flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">
              <Trash2 size={14}/> O'chirish
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      <p className="mt-2 text-xs text-slate-400">
        Faqat Word (.docx) fayl, max 10 MB. Blank ichida quyidagi teglardan istalganini yozing — tizim ularni avtomatik to'ldiradi:
        {" "}<code className="rounded bg-slate-100 px-1">{"{raqam}"}</code> <code className="rounded bg-slate-100 px-1">{"{sana}"}</code> <code className="rounded bg-slate-100 px-1">{"{kimga}"}</code> <code className="rounded bg-slate-100 px-1">{"{manzil}"}</code> <code className="rounded bg-slate-100 px-1">{"{matn}"}</code> — va ogohlantirish xatlari uchun qo'shimcha: <code className="rounded bg-slate-100 px-1">{"{shartnoma_raqami}"}</code> <code className="rounded bg-slate-100 px-1">{"{oylik_tolov}"}</code> <code className="rounded bg-slate-100 px-1">{"{kechikkan_kun}"}</code> <code className="rounded bg-slate-100 px-1">{"{xayriya_summasi}"}</code>.
      </p>
    </div>
  );
}
