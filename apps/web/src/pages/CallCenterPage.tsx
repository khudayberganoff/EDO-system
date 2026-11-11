import { useState } from "react";
import { Headset } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import type { TranslationKey } from "../i18n/translations";
import { LeadsBoard } from "./call/LeadsBoard";
import { CallCalendar } from "./call/CallCalendar";
import { PhoneCallsTab } from "./call/PhoneCallsTab";

type Tab = "leads" | "calls" | "calendar";
const TABS: { key: Tab; label: TranslationKey }[] = [
  { key: "leads", label: "calls.tab.leads" },
  { key: "calls", label: "calls.tab.calls" },
  { key: "calendar", label: "calls.tab.calendar" },
];

export function CallCenterPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const canEdit = user?.role !== "OBSERVER";
  const [tab, setTab] = useState<Tab>("leads");

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-display flex items-center gap-3 text-[30px] font-semibold tracking-tight text-brand-950"><Headset size={28} className="text-brand-700" /> {t("nav.calls")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("calls.subtitle")}</p>
        <div className="mt-4 flex gap-1 border-b border-slate-200">
          {TABS.map((x) => (
            <button key={x.key} onClick={() => setTab(x.key)} className={clsx("-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition", tab === x.key ? "border-brand-700 text-brand-800" : "border-transparent text-slate-500 hover:text-slate-800")}>{t(x.label)}</button>
          ))}
        </div>
      </div>
      {tab === "leads" && <LeadsBoard canEdit={canEdit} />}
      {tab === "calls" && <PhoneCallsTab />}
      {tab === "calendar" && <CallCalendar onOpen={() => setTab("leads")} />}
    </div>
  );
}
