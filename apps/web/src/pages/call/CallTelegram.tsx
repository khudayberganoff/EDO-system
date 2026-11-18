import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Send, X } from "lucide-react";
import clsx from "clsx";
import {
  createCallTelegramLink, fetchCallTelegramConfig, fetchCallTelegramStatus, removeCallTelegramBot, saveCallTelegramBot, unlinkCallTelegram,
} from "../../api/callTelegram";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";

const errText = (e: any, fallback: string) => {
  const m = e?.response?.data?.message;
  return (Array.isArray(m) ? m.join(". ") : typeof m === "string" ? m : m?.message) ?? fallback;
};

/**
 * Sozlamalar -> Integratsiyalar: Call-markazning o'z Telegram boti (faqat administrator).
 * BotFather bergan token tekshiriladi, shifrlab saqlanadi va qayta ko'rsatilmaydi; bot nomi ham shu yerdan beriladi.
 */
export function CallTelegramCard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const isAdmin = user?.role === "ADMIN";
  const [token, setToken] = useState("");
  const [name, setName] = useState("WAFA Call-markaz");
  const [error, setError] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["calls", "telegram", "config"], queryFn: fetchCallTelegramConfig, enabled: isAdmin });
  const refresh = () => qc.invalidateQueries({ queryKey: ["calls", "telegram"] });
  const save = useMutation({
    mutationFn: () => saveCallTelegramBot({ token: token.trim(), name: name.trim() || undefined }),
    onSuccess: () => { setToken(""); setError(null); refresh(); },
    onError: (e) => setError(errText(e, t("calls.saveFailed"))),
  });
  const remove = useMutation({ mutationFn: removeCallTelegramBot, onSuccess: refresh, onError: (e) => setError(errText(e, t("calls.saveFailed"))) });
  if (!isAdmin) return null;
  const code = (c: string) => <code className="rounded bg-slate-100 px-1">{c}</code>;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Send size={16} className="text-sky-600" /> {t("ctg.title")}</h2>
        {data?.configured && (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
            {t("ctg.connected")}{data.botUsername ? ` · @${data.botUsername}` : ""}
          </span>
        )}
      </div>
      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">{error}</p>}

      {data?.configured ? (
        <div className="space-y-2 text-sm text-slate-600">
          {data.botName && <p>{t("ctg.botName")}: <b>{data.botName}</b></p>}
          <p>{t("ctg.howUsers")} {t("ctg.linkedUsers")}: <b>{data.linkedUsers}</b>.</p>
          <p className="text-xs text-slate-500">
            Webhook: {data.webhook?.url
              ? <code className="rounded bg-slate-100 px-1.5 py-0.5">{data.webhook.url}</code>
              : <span className="text-amber-700">{t("ctg.noWebhook", { url: data.publicUrl || "—" })}</span>}
          </p>
          {data.webhook?.lastError && <p className="text-xs text-rose-600">Telegram: {data.webhook.lastError}</p>}
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <MyTelegramLink />
            <button onClick={() => window.confirm(t("ctg.removeConfirm")) && remove.mutate()} className="text-xs font-medium text-rose-600 hover:text-rose-700">{t("ctg.remove")}</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm text-slate-600">
          <p>{t("ctg.desc")}</p>
          {data?.fallbackBot && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("ctg.fallback", { bot: data.fallbackBot })}</p>}
          <ol className="list-decimal space-y-1 pl-5">
            <li>{t("ctg.step1a")} <b>@BotFather</b> → {code("/newbot")} → {t("ctg.step1b")} <b>WAFA Call-markaz</b>; {t("ctg.step1c")} {code("wafa_call_bot")}.</li>
            <li>{t("ctg.step2")}</li>
            <li>{t("ctg.step3")}</li>
          </ol>
          <div className="grid gap-2 sm:grid-cols-[220px_1fr_auto]">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder={t("ctg.botName")} className="input" />
            <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:AAH..." className="input" />
            <button onClick={() => save.mutate()} disabled={!token.trim() || save.isPending} className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">
              {save.isPending ? t("ctg.checking") : t("ctg.connect")}
            </button>
          </div>
          <p className="text-xs text-slate-400">{t("ctg.secret")}</p>
        </div>
      )}
    </div>
  );
}

/** Joriy xodimning Telegram'ini Call-markaz botiga ulash (havola Telegram'da ochiladi, Start bosiladi). */
function MyTelegramLink({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: st } = useQuery({
    queryKey: ["calls", "telegram", "status"],
    queryFn: fetchCallTelegramStatus,
    // Havola ochilgach ulanish tugashini kutamiz
    refetchInterval: (q) => (link && !q.state.data?.linked ? 3000 : false),
  });
  const make = useMutation({
    mutationFn: createCallTelegramLink,
    onSuccess: (d) => { setLink(d.url); setError(null); window.open(d.url, "_blank", "noopener"); },
    onError: (e) => setError(errText(e, t("calls.saveFailed"))),
  });
  const unlink = useMutation({
    mutationFn: unlinkCallTelegram,
    onSuccess: () => { setLink(null); qc.invalidateQueries({ queryKey: ["calls", "telegram"] }); },
  });
  if (!st?.enabled) return null;

  if (st.linked) {
    return (
      <span className="flex items-center gap-2 text-xs">
        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700"><Check size={13} /> Telegram{st.username ? ` · @${st.username}` : ""}</span>
        <button onClick={() => window.confirm(t("ctg.unlinkConfirm")) && unlink.mutate()} className="text-slate-400 hover:text-rose-600" title={t("ctg.unlink")}><X size={14} /></button>
      </span>
    );
  }
  return (
    <span className="flex flex-col items-start gap-1">
      <button onClick={() => make.mutate()} disabled={make.isPending} className={clsx("flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 font-medium text-sky-800 transition hover:bg-sky-100 disabled:opacity-50", compact ? "px-3 py-2.5 text-sm" : "px-3 py-1.5 text-xs")}>
        <Send size={14} /> {link ? t("ctg.waiting") : t("ctg.linkMe")}
      </button>
      {link && <a href={link} target="_blank" rel="noreferrer" className="text-[11px] text-sky-700 underline">{t("ctg.openAgain")}</a>}
      {error && <span className="text-[11px] text-rose-600">{error}</span>}
    </span>
  );
}

/** Call-markaz sahifasi sarlavhasidagi tugma: har bir xodim (operator ham) o'z Telegram'ini botga ulaydi. */
export function CallTelegramButton() {
  return <MyTelegramLink compact />;
}
