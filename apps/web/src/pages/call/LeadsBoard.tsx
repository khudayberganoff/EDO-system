import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Pause, Briefcase, CalendarClock, Clock, Facebook, History, Instagram, LayoutList, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Plus, Rows3, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { LOSS_REASONS, createLead, deleteLead, fetchLeadHistory, fetchLeads, fetchSlaSettings, fetchPhoneCalls, updateLead, type Lead, type LeadInput, type LeadStage, type LossReason } from "../../api/calls";
import { CALL_STATUS, RecordingPlayer, fmtDur } from "./PhoneCallsTab";
import { LEAD_STAGES, TONE_CLASSES, stageTitleKey } from "../../utils/leadStages";
import { useLanguage } from "../../i18n/LanguageContext";
import { LOCALE_OF } from "../../i18n/callsTranslations";
import type { TranslationKey } from "../../i18n/translations";
import { useTelHref } from "../../utils/dial";

/** Joriy tilga mos "sana, vaqt" formatlovchi */
function useFmtDT() {
  const { language } = useLanguage();
  const locale = LOCALE_OF[language];
  return (d?: string | null) => (d ? new Date(d).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : "");
}
/** Kartochkadagi qisqa izoh: Meta lidida faqat arizadagi javoblar (forma/kampaniya pastdagi ko'k qatorda) */
const notePreview = (l: Lead) => {
  if (!l.note || !l.metaLeadgenId) return l.note;
  const first = l.note.split("\n\n")[0];
  return first.startsWith("Forma:") || first.startsWith("Platforma:") ? "" : first;
};
/** ISO -> <input type="datetime-local"> qiymati (mahalliy vaqt) */
const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const tomorrow10 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return toLocalInput(d.toISOString()); };

/** Lidlar Kanban'i: 7 bosqich, kartochkani sudrab bosqichdan bosqichga o'tkazish. */
export function LeadsBoard({ canEdit, isAdmin }: { canEdit: boolean; isAdmin: boolean }) {
  const telHref = useTelHref();
  const { t } = useLanguage();
  const fmtDT = useFmtDT();
  const qc = useQueryClient();
  // Muddatlar (javob / natija) ko'rsatkichlari yangilanib turishi uchun ro'yxat har daqiqada qayta olinadi
  const { data: leads = [], isLoading } = useQuery({ queryKey: ["calls", "leads"], queryFn: fetchLeads, refetchInterval: 60_000 });
  const { data: slaCfg } = useQuery({ queryKey: ["calls", "sla-settings"], queryFn: fetchSlaSettings, refetchInterval: 5 * 60_000 });
  const dayLen = dayLenOf(slaCfg);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<LeadStage | null>(null);
  const [editing, setEditing] = useState<Lead | "new" | null>(null);
  // Uchrashuv/qayta bog'lanish bosqichiga ko'chirishda sana so'raladi
  const [pendingMove, setPendingMove] = useState<{ lead: Lead; stage: LeadStage } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Kartochka ko'rinishi: ixcham (bir qator - ism va muddat) yoki batafsil. Tanlov brauzerda eslab qolinadi.
  const [compact, setCompact] = useState<boolean>(() => {
    try { return localStorage.getItem("leads.view") !== "full"; } catch { return true; }
  });
  const toggleView = () => setCompact((c) => {
    try { localStorage.setItem("leads.view", c ? "full" : "compact"); } catch { /* saqlab bo'lmasa ham ishlayveradi */ }
    return !c;
  });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["calls", "leads"] }); qc.invalidateQueries({ queryKey: ["calls", "calendar"] }); };
  const move = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: LeadInput }) => updateLead(id, payload),
    onSuccess: () => { setError(null); invalidate(); },
    onError: (e: any) => setError(errText(e) ?? t("calls.saveFailed")),
  });

  const byStage = useMemo(() => {
    const m = new Map<LeadStage, Lead[]>();
    for (const s of LEAD_STAGES) m.set(s.stage, []);
    for (const l of leads) m.get(l.stage)?.push(l);
    // Yangi o'zgarganlar tepada
    for (const arr of m.values()) arr.sort((a, b) => +new Date(b.stageChangedAt) - +new Date(a.stageChangedAt));
    return m;
  }, [leads]);

  // Muddat ko'rsatkichlari: javob kutayotganlar, kechikkanlar, o'rtacha vaqtlar (oxirgi 30 kun)
  const stats = useMemo(() => {
    const list = leads.filter((l) => l.sla);
    const since = Date.now() - 30 * 86_400_000;
    const recent = list.filter((l) => +new Date(l.createdAt) >= since);
    const avg = (xs: (number | null | undefined)[]) => {
      const v = xs.filter((x): x is number => typeof x === "number");
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    return {
      waiting: list.filter((l) => !l.sla!.responded).length,
      lateResponse: list.filter((l) => l.sla!.responseOverdue).length,
      lateResolve: list.filter((l) => l.sla!.resolveOverdue).length,
      avgResponse: avg(recent.map((l) => l.sla!.responseHours)),
      avgResolve: avg(recent.map((l) => l.sla!.resolveHours)),
    };
  }, [leads]);

  function drop(stage: LeadStage) {
    const lead = leads.find((l) => l.id === dragId);
    setDragId(null); setOverStage(null);
    if (!lead || lead.stage === stage || !canEdit) return;
    if (stage === "MEETING" || stage === "CALLBACK" || stage === "INFO_GIVEN") setPendingMove({ lead, stage });
    else move.mutate({ id: lead.id, payload: { stage } });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t("calls.leads.help")}</p>
        <div className="flex shrink-0 items-center gap-2">
        <button onClick={toggleView} title={compact ? t("calls.leads.viewFull") : t("calls.leads.viewCompact")} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm transition hover:bg-slate-50">
          {compact ? <LayoutList size={16} /> : <Rows3 size={16} />} {compact ? t("calls.leads.viewFull") : t("calls.leads.viewCompact")}
        </button>
        {/* Lid qo'shish va o'chirish - faqat tizim administratori */}
        {isAdmin && (
          <button onClick={() => setEditing("new")} className="flex shrink-0 items-center gap-2 rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700">
            <Plus size={16} /> {t("calls.leads.new")}
          </button>
        )}
        </div>
      </div>
      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <span className={clsx("flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium", stats.lateResponse ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-600")}>
          {stats.lateResponse ? <AlertTriangle size={13} /> : <Clock size={13} />}
          {t("calls.sla.waiting", { n: stats.waiting })}{stats.lateResponse ? ` · ${t("calls.sla.lateCount", { n: stats.lateResponse })}` : ""}
        </span>
        <span className={clsx("flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium", stats.lateResolve ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600")}>
          {stats.lateResolve ? <AlertTriangle size={13} /> : <Clock size={13} />} {t("calls.sla.resolveLate", { n: stats.lateResolve })}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600" title={t("calls.sla.avgHint")}>{t("calls.sla.avgResponse")}: <b>{stats.avgResponse === null ? "—" : fmtHours(stats.avgResponse, t, dayLen)}</b></span>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600" title={t("calls.sla.avgHint")}>{t("calls.sla.avgResolve")}: <b>{stats.avgResolve === null ? "—" : fmtHours(stats.avgResolve, t, dayLen)}</b></span>
        {slaCfg && (
          <span className={clsx("rounded-full px-3 py-1.5", slaCfg.workingNow ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")} title={t("calls.sla.rulesHint", { r: slaCfg.responseHours, s: slaCfg.resolveHours })}>
            {t("calls.sla.workTime", { from: slaCfg.workStart, to: slaCfg.workEnd })}{slaCfg.workingNow ? "" : ` · ${t("calls.sla.paused")}`}
          </span>
        )}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1340px] grid-cols-8 gap-3">
          {LEAD_STAGES.map((col) => {
            const items = byStage.get(col.stage) ?? [];
            return (
              <div
                key={col.stage}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverStage(col.stage); } }}
                onDragLeave={() => setOverStage((s) => (s === col.stage ? null : s))}
                onDrop={(e) => { e.preventDefault(); drop(col.stage); }}
                className="flex flex-col gap-2"
              >
                <div className={clsx("flex min-h-[92px] flex-col items-center justify-center rounded-xl border px-3 py-3 text-center", TONE_CLASSES[col.tone])}>
                  <div className="text-sm font-semibold leading-tight">{t(col.title)}</div>
                  {col.hint && <div className="mt-1 text-[11px] leading-tight opacity-80">{t(col.hint)}</div>}
                  <div className="mt-1.5 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium">{items.length}</div>
                </div>

                {items.map((l) => compact ? (
                  <div
                    key={l.id}
                    draggable={canEdit}
                    onDragStart={() => canEdit && setDragId(l.id)}
                    onDragEnd={() => { setDragId(null); setOverStage(null); }}
                    onClick={() => setEditing(l)}
                    title={compactTitle(l, t)}
                    className={clsx("cursor-pointer rounded-lg border bg-white px-2 py-1.5 text-left shadow-sm transition hover:border-brand-400", dragId === l.id ? "opacity-40" : l.sla?.responseOverdue || l.sla?.resolveOverdue ? "border-rose-400 bg-rose-50/40" : "border-slate-200")}
                  >
                    <div className="flex items-center gap-1.5">
                      {l.metaLeadgenId
                        ? (l.metaPlatform === "ig" ? <Instagram size={12} className="shrink-0 text-[#E1306C]" /> : <Facebook size={12} className="shrink-0 text-[#1877F2]" />)
                        : <Phone size={12} className="shrink-0 text-emerald-600" />}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-900">{l.name}</span>
                      {/* Ism o'rniga raqam yozilgan lid: qo'ng'iroq belgisi */}
                      {l.phone && digitsOnly(l.phone) === digitsOnly(l.name) && (
                        <a href={telHref(l.phone)} onClick={(e) => e.stopPropagation()} title={l.phone} className="shrink-0 rounded p-0.5 text-emerald-700 hover:bg-emerald-50"><Phone size={12} /></a>
                      )}
                      {/* Uchrashuv / qayta aloqa vaqti bor bosqichda - shu vaqt, aks holda muddat belgisi (kechikish chegara rangida ko'rinadi) */}
                      {stageDate(l) ? <StageDatePill lead={l} /> : <SlaPill lead={l} dayLen={dayLen} paused={slaCfg ? !slaCfg.workingNow : false} />}
                    </div>
                    {/* Ism o'rniga raqam yozilgan bo'lsa (Meta arizasida ism bo'lmasa) raqam ikki marta ko'rsatilmaydi */}
                    {l.phone && digitsOnly(l.phone) !== digitsOnly(l.name) && (
                      <a href={telHref(l.phone)} onClick={(e) => e.stopPropagation()} className="ml-[18px] block truncate text-[11px] leading-tight text-emerald-700 hover:underline">{l.phone}</a>
                    )}
                  </div>
                ) : (
                  <div
                    key={l.id}
                    draggable={canEdit}
                    onDragStart={() => canEdit && setDragId(l.id)}
                    onDragEnd={() => { setDragId(null); setOverStage(null); }}
                    onClick={() => setEditing(l)}
                    className={clsx("cursor-pointer rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-brand-400", dragId === l.id ? "opacity-40" : l.sla?.responseOverdue || l.sla?.resolveOverdue ? "border-rose-400 ring-1 ring-rose-200" : "border-slate-200")}
                  >
                    <div className="text-sm font-medium text-slate-900">{l.name}</div>
                    {l.phone && (
                      <a href={telHref(l.phone)} onClick={(e) => e.stopPropagation()} className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-xs text-emerald-700 hover:underline"><Phone size={11} /> {l.phone}</a>
                    )}
                    {(l.projectAsset || l.projectAmount || l.projectTermMonths) && (
                      <div className="mt-1.5 flex gap-1 text-[11px] leading-snug text-slate-600" title={[l.projectAsset, l.projectPurpose, l.projectAmount ? fmtMoney(l.projectAmount, t) : "", l.projectTermMonths ? t("calls.project.months", { n: l.projectTermMonths }) : ""].filter(Boolean).join(" · ")}>
                        <Briefcase size={11} className="mt-0.5 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          {l.projectAsset && <div className="truncate font-medium text-slate-700">{l.projectAsset}</div>}
                          {(l.projectAmount || l.projectTermMonths) && (
                            <div className="text-slate-500">{[l.projectAmount ? fmtShortMoney(l.projectAmount, t) : "", l.projectTermMonths ? t("calls.project.monthsShort", { n: l.projectTermMonths }) : ""].filter(Boolean).join(" · ")}</div>
                          )}
                        </div>
                      </div>
                    )}
                    {l.stage === "UNQUALIFIED" && (!!l.lossReasons?.length || !!l.lossNote) && (
                      <div className="mt-1.5 flex flex-wrap gap-1" title={l.lossNote ?? undefined}>
                        {(l.lossReasons ?? []).map((r) => (
                          <span key={r} className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                            {t(`calls.loss.short.${r}` as TranslationKey)}{r === "TERM" && l.lossTerm ? `: ${l.lossTerm}` : ""}
                          </span>
                        ))}
                        {l.lossNote && <span className="line-clamp-2 w-full text-[11px] italic text-rose-700/90">«{l.lossNote}»</span>}
                      </div>
                    )}
                    {notePreview(l) && <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-slate-500">{notePreview(l)}</p>}
                    {l.stage === "MEETING" && l.meetingAt && <div className="mt-1.5 flex items-center gap-1 text-xs font-medium text-sky-700"><CalendarClock size={12} /> {fmtDT(l.meetingAt)}</div>}
                    {(l.stage === "CALLBACK" || l.stage === "INFO_GIVEN") && l.callbackAt && <div className="mt-1.5 flex items-center gap-1 text-xs font-medium text-amber-700"><CalendarClock size={12} /> {fmtDT(l.callbackAt)}</div>}
                    <SlaBadge lead={l} dayLen={dayLen} />
                    {l.phoneCalls?.[0] && (
                      <div className={clsx("mt-1.5 flex items-center gap-1 text-[11px]", l.phoneCalls[0].direction === "IN" && l.phoneCalls[0].status !== "ANSWERED" ? "font-medium text-rose-600" : "text-slate-500")}>
                        {l.phoneCalls[0].direction === "OUT" ? <PhoneOutgoing size={11} /> : l.phoneCalls[0].status === "ANSWERED" ? <PhoneIncoming size={11} /> : <PhoneMissed size={11} />}
                        {fmtDT(l.phoneCalls[0].startedAt)}
                      </div>
                    )}
                    {l.metaLeadgenId && (
                      <div className="mt-1.5 flex items-center gap-1 truncate text-[11px] font-medium text-[#1877F2]" title={[l.metaFormName, l.metaCampaignName, l.metaAdName].filter(Boolean).join(" · ")}>
                        {l.metaPlatform === "ig" ? <Instagram size={11} className="shrink-0" /> : <Facebook size={11} className="shrink-0" />}
                        <span className="truncate">{l.metaCampaignName ?? l.metaFormName ?? "Meta Ads"}</span>
                      </div>
                    )}
                    <div className="mt-1.5 text-[11px] text-slate-400">{[l.owner?.fullName ?? (l.metaLeadgenId ? null : t("calls.ipTelephony")), l.source && l.source !== "IP-telefoniya" && !l.metaLeadgenId ? l.source : null].filter(Boolean).join(" · ")}</div>
                  </div>
                ))}

                {/* Bo'sh joylar (kartochka tashlash uchun) */}
                {Array.from({ length: items.length === 0 ? 2 : 1 }).map((_, i) => (
                  <div key={i} className={clsx(compact ? "h-9 rounded-lg" : "h-[72px] rounded-xl", "border border-dashed transition", overStage === col.stage ? "border-brand-500 bg-brand-50" : "border-slate-200")} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {isLoading && <p className="mt-3 text-sm text-slate-400">{t("calls.loading")}</p>}

      {pendingMove && (
        <StageDateModal
          lead={pendingMove.lead} stage={pendingMove.stage}
          onClose={() => setPendingMove(null)}
          onSave={(iso) => {
            move.mutate({ id: pendingMove.lead.id, payload: { stage: pendingMove.stage, ...(pendingMove.stage === "MEETING" ? { meetingAt: iso } : { callbackAt: iso }) } });
            setPendingMove(null);
          }}
        />
      )}
      {editing && <LeadModal lead={editing === "new" ? null : editing} canEdit={canEdit} isAdmin={isAdmin} onClose={() => setEditing(null)} onSaved={() => { invalidate(); setEditing(null); }} />}
    </div>
  );
}

/** Server xatosi matni (bo'lmasa - undefined, chaqiruvchi umumiy matnni qo'yadi) */
function errText(e: any): string | undefined {
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(". ") : typeof m === "string" ? m : m?.message;
}

function StageDateModal({ lead, stage, onClose, onSave }: { lead: Lead; stage: LeadStage; onClose: () => void; onSave: (iso: string) => void }) {
  const { t } = useLanguage();
  // "Ma'lumot berildi"ga yangi o'tkazilganda eski qayta bog'lanish vaqti emas, ertangi kun taklif qilinadi
  const [value, setValue] = useState(toLocalInput(stage === "MEETING" ? lead.meetingAt : stage === "INFO_GIVEN" ? null : lead.callbackAt) || tomorrow10());
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900">{lead.name} → {t(stageTitleKey(stage))}</h3>
        <label className="mt-4 block text-xs text-slate-500">
          {stage === "MEETING" ? t("calls.leads.meetingDateTime") : stage === "INFO_GIVEN" ? t("calls.leads.followUpWhen") : t("calls.leads.callbackWhen")} *
          <input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="input mt-1" />
        </label>
        <p className="mt-2 text-xs text-slate-400">{t("calls.leads.shownInCalendar")}{stage !== "MEETING" ? ` ${t("calls.leads.reminderHint")}` : ""}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">{t("calls.cancel")}</button>
          <button disabled={!value} onClick={() => onSave(new Date(value).toISOString())} className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{t("calls.save")}</button>
        </div>
      </div>
    </div>
  );
}

function LeadModal({ lead, canEdit, isAdmin, onClose, onSaved }: { lead: Lead | null; canEdit: boolean; isAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useLanguage();
  const fmtDT = useFmtDT();
  const [form, setForm] = useState({
    name: lead?.name ?? "", phone: lead?.phone ?? "", source: lead?.source ?? "", note: lead?.note ?? "",
    stage: (lead?.stage ?? "NEW") as LeadStage, meetingAt: toLocalInput(lead?.meetingAt), callbackAt: toLocalInput(lead?.callbackAt),
    lossReasons: (lead?.lossReasons ?? []) as LossReason[], lossTerm: lead?.lossTerm ?? "", lossNote: lead?.lossNote ?? "",
    project: {
      asset: lead?.projectAsset ?? "",
      purpose: lead?.projectPurpose ?? "",
      amount: lead?.projectAmount != null ? String(Math.round(lead.projectAmount)) : "",
      term: lead?.projectTermMonths != null ? String(lead.projectTermMonths) : "",
      hasDown: lead?.projectHasDownPayment ?? null,
      down: lead?.projectDownPayment != null ? String(Math.round(lead.projectDownPayment)) : "",
    } as ProjectForm,
  });
  // Rad etish sababi belgilansa - bosqich avtomatik "Sifatsiz lead"; hammasi olib tashlansa - oldingi bosqichga qaytadi
  const toggleReason = (r: LossReason, on: boolean) => setForm((f) => {
    const lossReasons = on ? [...new Set([...f.lossReasons, r])] : f.lossReasons.filter((x) => x !== r);
    const fallback = lead && lead.stage !== "UNQUALIFIED" ? lead.stage : "NEW";
    const lossy = lossReasons.length || f.lossNote.trim();
    const stage: LeadStage = lossy ? "UNQUALIFIED" : f.lossReasons.length && f.stage === "UNQUALIFIED" ? fallback : f.stage;
    return { ...f, lossReasons, stage, lossTerm: r === "TERM" && !on ? "" : f.lossTerm };
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const payload: LeadInput = {
        name: form.name.trim(), phone: form.phone.trim(), source: form.source.trim(), note: form.note.trim(), stage: form.stage,
        lossReasons: form.lossReasons, lossTerm: form.lossTerm.trim(), lossNote: form.lossNote.trim(),
        projectAsset: form.project.asset.trim(),
        projectPurpose: form.project.purpose.trim(),
        projectAmount: form.project.amount ? Number(form.project.amount) : null,
        projectTermMonths: form.project.term ? Number(form.project.term) : null,
        projectHasDownPayment: form.project.hasDown,
        projectDownPayment: form.project.hasDown && form.project.down ? Number(form.project.down) : null,
        ...(form.meetingAt ? { meetingAt: new Date(form.meetingAt).toISOString() } : {}),
        ...(form.callbackAt ? { callbackAt: new Date(form.callbackAt).toISOString() } : {}),
      };
      return lead ? updateLead(lead.id, payload) : createLead(payload as LeadInput & { name: string });
    },
    onSuccess: onSaved,
    onError: (e: any) => setError(errText(e) ?? t("calls.saveFailed")),
  });
  const remove = useMutation({ mutationFn: () => deleteLead(lead!.id), onSuccess: onSaved, onError: (e: any) => setError(errText(e) ?? t("calls.saveFailed")) });

  const needMeeting = form.stage === "MEETING";
  // "Ma'lumot berildi"ga o'tkazilayotganda (yoki shu bosqichda yangi lid) qayta aloqa vaqti majburiy
  // "Qayta bog'lanish" va "Ma'lumot berildi" bosqichlarida qayta aloqa vaqti doim ko'rinadi va majburiy
  const needCallback = form.stage === "CALLBACK" || form.stage === "INFO_GIVEN";
  const ready = form.name.trim().length >= 2 && (!needMeeting || !!form.meetingAt) && (!needCallback || !!form.callbackAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{lead ? t("calls.leads.lead") : t("calls.leads.new")}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs text-slate-500">{t("calls.leads.name")} *<input value={form.name} disabled={!canEdit} onChange={(e) => set("name", e.target.value)} className="input mt-1" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-slate-500">{t("calls.phone")}<input value={form.phone} disabled={!canEdit} onChange={(e) => set("phone", e.target.value)} placeholder="+998..." className="input mt-1" /></label>
            <label className="block text-xs text-slate-500">{t("calls.leads.source")}<input value={form.source} disabled={!canEdit} onChange={(e) => set("source", e.target.value)} placeholder={t("calls.leads.sourcePlaceholder")} className="input mt-1" /></label>
          </div>
          <label className="block text-xs text-slate-500">{t("calls.leads.stage")}
            <select value={form.stage} disabled={!canEdit} onChange={(e) => set("stage", e.target.value)} className="input mt-1">
              {LEAD_STAGES.map((s) => <option key={s.stage} value={s.stage}>{t(s.title)}</option>)}
            </select>
          </label>
          {/* Bosqich sanasi - bosqich tanlovining darhol ostida */}
          {(needMeeting || form.meetingAt) && (
            <label className="block text-xs text-slate-500">{t("calls.leads.meetingAt")}{needMeeting ? " *" : ""}<input type="datetime-local" value={form.meetingAt} disabled={!canEdit} onChange={(e) => set("meetingAt", e.target.value)} className="input mt-1" /></label>
          )}
          {needCallback && (
            <label className="block text-xs text-slate-500">{form.stage === "INFO_GIVEN" ? t("calls.leads.followUpWhen") : t("calls.leads.callbackAt")} *
              <input type="datetime-local" value={form.callbackAt} disabled={!canEdit} onChange={(e) => set("callbackAt", e.target.value)} className={clsx("input mt-1", !form.callbackAt && "border-amber-400")} />
              <span className="mt-1 block text-[11px] text-slate-400">{t("calls.leads.reminderHint")}</span>
            </label>
          )}
          <ProjectField value={form.project} disabled={!canEdit} onChange={(project) => setForm((f) => ({ ...f, project }))} />
          <LossReasonsField
            value={form.lossReasons} term={form.lossTerm} note={form.lossNote} disabled={!canEdit}
            onToggle={toggleReason}
            onNote={(v) => setForm((f) => {
              // Izoh yozilsa ham lid "Sifatsiz lead"ga o'tadi; o'chirilsa va sabab yo'q bo'lsa - oldingi bosqichga qaytadi
              const fallback = lead && lead.stage !== "UNQUALIFIED" ? lead.stage : "NEW";
              const stage: LeadStage = v.trim() || f.lossReasons.length ? "UNQUALIFIED" : f.lossNote.trim() && f.stage === "UNQUALIFIED" ? fallback : f.stage;
              return { ...f, lossNote: v, stage };
            })}
            onTerm={(v) => setForm((f) => ({ ...f, lossTerm: v, ...(v.trim() && !f.lossReasons.includes("TERM") ? { lossReasons: [...f.lossReasons, "TERM"] as LossReason[], stage: "UNQUALIFIED" as LeadStage } : {}) }))}
          />
          <label className="block text-xs text-slate-500">{t("calls.leads.note")}<textarea value={form.note} disabled={!canEdit} onChange={(e) => set("note", e.target.value)} rows={3} className="input mt-1" /></label>
          {lead?.metaLeadgenId && (
            <div className="space-y-0.5 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-slate-600">
              <div className="flex items-center gap-1.5 font-semibold text-[#1877F2]">
                {lead.metaPlatform === "ig" ? <Instagram size={13} /> : <Facebook size={13} />} {t("meta.leadInfo")} · {lead.metaPlatform === "ig" ? "Instagram" : "Facebook"}
              </div>
              {lead.metaFormName && <div>{t("meta.form")}: <b className="font-medium text-slate-800">{lead.metaFormName}</b></div>}
              {lead.metaCampaignName && <div>{t("meta.campaign")}: <b className="font-medium text-slate-800">{lead.metaCampaignName}</b></div>}
              {lead.metaAdsetName && <div>{t("meta.adset")}: <b className="font-medium text-slate-800">{lead.metaAdsetName}</b></div>}
              {lead.metaAdName && <div>{t("meta.ad")}: <b className="font-medium text-slate-800">{lead.metaAdName}</b></div>}
            </div>
          )}
          {lead && (
            <p className="text-xs text-slate-400">
              {lead.metaLeadgenId ? `${t("meta.assignee")}: ${lead.owner?.fullName ?? t("meta.noAssignee")}` : `${t("calls.leads.addedBy")}: ${lead.owner ? `${lead.owner.fullName}${lead.owner.position ? ` (${lead.owner.position})` : ""}` : t("calls.ipTelephonyAuto")}`} · {fmtDT(lead.createdAt)}
            </p>
          )}
          {lead && <LeadHistory leadId={lead.id} />}
          {lead && <LeadCalls leadId={lead.id} />}
        </div>
        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
        {canEdit && (
          <div className="mt-5 flex items-center justify-between gap-2">
            {lead && isAdmin ? (
              <button onClick={() => window.confirm(t("calls.leads.deleteConfirm")) && remove.mutate()} className="flex items-center gap-1.5 text-sm text-rose-600 hover:text-rose-700"><Trash2 size={15} /> {t("calls.leads.delete")}</button>
            ) : <span />}
            <div className="flex gap-2">
              <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">{t("calls.cancel")}</button>
              <button disabled={!ready || save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-brand-800 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">{save.isPending ? t("calls.saving") : t("calls.save")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Lid raqamidan kelgan/ketgan qo'ng'iroqlar tarixi (IP-telefoniya). */
function LeadCalls({ leadId }: { leadId: string }) {
  const { t } = useLanguage();
  const fmtDT = useFmtDT();
  const { data } = useQuery({ queryKey: ["calls", "phone-calls", "lead", leadId], queryFn: () => fetchPhoneCalls({ leadId }) });
  const items = data?.items ?? [];
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("calls.leads.calls")}</div>
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {items.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
            <span className="flex items-center gap-1.5 text-slate-600">
              {c.direction === "OUT" ? <PhoneOutgoing size={12} className="text-sky-600" /> : c.status === "ANSWERED" ? <PhoneIncoming size={12} className="text-emerald-600" /> : <PhoneMissed size={12} className="text-rose-600" />}
              {fmtDT(c.startedAt)}
            </span>
            <span className="text-slate-500">{t(CALL_STATUS[c.status].label)} · {fmtDur(c.durationSec)}</span>
            {(c.hasRecording || c.recordingUrl) && <RecordingPlayer callId={c.id} />}
          </div>
        ))}
      </div>
    </div>
  );
}

type TFn = ReturnType<typeof useLanguage>["t"];

/** Ish kunining uzunligi (soat) - "2 ish kuni 3 soat" ko'rinishi uchun; sozlamadan olinadi */
const dayLenOf = (cfg?: { workStart: string; workEnd: string }) => {
  if (!cfg) return 9;
  const m = (x: string) => { const [h, mm] = x.split(":").map(Number); return h * 60 + (mm || 0); };
  return Math.max(1, (m(cfg.workEnd) - m(cfg.workStart)) / 60);
};

/** Ish soatlari: bir ish kunidan kam - "5 soat", ko'p - "2 ish kuni 3 soat" */
function fmtHours(hours: number, t: TFn, dayLen = 9, short = false) {
  const total = Math.max(0, Math.round(hours));
  if (total < dayLen) return t(short ? "calls.sla.hShort" : "calls.sla.h", { h: total });
  const days = Math.floor(total / dayLen);
  const h = Math.round(total - days * dayLen);
  return h ? t(short ? "calls.sla.dhShort" : "calls.sla.dh", { d: days, h }) : t(short ? "calls.sla.dShort" : "calls.sla.d", { d: days });
}

/** Bosqich sanasi: uchrashuv vaqti yoki qayta aloqa ("Qayta bog'lanish", "Ma'lumot berildi") vaqti */
function stageDate(l: Lead): string | null {
  if (l.stage === "MEETING") return l.meetingAt ?? null;
  if (l.stage === "CALLBACK" || l.stage === "INFO_GIVEN") return l.callbackAt ?? null;
  return null;
}

/** Ixcham kartochkadagi sana: bugun bo'lsa "10:00", aks holda "20.11"; vaqti o'tgan qayta aloqa - qizil, bugungisi - sariq. */
function StageDatePill({ lead }: { lead: Lead }) {
  const { t } = useLanguage();
  const fmtDT = useFmtDT();
  const iso = stageDate(lead);
  if (!iso) return null;
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  const now = new Date();
  const past = d.getTime() < now.getTime() && lead.stage !== "MEETING";
  const today = d.toDateString() === now.toDateString();
  const title = `${lead.stage === "MEETING" ? t("calls.leads.meetingDateTime") : t("calls.leads.followUpWhen")}: ${fmtDT(iso)}`;
  return (
    <span title={title} className={clsx("flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded px-1 text-[10px] font-semibold leading-4", past ? "bg-rose-100 text-rose-700" : today ? "bg-amber-100 text-amber-800" : lead.stage === "MEETING" ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600")}>
      {/* Joy tejash: bugungisi - faqat soat, boshqasi - faqat sana (to'liq vaqt sichqoncha olib borilganda) */}
      {today ? `${p(d.getHours())}:${p(d.getMinutes())}` : `${p(d.getDate())}.${p(d.getMonth() + 1)}`}
    </span>
  );
}

/** Ixcham kartochka ustiga sichqoncha olib borilganda ko'rinadigan qisqa ma'lumot */
function compactTitle(l: Lead, t: TFn) {
  return [
    l.name,
    l.phone,
    l.projectAsset,
    l.projectPurpose,
    l.metaLeadgenId ? (l.metaCampaignName ?? l.metaFormName ?? "Meta Ads") : l.source,
    l.owner?.fullName,
    l.stage === "UNQUALIFIED" ? (l.lossReasons ?? []).map((r) => t(`calls.loss.short.${r}` as TranslationKey)).join(", ") : "",
  ].filter(Boolean).join("\n");
}

/** Ixcham kartochkadagi kichik muddat belgisi: qizil - muddat o'tgan, sariq - oz qolgan, aks holda qolgan vaqt. */
function SlaPill({ lead, dayLen, paused }: { lead: Lead; dayLen: number; paused: boolean }) {
  const { t } = useLanguage();
  const fmtDT = useFmtDT();
  const s = lead.sla;
  if (!s) return null;
  // Qolgan vaqt - ISH soatlari (09:00-18:00, dam olish va bayram kunlarisiz); ish vaqtidan tashqarida hisob to'xtaydi
  const pill = (cls: string, text: string, title: string, alert = false) => {
    const due = !s.responded ? s.responseDueAt : s.resolveDueAt;
    const full = `${title}\n${t("calls.sla.dueAt", { at: fmtDT(due) })}\n${t("calls.sla.onlyWork")}${paused ? `\n${t("calls.sla.paused")}` : ""}`;
    return (
      <span title={full} className={clsx("flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none", cls)}>
        {alert ? <AlertTriangle size={10} /> : paused ? <Pause size={9} /> : null}{text}
      </span>
    );
  };
  if (!s.responded && s.responseLeftHours !== null) {
    if (s.responseOverdue) {
      const h = -s.responseLeftHours;
      return pill("bg-rose-600 text-white", fmtHours(h, t, dayLen, true), t("calls.sla.noResponse", { time: fmtHours(h, t, dayLen) }), true);
    }
    const h = s.responseLeftHours;
    return pill(h <= 4 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600", fmtHours(h, t, dayLen, true), t("calls.sla.respondIn", { time: fmtHours(h, t, dayLen) }));
  }
  if (!s.resolved && s.resolveLeftHours !== null) {
    if (s.resolveOverdue) return pill("bg-rose-100 text-rose-700", fmtHours(-s.resolveLeftHours, t, dayLen, true), t("calls.sla.resolveOverdue"), true);
    const h = s.resolveLeftHours;
    return pill(h <= 9 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-400", fmtHours(h, t, dayLen, true), t("calls.sla.resolveIn", { time: fmtHours(h, t, dayLen) }));
  }
  return null;
}

/**
 * Lid kartochkasidagi muddat belgisi (faqat ish vaqti hisoblanadi): avval javob muddati, so'ng natija -
 * uchrashuv belgilash yoki "Sifatsiz lead". Muddat o'tsa - qizil ogohlantirish. Qiymatlarni server hisoblaydi.
 */
function SlaBadge({ lead, dayLen }: { lead: Lead; dayLen: number }) {
  const { t } = useLanguage();
  const fmtDT = useFmtDT();
  const s = lead.sla;
  if (!s) return null;
  const node = slaBadgeNode(lead, dayLen, t);
  if (!node) return null;
  return <div title={`${t("calls.sla.dueAt", { at: fmtDT(!s.responded ? s.responseDueAt : s.resolveDueAt) })}\n${t("calls.sla.onlyWork")}`}>{node}</div>;
}

function slaBadgeNode(lead: Lead, dayLen: number, t: TFn) {
  const s = lead.sla!;
  if (!s.responded && s.responseLeftHours !== null) {
    if (s.responseOverdue) {
      return (
        <div className="mt-2 flex items-start gap-1 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold leading-tight text-white">
          <AlertTriangle size={12} className="mt-px shrink-0" /> {t("calls.sla.noResponse", { time: fmtHours(-s.responseLeftHours, t, dayLen) })}
        </div>
      );
    }
    const left = s.responseLeftHours;
    return (
      <div className={clsx("mt-2 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium", left <= 4 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600")}>
        <Clock size={12} /> {t("calls.sla.respondIn", { time: fmtHours(left, t, dayLen) })}
      </div>
    );
  }
  if (!s.resolved && s.resolveLeftHours !== null) {
    if (s.resolveOverdue) {
      return (
        <div className="mt-2 flex items-start gap-1 rounded-md bg-rose-100 px-2 py-1 text-[11px] font-semibold leading-tight text-rose-700">
          <AlertTriangle size={12} className="mt-px shrink-0" /> {t("calls.sla.resolveOverdue")}
        </div>
      );
    }
    const left = s.resolveLeftHours;
    return (
      <div className={clsx("mt-2 flex items-center gap-1 rounded-md px-2 py-1 text-[11px]", left <= 9 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-500")}>
        <Clock size={12} /> {t("calls.sla.resolveIn", { time: fmtHours(left, t, dayLen) })}
      </div>
    );
  }
  return null;
}

/** Lid bosqichlari tarixi: har bir o'tish vaqti, kim o'tkazgani va oldingi bosqichda qancha turgani. */
function LeadHistory({ leadId }: { leadId: string }) {
  const { t } = useLanguage();
  const fmtDT = useFmtDT();
  const { data = [] } = useQuery({ queryKey: ["calls", "lead-history", leadId], queryFn: () => fetchLeadHistory(leadId) });
  if (!data.length) return null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><History size={12} /> {t("calls.sla.history")}</div>
      <div className="space-y-1">
        {data.map((h, i) => {
          const spent = i ? h.spentHours : null;
          return (
            <div key={h.id} className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
              <span className="text-slate-400">{fmtDT(h.createdAt)}</span>{" · "}
              {h.fromStage ? <>{t(stageTitleKey(h.fromStage))} → </> : `${t("calls.sla.created")}: `}
              <b className="font-medium text-slate-800">{t(stageTitleKey(h.toStage))}</b>
              {" · "}{h.user ? h.user.fullName : t("calls.sla.auto")}
              {spent !== null && <span className="text-slate-400"> · {t("calls.sla.spent", { time: fmtHours(spent, t) })}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Rad etish sabablari (belgilash bilan): garov, ustama, islomiy moliya va muddat (mijoz so'ragan muddat kiritiladi).
 * Kamida bittasi tanlansa lid avtomatik "Sifatsiz lead"ga o'tadi.
 */
function LossReasonsField({ value, term, note, disabled, onToggle, onTerm, onNote }: {
  value: LossReason[]; term: string; note: string; disabled: boolean;
  onToggle: (r: LossReason, on: boolean) => void; onTerm: (v: string) => void; onNote: (v: string) => void;
}) {
  const active = value.length > 0 || !!note.trim();
  const { t } = useLanguage();
  return (
    <div className={clsx("rounded-lg border p-3", active ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-slate-50/60")}>
      <div className="text-xs font-semibold text-slate-700">{t("calls.loss.title")}</div>
      <div className="mb-2 text-[11px] text-slate-500">{t("calls.loss.hint")}</div>
      <div className="space-y-1.5">
        {LOSS_REASONS.map((r) => (
          <div key={r} className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 accent-rose-600" checked={value.includes(r)} disabled={disabled} onChange={(e) => onToggle(r, e.target.checked)} />
              {t(`calls.loss.${r}` as TranslationKey)}
            </label>
            {r === "TERM" && (
              <input
                value={term} disabled={disabled} maxLength={50} onChange={(e) => onTerm(e.target.value)}
                placeholder={t("calls.loss.termPlaceholder")}
                className="min-w-[160px] flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
              />
            )}
          </div>
        ))}
      </div>
      <textarea
        value={note} disabled={disabled} maxLength={1000} rows={2} onChange={(e) => onNote(e.target.value)}
        placeholder={t("calls.loss.notePlaceholder")}
        className="mt-2 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
      />
      {active && <div className="mt-1 text-[11px] font-medium text-rose-700">{t("calls.loss.willMove")}</div>}
    </div>
  );
}

/** Lid oynasidagi loyiha maydonlari (summalar - faqat raqamlar, so'mda) */
type ProjectForm = { asset: string; purpose: string; amount: string; term: string; hasDown: boolean | null; down: string };

const digitsOnly = (v: string) => v.replace(/\D/g, "").slice(0, 13);
/** 150000000 -> "150 000 000" */
const groupDigits = (v: string) => v.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const fmtMoney = (n: number, t: TFn) => `${groupDigits(String(Math.round(n)))} ${t("calls.clients.currency")}`;
/** Kartochka uchun qisqa: 150 mln, 1,2 mlrd */
function fmtShortMoney(n: number, t: TFn) {
  if (n >= 1e9) return t("calls.project.bln", { n: (n / 1e9).toFixed(1).replace(/\.0$/, "").replace(".", ",") });
  if (n >= 1e6) return t("calls.project.mln", { n: (n / 1e6).toFixed(1).replace(/\.0$/, "").replace(".", ",") });
  return fmtMoney(n, t);
}

/** "Loyiha haqida": aktiv nomi, moliyalashtirish summasi, muddati, oldindan to'lov (bor bo'lsa - summasi). */
function ProjectField({ value, disabled, onChange }: { value: ProjectForm; disabled: boolean; onChange: (v: ProjectForm) => void }) {
  const { t } = useLanguage();
  const set = (patch: Partial<ProjectForm>) => onChange({ ...value, ...patch });
  const pct = value.hasDown && value.down && value.amount && Number(value.amount) > 0 ? Math.round((Number(value.down) / Number(value.amount)) * 100) : null;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Briefcase size={13} className="text-brand-700" /> {t("calls.project.title")}</div>
      <div className="space-y-2.5">
        <label className="block text-xs text-slate-500">{t("calls.project.asset")}
          <input value={value.asset} disabled={disabled} maxLength={200} onChange={(e) => set({ asset: e.target.value })} placeholder={t("calls.project.assetPlaceholder")} className="input mt-1" />
        </label>
        <label className="block text-xs text-slate-500">{t("calls.project.purpose")}
          <textarea value={value.purpose} disabled={disabled} maxLength={2000} rows={2} onChange={(e) => set({ purpose: e.target.value })} placeholder={t("calls.project.purposePlaceholder")} className="input mt-1" />
        </label>
        <div className="grid grid-cols-[1fr_140px] gap-3">
          <label className="block text-xs text-slate-500">{t("calls.project.amount")}
            <div className="relative mt-1">
              <input value={groupDigits(value.amount)} disabled={disabled} inputMode="numeric" onChange={(e) => set({ amount: digitsOnly(e.target.value) })} placeholder="150 000 000" className="input pr-12" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{t("calls.clients.currency")}</span>
            </div>
          </label>
          <label className="block text-xs text-slate-500">{t("calls.project.term")}
            <div className="relative mt-1">
              <input value={value.term} disabled={disabled} inputMode="numeric" onChange={(e) => set({ term: digitsOnly(e.target.value).slice(0, 3) })} placeholder="36" className="input pr-10" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{t("calls.project.monthUnit")}</span>
            </div>
          </label>
        </div>
        <div>
          <div className="mb-1 text-xs text-slate-500">{t("calls.project.downPayment")}</div>
          <div className="flex flex-wrap items-center gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)} type="button" disabled={disabled}
                onClick={() => set({ hasDown: value.hasDown === v ? null : v, ...(v ? {} : { down: "" }) })}
                className={clsx("rounded-lg border px-3 py-1.5 text-sm transition", value.hasDown === v ? "border-brand-700 bg-brand-800 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-brand-400")}
              >
                {v ? t("calls.project.yes") : t("calls.project.no")}
              </button>
            ))}
            {value.hasDown && (
              <div className="relative min-w-[200px] flex-1">
                <input value={groupDigits(value.down)} disabled={disabled} inputMode="numeric" onChange={(e) => set({ down: digitsOnly(e.target.value) })} placeholder={t("calls.project.downAmount")} className="input pr-12" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{t("calls.clients.currency")}</span>
              </div>
            )}
          </div>
          {pct !== null && <div className="mt-1 text-[11px] text-slate-400">{t("calls.project.downPct", { p: pct })}</div>}
        </div>
      </div>
    </div>
  );
}
