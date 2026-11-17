import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, Clock, Facebook, History, Instagram, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Plus, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { LOSS_REASONS, createLead, deleteLead, fetchLeadHistory, fetchLeads, fetchPhoneCalls, updateLead, type Lead, type LeadInput, type LeadStage, type LossReason } from "../../api/calls";
import { businessHoursBetween, splitHours } from "../../utils/leadSla";
import { CALL_STATUS, RecordingPlayer, fmtDur } from "./PhoneCallsTab";
import { LEAD_STAGES, TONE_CLASSES, stageTitleKey } from "../../utils/leadStages";
import { useLanguage } from "../../i18n/LanguageContext";
import { LOCALE_OF } from "../../i18n/callsTranslations";
import type { TranslationKey } from "../../i18n/translations";

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
const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;
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
  const { t } = useLanguage();
  const fmtDT = useFmtDT();
  const qc = useQueryClient();
  // Muddatlar (24 / 72 soat) ko'rsatkichlari yangilanib turishi uchun ro'yxat har daqiqada qayta olinadi
  const { data: leads = [], isLoading } = useQuery({ queryKey: ["calls", "leads"], queryFn: fetchLeads, refetchInterval: 60_000 });
  const now = useNow();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<LeadStage | null>(null);
  const [editing, setEditing] = useState<Lead | "new" | null>(null);
  // Uchrashuv/qayta bog'lanish bosqichiga ko'chirishda sana so'raladi
  const [pendingMove, setPendingMove] = useState<{ lead: Lead; stage: LeadStage } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (stage === "MEETING" || stage === "CALLBACK") setPendingMove({ lead, stage });
    else move.mutate({ id: lead.id, payload: { stage } });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t("calls.leads.help")}</p>
        {/* Lid qo'shish va o'chirish - faqat tizim administratori */}
        {isAdmin && (
          <button onClick={() => setEditing("new")} className="flex shrink-0 items-center gap-2 rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700">
            <Plus size={16} /> {t("calls.leads.new")}
          </button>
        )}
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
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600" title={t("calls.sla.avgHint")}>{t("calls.sla.avgResponse")}: <b>{stats.avgResponse === null ? "—" : fmtHours(stats.avgResponse, t)}</b></span>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600" title={t("calls.sla.avgHint")}>{t("calls.sla.avgResolve")}: <b>{stats.avgResolve === null ? "—" : fmtHours(stats.avgResolve, t)}</b></span>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1180px] grid-cols-7 gap-3">
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

                {items.map((l) => (
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
                    {l.stage === "UNQUALIFIED" && !!l.lossReasons?.length && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {l.lossReasons.map((r) => (
                          <span key={r} className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                            {t(`calls.loss.short.${r}` as TranslationKey)}{r === "TERM" && l.lossTerm ? `: ${l.lossTerm}` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                    {notePreview(l) && <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-slate-500">{notePreview(l)}</p>}
                    {l.stage === "MEETING" && l.meetingAt && <div className="mt-1.5 flex items-center gap-1 text-xs font-medium text-sky-700"><CalendarClock size={12} /> {fmtDT(l.meetingAt)}</div>}
                    {l.stage === "CALLBACK" && l.callbackAt && <div className="mt-1.5 flex items-center gap-1 text-xs font-medium text-amber-700"><CalendarClock size={12} /> {fmtDT(l.callbackAt)}</div>}
                    <SlaBadge lead={l} now={now} />
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
                  <div key={i} className={clsx("h-[72px] rounded-xl border border-dashed transition", overStage === col.stage ? "border-brand-500 bg-brand-50" : "border-slate-200")} />
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
  const [value, setValue] = useState(toLocalInput(stage === "MEETING" ? lead.meetingAt : lead.callbackAt) || tomorrow10());
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900">{lead.name} → {t(stageTitleKey(stage))}</h3>
        <label className="mt-4 block text-xs text-slate-500">
          {stage === "MEETING" ? t("calls.leads.meetingDateTime") : t("calls.leads.callbackWhen")} *
          <input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="input mt-1" />
        </label>
        <p className="mt-2 text-xs text-slate-400">{t("calls.leads.shownInCalendar")}</p>
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
    lossReasons: (lead?.lossReasons ?? []) as LossReason[], lossTerm: lead?.lossTerm ?? "",
  });
  // Rad etish sababi belgilansa - bosqich avtomatik "Sifatsiz lead"; hammasi olib tashlansa - oldingi bosqichga qaytadi
  const toggleReason = (r: LossReason, on: boolean) => setForm((f) => {
    const lossReasons = on ? [...new Set([...f.lossReasons, r])] : f.lossReasons.filter((x) => x !== r);
    const fallback = lead && lead.stage !== "UNQUALIFIED" ? lead.stage : "NEW";
    const stage: LeadStage = lossReasons.length ? "UNQUALIFIED" : f.lossReasons.length && f.stage === "UNQUALIFIED" ? fallback : f.stage;
    return { ...f, lossReasons, stage, lossTerm: r === "TERM" && !on ? "" : f.lossTerm };
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const payload: LeadInput = {
        name: form.name.trim(), phone: form.phone.trim(), source: form.source.trim(), note: form.note.trim(), stage: form.stage,
        lossReasons: form.lossReasons, lossTerm: form.lossTerm.trim(),
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
  const needCallback = form.stage === "CALLBACK";
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
          <LossReasonsField
            value={form.lossReasons} term={form.lossTerm} disabled={!canEdit}
            onToggle={toggleReason}
            onTerm={(v) => setForm((f) => ({ ...f, lossTerm: v, ...(v.trim() && !f.lossReasons.includes("TERM") ? { lossReasons: [...f.lossReasons, "TERM"] as LossReason[], stage: "UNQUALIFIED" as LeadStage } : {}) }))}
          />
          {(needMeeting || form.meetingAt) && (
            <label className="block text-xs text-slate-500">{t("calls.leads.meetingAt")}{needMeeting ? " *" : ""}<input type="datetime-local" value={form.meetingAt} disabled={!canEdit} onChange={(e) => set("meetingAt", e.target.value)} className="input mt-1" /></label>
          )}
          {(needCallback || form.callbackAt) && (
            <label className="block text-xs text-slate-500">{t("calls.leads.callbackAt")}{needCallback ? " *" : ""}<input type="datetime-local" value={form.callbackAt} disabled={!canEdit} onChange={(e) => set("callbackAt", e.target.value)} className="input mt-1" /></label>
          )}
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

/** Daqiqada bir marta yangilanadigan "hozir" - muddat hisoblagichlari uchun */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Ish soatlari: 48 soatgacha - "24 soat", undan ko'pi - "3 kun 5 soat" / "3 kun" */
function fmtHours(hours: number, t: TFn) {
  const total = Math.max(0, Math.round(hours));
  if (total < 48) return t("calls.sla.h", { h: total });
  const { days, hours: h } = splitHours(total);
  return h ? t("calls.sla.dh", { d: days, h }) : t("calls.sla.d", { d: days });
}

/**
 * Lid kartochkasidagi muddat belgisi: 24 soatda javob (shanba-yakshanbasiz), so'ng 72 soatda natija -
 * uchrashuv belgilash yoki "Sifatsiz lead". Muddat o'tsa - qizil ogohlantirish.
 */
function SlaBadge({ lead, now }: { lead: Lead; now: number }) {
  const { t } = useLanguage();
  const s = lead.sla;
  if (!s) return null;
  if (!s.responded) {
    const due = +new Date(s.responseDueAt);
    if (now > due) {
      return (
        <div className="mt-2 flex items-start gap-1 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold leading-tight text-white">
          <AlertTriangle size={12} className="mt-px shrink-0" /> {t("calls.sla.noResponse", { time: fmtHours(businessHoursBetween(due, now), t) })}
        </div>
      );
    }
    const left = businessHoursBetween(now, due);
    return (
      <div className={clsx("mt-2 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium", left <= 4 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600")}>
        <Clock size={12} /> {t("calls.sla.respondIn", { time: fmtHours(left, t) })}
      </div>
    );
  }
  if (!s.resolved) {
    const due = +new Date(s.resolveDueAt);
    if (now > due) {
      return (
        <div className="mt-2 flex items-start gap-1 rounded-md bg-rose-100 px-2 py-1 text-[11px] font-semibold leading-tight text-rose-700">
          <AlertTriangle size={12} className="mt-px shrink-0" /> {t("calls.sla.resolveOverdue")}
        </div>
      );
    }
    const left = businessHoursBetween(now, due);
    return (
      <div className={clsx("mt-2 flex items-center gap-1 rounded-md px-2 py-1 text-[11px]", left <= 12 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-500")}>
        <Clock size={12} /> {t("calls.sla.resolveIn", { time: fmtHours(left, t) })}
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
          const prev = data[i - 1];
          const spent = prev ? businessHoursBetween(+new Date(prev.createdAt), +new Date(h.createdAt)) : null;
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
function LossReasonsField({ value, term, disabled, onToggle, onTerm }: {
  value: LossReason[]; term: string; disabled: boolean;
  onToggle: (r: LossReason, on: boolean) => void; onTerm: (v: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className={clsx("rounded-lg border p-3", value.length ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-slate-50/60")}>
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
      {value.length > 0 && <div className="mt-2 text-[11px] font-medium text-rose-700">{t("calls.loss.willMove")}</div>}
    </div>
  );
}
