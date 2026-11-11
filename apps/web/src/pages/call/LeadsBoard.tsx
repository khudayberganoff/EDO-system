import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Plus, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { createLead, deleteLead, fetchLeads, fetchPhoneCalls, updateLead, type Lead, type LeadInput, type LeadStage } from "../../api/calls";
import { CALL_STATUS, RecordingPlayer, fmtDur } from "./PhoneCallsTab";
import { LEAD_STAGES, TONE_CLASSES, stageTitleKey } from "../../utils/leadStages";
import { useLanguage } from "../../i18n/LanguageContext";
import { LOCALE_OF } from "../../i18n/callsTranslations";

/** Joriy tilga mos "sana, vaqt" formatlovchi */
function useFmtDT() {
  const { language } = useLanguage();
  const locale = LOCALE_OF[language];
  return (d?: string | null) => (d ? new Date(d).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : "");
}
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
export function LeadsBoard({ canEdit }: { canEdit: boolean }) {
  const { t } = useLanguage();
  const fmtDT = useFmtDT();
  const qc = useQueryClient();
  const { data: leads = [], isLoading } = useQuery({ queryKey: ["calls", "leads"], queryFn: fetchLeads });
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
        {canEdit && (
          <button onClick={() => setEditing("new")} className="flex shrink-0 items-center gap-2 rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700">
            <Plus size={16} /> {t("calls.leads.new")}
          </button>
        )}
      </div>
      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

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
                    className={clsx("cursor-pointer rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-brand-400", dragId === l.id ? "opacity-40" : "border-slate-200")}
                  >
                    <div className="text-sm font-medium text-slate-900">{l.name}</div>
                    {l.phone && (
                      <a href={telHref(l.phone)} onClick={(e) => e.stopPropagation()} className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-xs text-emerald-700 hover:underline"><Phone size={11} /> {l.phone}</a>
                    )}
                    {l.note && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{l.note}</p>}
                    {l.stage === "MEETING" && l.meetingAt && <div className="mt-1.5 flex items-center gap-1 text-xs font-medium text-sky-700"><CalendarClock size={12} /> {fmtDT(l.meetingAt)}</div>}
                    {l.stage === "CALLBACK" && l.callbackAt && <div className="mt-1.5 flex items-center gap-1 text-xs font-medium text-amber-700"><CalendarClock size={12} /> {fmtDT(l.callbackAt)}</div>}
                    {l.phoneCalls?.[0] && (
                      <div className={clsx("mt-1.5 flex items-center gap-1 text-[11px]", l.phoneCalls[0].direction === "IN" && l.phoneCalls[0].status !== "ANSWERED" ? "font-medium text-rose-600" : "text-slate-500")}>
                        {l.phoneCalls[0].direction === "OUT" ? <PhoneOutgoing size={11} /> : l.phoneCalls[0].status === "ANSWERED" ? <PhoneIncoming size={11} /> : <PhoneMissed size={11} />}
                        {fmtDT(l.phoneCalls[0].startedAt)}
                      </div>
                    )}
                    <div className="mt-1.5 text-[11px] text-slate-400">{l.owner?.fullName ?? t("calls.ipTelephony")}{l.source && l.source !== "IP-telefoniya" ? ` · ${l.source}` : ""}</div>
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
      {editing && <LeadModal lead={editing === "new" ? null : editing} canEdit={canEdit} onClose={() => setEditing(null)} onSaved={() => { invalidate(); setEditing(null); }} />}
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

function LeadModal({ lead, canEdit, onClose, onSaved }: { lead: Lead | null; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useLanguage();
  const fmtDT = useFmtDT();
  const [form, setForm] = useState({
    name: lead?.name ?? "", phone: lead?.phone ?? "", source: lead?.source ?? "", note: lead?.note ?? "",
    stage: (lead?.stage ?? "NEW") as LeadStage, meetingAt: toLocalInput(lead?.meetingAt), callbackAt: toLocalInput(lead?.callbackAt),
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const payload: LeadInput = {
        name: form.name.trim(), phone: form.phone.trim(), source: form.source.trim(), note: form.note.trim(), stage: form.stage,
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
          {(needMeeting || form.meetingAt) && (
            <label className="block text-xs text-slate-500">{t("calls.leads.meetingAt")}{needMeeting ? " *" : ""}<input type="datetime-local" value={form.meetingAt} disabled={!canEdit} onChange={(e) => set("meetingAt", e.target.value)} className="input mt-1" /></label>
          )}
          {(needCallback || form.callbackAt) && (
            <label className="block text-xs text-slate-500">{t("calls.leads.callbackAt")}{needCallback ? " *" : ""}<input type="datetime-local" value={form.callbackAt} disabled={!canEdit} onChange={(e) => set("callbackAt", e.target.value)} className="input mt-1" /></label>
          )}
          <label className="block text-xs text-slate-500">{t("calls.leads.note")}<textarea value={form.note} disabled={!canEdit} onChange={(e) => set("note", e.target.value)} rows={3} className="input mt-1" /></label>
          {lead && <p className="text-xs text-slate-400">{t("calls.leads.addedBy")}: {lead.owner?.fullName ?? t("calls.ipTelephonyAuto")} · {fmtDT(lead.createdAt)}</p>}
          {lead && <LeadCalls leadId={lead.id} />}
        </div>
        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
        {canEdit && (
          <div className="mt-5 flex items-center justify-between gap-2">
            {lead ? (
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
