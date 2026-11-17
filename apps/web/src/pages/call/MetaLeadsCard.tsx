import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Copy, Facebook, Link2, Loader2, RefreshCw, RotateCcw, Unlink, X } from "lucide-react";
import clsx from "clsx";
import {
  connectMetaPage, disconnectMeta, disconnectMetaPage, fetchMetaEvents, fetchMetaForms, fetchMetaStatus, regenerateMetaVerifyToken,
  retryMetaEvent, saveMetaApp, saveMetaForm, startMetaOauth, updateMetaPage,
  type MetaForm, type MetaStatus, type MetaTarget,
} from "../../api/meta";
import type { LeadStage } from "../../api/calls";
import { useLanguage } from "../../i18n/LanguageContext";
import { LOCALE_OF } from "../../i18n/callsTranslations";
import type { TranslationKey } from "../../i18n/translations";
import { stageTitleKey } from "../../utils/leadStages";

const errText = (e: any, fallback: string) => {
  const m = e?.response?.data?.message;
  return (Array.isArray(m) ? m.join(". ") : typeof m === "string" ? m : m?.message) ?? fallback;
};

const TARGETS: { value: MetaTarget; label: TranslationKey }[] = [
  { value: "name", label: "meta.target.name" },
  { value: "phone", label: "meta.target.phone" },
  { value: "note", label: "meta.target.note" },
  { value: "skip", label: "meta.target.skip" },
];
const defaultTarget = (key: string): MetaTarget => {
  const k = key.toLowerCase();
  if (["full_name", "first_name", "last_name", "name"].includes(k)) return "name";
  if (k === "phone_number" || k === "phone") return "phone";
  return "note";
};

/** Facebook / Instagram Lead Ads integratsiyasi kartochkasi (call sayti → Sozlamalar → Integratsiyalar). */
export function MetaLeadsCard() {
  const { t, language } = useLanguage();
  const locale = LOCALE_OF[language];
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useQuery({ queryKey: ["meta", "status"], queryFn: fetchMetaStatus, refetchInterval: 30_000 });
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formsPage, setFormsPage] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["meta"] });

  // Facebook'dan qaytgandan keyin natija (?meta=connected | error&reason=...)
  useEffect(() => {
    const result = params.get("meta");
    if (!result) return;
    setBanner(result === "connected" ? { ok: true, text: t("meta.connectedOk") } : { ok: false, text: `${t("meta.connectFailed")}: ${params.get("reason") ?? ""}` });
    const next = new URLSearchParams(params);
    next.delete("meta"); next.delete("reason");
    setParams(next, { replace: true });
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const oauth = useMutation({
    mutationFn: () => startMetaOauth(`${window.location.origin}/settings`),
    onSuccess: (r) => { window.location.href = r.url; },
    onError: (e) => setError(errText(e, t("meta.actionFailed"))),
  });
  const disconnect = useMutation({ mutationFn: disconnectMeta, onSuccess: refresh, onError: (e) => setError(errText(e, t("meta.actionFailed"))) });
  const saveSettings = useMutation({ mutationFn: saveMetaApp, onSuccess: refresh, onError: (e) => setError(errText(e, t("meta.actionFailed"))) });

  if (isLoading || !data) return <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-400">{t("calls.loading")}</div>;

  const configured = !!data.app.appId && data.app.hasSecret;
  const state: "notConfigured" | "disconnected" | "reauth" | "connected" = !configured ? "notConfigured" : !data.connection ? "disconnected" : data.connection.status === "REAUTH" ? "reauth" : "connected";
  const pill = {
    notConfigured: "bg-slate-100 text-slate-600",
    disconnected: "bg-slate-100 text-slate-600",
    reauth: "bg-amber-100 text-amber-800",
    connected: "bg-emerald-100 text-emerald-800",
  }[state];
  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : "—");

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Facebook size={16} className="text-[#1877F2]" /> Facebook Lead Ads</h2>
        <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", pill)}>{t(`meta.state.${state}` as TranslationKey)}</span>
      </div>
      <p className="mb-4 text-sm text-slate-600">{t("meta.description")}</p>

      {banner && (
        <div className={clsx("mb-4 flex items-start justify-between gap-3 rounded-lg border p-3 text-sm", banner.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700")}>
          <span>{banner.text}</span>
          <button onClick={() => setBanner(null)} className="opacity-60 hover:opacity-100"><X size={15} /></button>
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100"><X size={15} /></button>
        </div>
      )}
      {state === "reauth" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span className="flex items-center gap-2"><AlertTriangle size={16} /> {t("meta.reauthHint")}</span>
          <button onClick={() => oauth.mutate()} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">{t("meta.reconnect")}</button>
        </div>
      )}

      {data.connection && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t("meta.statToday")} value={String(data.stats.today)} />
          <Stat label={t("meta.statTotal")} value={String(data.stats.total)} />
          <Stat label={t("meta.statLast")} value={fmt(data.stats.lastLeadAt)} small />
          <Stat label={t("meta.statPending")} value={String(data.stats.pending)} />
        </div>
      )}
      {data.connection && (
        <p className={clsx("mb-4 rounded-lg px-3 py-2 text-xs", !data.lastWebhook ? "bg-slate-50 text-slate-500" : data.lastWebhook.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700")}>
          <b>{t("meta.lastWebhook")}:</b>{" "}
          {!data.lastWebhook
            ? t("meta.noWebhookYet")
            : `${fmt(data.lastWebhook.at)} · ${data.lastWebhook.ok ? t("meta.webhookOk") : `${t("meta.webhookRejected")}: ${data.lastWebhook.error ?? ""}`}`}
        </p>
      )}
      {data.lastError?.message && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700"><b>{t("meta.lastError")}</b> ({fmt(data.lastError.at)}): {data.lastError.message}</p>
      )}

      <AppSection data={data} onError={setError} defaultOpen={!configured} />

      {/* 2. Akkaunt */}
      <Step n={2} title={t("meta.stepAccount")}>
        {!data.connection ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              disabled={!configured || oauth.isPending}
              onClick={() => oauth.mutate()}
              className="flex items-center gap-2 rounded-lg bg-[#1877F2] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#166FE5] disabled:opacity-50"
            >
              {oauth.isPending ? <Loader2 size={16} className="animate-spin" /> : <Facebook size={16} />} {t("meta.connect")}
            </button>
            {!configured && <span className="text-xs text-slate-500">{t("meta.needApp")}</span>}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-slate-700">
              {t("meta.connectedAs")} <b>{data.connection.fbUserName ?? "—"}</b>
              <span className="text-slate-400"> · {data.connection.connectedBy ?? ""} · {fmt(data.connection.connectedAt)}</span>
            </span>
            <div className="flex gap-2">
              <button onClick={() => oauth.mutate()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><RefreshCw size={13} /> {t("meta.reconnect")}</button>
              <button onClick={() => window.confirm(t("meta.disconnectConfirm")) && disconnect.mutate()} className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50"><Unlink size={13} /> {t("meta.disconnect")}</button>
            </div>
          </div>
        )}
      </Step>

      {/* 3. Sahifalar */}
      {data.connection && (
        <Step n={3} title={t("meta.stepPages")}>
          {data.pages.length === 0 && <p className="text-sm text-slate-500">{t("meta.noPages")}</p>}
          <div className="space-y-2">
            {data.pages.map((p) => <PageRow key={p.pageId} page={p} fmt={fmt} onForms={() => setFormsPage(p.pageId)} onError={setError} />)}
          </div>
        </Step>
      )}

      {/* Qo'shimcha sozlamalar */}
      {data.connection && (
        <Step n={4} title={t("meta.stepRules")}>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={data.settings.dedupeByPhone} onChange={(e) => saveSettings.mutate({ dedupeByPhone: e.target.checked })} />
            <span>{t("meta.dedupe")}<span className="block text-xs text-slate-400">{t("meta.dedupeHint")}</span></span>
          </label>
          <label className="mt-2 flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={data.settings.notifyTelegram} onChange={(e) => saveSettings.mutate({ notifyTelegram: e.target.checked })} />
            <span>{t("meta.telegram")}<span className="block text-xs text-slate-400">{data.settings.telegramEnabled ? t("meta.telegramHint") : t("meta.telegramOff")}</span></span>
          </label>
        </Step>
      )}

      {data.connection && <EventsLog fmt={fmt} />}

      {formsPage && <FormsModal pageId={formsPage} status={data} onClose={() => { setFormsPage(null); refresh(); }} />}
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className={clsx("mt-0.5 font-semibold text-brand-950", small ? "text-sm" : "text-xl")}>{value}</div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-[11px] text-brand-800">{n}</span>{title}</h3>
      {children}
    </div>
  );
}

function CopyRow({ label, value, extra }: { label: string; value: string; extra?: React.ReactNode }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* qo'lda nusxalanadi */ } };
  return (
    <div className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[190px_1fr]">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="flex gap-2">
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="input flex-1 font-mono text-xs" />
        <button onClick={copy} title={t("tel.copy")} className="rounded-lg border border-slate-200 px-2.5 text-slate-500 hover:bg-slate-50">{copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}</button>
        {extra}
      </div>
    </div>
  );
}

/** 1-qadam: Meta ilovasi (App ID / App Secret) va Meta panelida kiritiladigan manzillar */
function AppSection({ data, onError, defaultOpen }: { data: MetaStatus; onError: (e: string) => void; defaultOpen: boolean }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const [appId, setAppId] = useState(data.app.appId ?? "");
  const [secret, setSecret] = useState("");
  const [configId, setConfigId] = useState(data.app.loginConfigId ?? "");
  const [contactEmail, setContactEmail] = useState(data.app.contactEmail ?? "");
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => saveMetaApp({ ...(data.app.appIdSource !== "env" ? { appId } : {}), ...(secret && data.app.secretSource !== "env" ? { appSecret: secret } : {}), ...(data.app.loginConfigSource !== "env" ? { loginConfigId: configId } : {}), contactEmail }),
    onSuccess: () => { setSecret(""); setSaved(true); setTimeout(() => setSaved(false), 2000); qc.invalidateQueries({ queryKey: ["meta"] }); },
    onError: (e) => onError(errText(e, t("meta.actionFailed"))),
  });
  const regen = useMutation({
    mutationFn: regenerateMetaVerifyToken,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meta"] }),
    onError: (e) => onError(errText(e, t("meta.actionFailed"))),
  });

  return (
    <div className="border-t border-slate-100 pt-4">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left text-sm font-semibold text-slate-800">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-[11px] text-brand-800">1</span>
        {t("meta.stepApp")}
        {data.app.appId && data.app.hasSecret && <Check size={15} className="text-emerald-600" />}
        <span className="ml-auto text-slate-400">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-slate-500">{t("meta.appHelp")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-500">App ID
              <input value={appId} disabled={data.app.appIdSource === "env"} onChange={(e) => setAppId(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="input mt-1 font-mono" />
            </label>
            <label className="block text-xs text-slate-500">App Secret
              <input type="password" autoComplete="new-password" value={secret} disabled={data.app.secretSource === "env"} onChange={(e) => setSecret(e.target.value.trim())} placeholder={data.app.hasSecret ? t("meta.secretSaved") : "••••••••••••••••"} className="input mt-1 font-mono" />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-500">{t("meta.configId")}
              <input value={configId} disabled={data.app.loginConfigSource === "env"} onChange={(e) => setConfigId(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="input mt-1 font-mono" />
              <span className="mt-1 block text-[11px] text-slate-400">{t("meta.configIdHint")}</span>
            </label>
            <label className="block text-xs text-slate-500">{t("meta.contactEmail")}
              <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value.trim())} className="input mt-1" />
              <span className="mt-1 block text-[11px] text-slate-400">{t("meta.contactEmailHint")}</span>
            </label>
          </div>
          {(data.app.appIdSource === "env" || data.app.secretSource === "env") && <p className="text-xs text-slate-400">{t("meta.envHint")}</p>}
          <div className="flex items-center gap-3">
            <button onClick={() => save.mutate()} disabled={save.isPending || (!secret && appId === (data.app.appId ?? "") && configId === (data.app.loginConfigId ?? "") && contactEmail === (data.app.contactEmail ?? ""))} className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{t("calls.save")}</button>
            {saved && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check size={13} /> {t("meta.saved")}</span>}
          </div>

          <div className="space-y-2 rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-600">{t("meta.panelValues")}</p>
            <CopyRow label="App Domains" value={data.urls.domain} />
            <CopyRow label="Privacy Policy URL" value={data.urls.privacy} />
            <CopyRow label="User data deletion (URL)" value={data.urls.dataDeletion} />
            <CopyRow label="Valid OAuth Redirect URI" value={data.urls.redirect} />
            <CopyRow label="Webhook Callback URL" value={data.urls.webhook} />
            <CopyRow
              label="Verify Token"
              value={data.app.verifyToken}
              extra={data.app.verifySource !== "env" ? (
                <button onClick={() => window.confirm(t("meta.verifyRegenConfirm")) && regen.mutate()} title={t("tel.regen")} className="rounded-lg border border-slate-200 px-2.5 text-slate-500 hover:bg-slate-100"><RefreshCw size={14} /></button>
              ) : undefined}
            />
            <p className="text-[11px] text-slate-400">{t("meta.webhookHint", { version: data.app.graphVersion })}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function PageRow({ page: p, fmt, onForms, onError }: { page: MetaStatus["pages"][number]; fmt: (d?: string | null) => string; onForms: () => void; onError: (e: string) => void }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["meta"] });
  const connect = useMutation({ mutationFn: () => connectMetaPage(p.pageId), onSuccess: () => { refresh(); onForms(); }, onError: (e) => onError(errText(e, t("meta.actionFailed"))) });
  const remove = useMutation({ mutationFn: () => disconnectMetaPage(p.pageId), onSuccess: refresh, onError: (e) => onError(errText(e, t("meta.actionFailed"))) });
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
            {p.pageName}
            <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-medium", p.subscribed ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500")}>{p.subscribed ? t("meta.pageOn") : t("meta.pageOff")}</span>
          </div>
          {p.subscribed && (
            <div className="mt-0.5 text-xs text-slate-500">
              {p.allForms ? t("meta.allFormsOn") : t("meta.formsCount", { n: p.formsEnabled, total: p.formsTotal })} · {t("meta.lastLead")}: {fmt(p.lastLeadAt)}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {p.subscribed ? (
            <>
              <button onClick={onForms} className="rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">{t("meta.formsButton")}</button>
              <button onClick={() => window.confirm(t("meta.pageDisconnectConfirm", { name: p.pageName })) && remove.mutate()} title={t("meta.disconnect")} className="rounded-lg border border-slate-200 px-2.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Unlink size={14} /></button>
            </>
          ) : (
            <button onClick={() => connect.mutate()} disabled={connect.isPending} className="flex items-center gap-1.5 rounded-lg border border-brand-300 px-3 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-50 disabled:opacity-50">
              {connect.isPending ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} {t("meta.pageConnect")}
            </button>
          )}
        </div>
      </div>
      {p.lastError && <p className="mt-2 rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">{fmt(p.lastErrorAt)}: {p.lastError}</p>}
    </div>
  );
}

/** Bosqich / tashkilot / mas'ul tanlovi. `inherit` berilsa, birinchi variant - "sahifa sozlamasi" (null). */
function TargetSelects({ status, value, onChange, inherit }: {
  status: MetaStatus;
  value: { stage: string | null; organizationId: string | null; assigneeId: string | null };
  onChange: (v: { stage?: string | null; organizationId?: string | null; assigneeId?: string | null }) => void;
  inherit?: boolean;
}) {
  const { t } = useLanguage();
  const inh = inherit ? <option value="">{t("meta.inherit")}</option> : null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="block text-xs text-slate-500">{t("calls.leads.stage")}
        <select value={value.stage ?? ""} onChange={(e) => onChange({ stage: e.target.value || null })} className="input mt-1">
          {inh}
          {status.stages.map((s) => <option key={s} value={s}>{t(stageTitleKey(s as LeadStage))}</option>)}
        </select>
      </label>
      <label className="block text-xs text-slate-500">{t("meta.organization")}
        <select value={value.organizationId ?? ""} onChange={(e) => onChange({ organizationId: e.target.value || null })} className="input mt-1">
          {inh ?? <option value="">{t("meta.orgDefault")}</option>}
          {status.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      <label className="block text-xs text-slate-500">{t("meta.assignee")}
        <select value={value.assigneeId ?? ""} onChange={(e) => onChange({ assigneeId: e.target.value || null })} className="input mt-1">
          {inh ?? <option value="">{t("meta.noAssignee")}</option>}
          {status.users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </select>
      </label>
    </div>
  );
}

/** Sahifa formalari: "Barcha formalar", har bir formani yoqish/o'chirish va maydonlar moslamasi. */
function FormsModal({ pageId, status, onClose }: { pageId: string; status: MetaStatus; onClose: () => void }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: ["meta", "forms", pageId], queryFn: () => fetchMetaForms(pageId) });
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const reload = () => qc.invalidateQueries({ queryKey: ["meta", "forms", pageId] });
  const pageUpd = useMutation({ mutationFn: (v: Parameters<typeof updateMetaPage>[1]) => updateMetaPage(pageId, v), onSuccess: reload, onError: (e) => setErr(errText(e, t("meta.actionFailed"))) });
  const toggle = useMutation({ mutationFn: ({ formId, enabled }: { formId: string; enabled: boolean }) => saveMetaForm(formId, { enabled }), onSuccess: reload, onError: (e) => setErr(errText(e, t("meta.actionFailed"))) });
  const refreshForms = async () => {
    try { await fetchMetaForms(pageId, true); reload(); } catch (e) { setErr(errText(e, t("meta.actionFailed"))); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t("meta.formsTitle")}</h2>
            <p className="text-sm text-slate-500">{data?.page.pageName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refreshForms} disabled={isFetching} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={13} className={isFetching ? "animate-spin" : ""} /> {t("meta.refreshForms")}</button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
          </div>
        </div>
        {err && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">{err}</p>}
        {isLoading && <p className="py-8 text-center text-sm text-slate-400">{t("calls.loading")}</p>}
        {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{errText(error, t("meta.actionFailed"))} <button onClick={() => refetch()} className="underline">{t("calls.rec.retry")}</button></p>}

        {data && (
          <>
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <label className="flex items-start gap-2 text-sm font-medium text-slate-800">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={data.page.allForms} onChange={(e) => pageUpd.mutate({ allForms: e.target.checked })} />
                <span>{t("meta.allForms")}<span className="block text-xs font-normal text-slate-500">{t("meta.allFormsHint")}</span></span>
              </label>
              <p className="mb-2 mt-3 text-xs font-medium text-slate-600">{t("meta.pageDefaults")}</p>
              <TargetSelects status={status} value={data.page} onChange={(v) => pageUpd.mutate({ ...v, ...(v.stage === null ? { stage: "NEW" } : {}) } as any)} />
            </div>

            {data.forms.length === 0 && <p className="py-4 text-center text-sm text-slate-400">{t("meta.noForms")}</p>}
            <div className="space-y-2">
              {data.forms.map((f) => (
                <div key={f.formId} className="rounded-lg border border-slate-200">
                  <div className="flex items-center gap-3 p-3">
                    <input type="checkbox" className="h-4 w-4" checked={f.active} onChange={(e) => toggle.mutate({ formId: f.formId, enabled: e.target.checked })} title={t("meta.formToggle")} />
                    <button onClick={() => setOpen(open === f.formId ? null : f.formId)} className="flex flex-1 items-center gap-2 text-left">
                      <span className="text-sm font-medium text-slate-900">{f.formName}</span>
                      {f.formStatus && f.formStatus !== "ACTIVE" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{f.formStatus}</span>}
                      <span className="text-xs text-slate-400">{t("meta.questions", { n: f.questions.length })}</span>
                      <span className="ml-auto flex items-center gap-1 text-xs text-brand-700">{t("meta.mapping")} {open === f.formId ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                    </button>
                  </div>
                  {open === f.formId && <FormMapping form={f} status={status} onSaved={reload} onError={setErr} />}
                </div>
              ))}
            </div>
          </>
        )}
        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white">{t("settings.close")}</button>
        </div>
      </div>
    </div>
  );
}

function FormMapping({ form, status, onSaved, onError }: { form: MetaForm; status: MetaStatus; onSaved: () => void; onError: (e: string) => void }) {
  const { t } = useLanguage();
  const [mapping, setMapping] = useState<Record<string, MetaTarget>>(() => Object.fromEntries(form.questions.map((q) => [q.key, form.mapping[q.key] ?? defaultTarget(q.key)])));
  const [target, setTarget] = useState({ stage: form.stage, organizationId: form.organizationId, assigneeId: form.assigneeId });
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => saveMetaForm(form.formId, { mapping, ...target }),
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); onSaved(); },
    onError: (e) => onError(errText(e, t("meta.actionFailed"))),
  });
  const hasPhone = Object.values(mapping).includes("phone");
  return (
    <div className="border-t border-slate-100 bg-slate-50/60 p-4">
      <table className="mb-3 w-full text-sm">
        <thead><tr className="text-left text-xs text-slate-400"><th className="pb-1.5 font-medium">{t("meta.question")}</th><th className="pb-1.5 font-medium">{t("meta.field")}</th></tr></thead>
        <tbody>
          {form.questions.map((q) => (
            <tr key={q.key}>
              <td className="py-1 pr-3 text-slate-700">{q.label} <span className="font-mono text-[11px] text-slate-400">{q.key}</span></td>
              <td className="py-1">
                <select value={mapping[q.key]} onChange={(e) => setMapping((m) => ({ ...m, [q.key]: e.target.value as MetaTarget }))} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
                  {TARGETS.map((x) => <option key={x.value} value={x.value}>{t(x.label)}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!hasPhone && form.questions.length > 0 && <p className="mb-3 text-xs text-amber-700">{t("meta.noPhoneWarn")}</p>}
      <p className="mb-2 text-xs text-slate-500">{t("meta.noteHint")}</p>
      <TargetSelects status={status} value={target} onChange={(v) => setTarget((x) => ({ ...x, ...v }))} inherit />
      <div className="mt-3 flex items-center gap-3">
        <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{t("calls.save")}</button>
        {saved && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check size={13} /> {t("meta.saved")}</span>}
      </div>
    </div>
  );
}

/** Server yozadigan tayinli sabablar -> tarjima kaliti */
const SERVER_REASONS: Record<string, TranslationKey> = {
  "Sahifa ulanmagan yoki obuna o'chirilgan": "meta.err.page",
  "Forma tanlanmagan (yoqilmagan)": "meta.err.form",
};

const EVENT_TONE = { new: "bg-sky-100 text-sky-800", done: "bg-emerald-100 text-emerald-800", skipped: "bg-slate-100 text-slate-600", error: "bg-rose-100 text-rose-700" } as const;

/** Oxirgi 50 ta xabar: qabul qilingan, o'tkazib yuborilgan va xatolar (qayta urinish tugmasi bilan). */
function EventsLog({ fmt }: { fmt: (d?: string | null) => string }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({ queryKey: ["meta", "events"], queryFn: fetchMetaEvents, enabled: open, refetchInterval: open ? 15_000 : false });
  const retry = useMutation({ mutationFn: retryMetaEvent, onSuccess: () => qc.invalidateQueries({ queryKey: ["meta"] }) });
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {t("meta.log")}
      </button>
      {open && (
        <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
              <tr><th className="px-3 py-2">{t("calls.calls.colTime")}</th><th className="px-3 py-2">{t("meta.form")}</th><th className="px-3 py-2">{t("calls.calls.colStatus")}</th><th className="px-3 py-2">{t("meta.result")}</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">{t("calls.loading")}</td></tr>}
              {!isLoading && data.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">{t("meta.logEmpty")}</td></tr>}
              {data.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmt(e.createdAt)}</td>
                  <td className="px-3 py-2 text-slate-700">{e.formName ?? "—"}<div className="text-[11px] text-slate-400">{e.pageName}</div></td>
                  <td className="px-3 py-2"><span className={clsx("rounded-full px-2 py-0.5 font-medium", EVENT_TONE[e.status])}>{t(`meta.ev.${e.status}` as TranslationKey)}</span></td>
                  <td className="px-3 py-2 text-slate-600">{e.status === "done" ? e.leadName : (SERVER_REASONS[e.error ?? ""] ? t(SERVER_REASONS[e.error ?? ""]) : e.error)}{e.attempts > 1 ? ` (${t("meta.attempts", { n: e.attempts })})` : ""}</td>
                  <td className="px-3 py-2 text-right">
                    {(e.status === "error" || e.status === "skipped") && (
                      <button onClick={() => retry.mutate(e.id)} title={t("calls.rec.retry")} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><RotateCcw size={13} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
