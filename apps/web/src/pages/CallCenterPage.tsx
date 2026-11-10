import { useState } from "react";
import { Headset } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../context/AuthContext";
import { LeadsBoard } from "./call/LeadsBoard";
import { CallCalendar } from "./call/CallCalendar";
import { PhoneCallsTab } from "./call/PhoneCallsTab";
import { ClientsTab } from "./call/ClientsTab";

type Tab = "leads" | "clients" | "calls" | "calendar";
const TABS: { key: Tab; label: string }[] = [
  { key: "leads", label: "Lidlar" },
  { key: "clients", label: "Mijozlar (CRM)" },
  { key: "calls", label: "Qo'ng'iroqlar" },
  { key: "calendar", label: "Kalendar" },
];

export function CallCenterPage() {
  const { user } = useAuth();
  const canEdit = user?.role !== "OBSERVER";
  const [tab, setTab] = useState<Tab>("leads");

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-display flex items-center gap-3 text-[30px] font-semibold tracking-tight text-brand-950"><Headset size={28} className="text-brand-700" /> Call-markaz</h1>
        <p className="mt-1 text-sm text-slate-500">Yangi mijozlar (lidlar), CRM mijozlari (to'lov sanalari va telefonlar), IP-telefoniya qo'ng'iroqlari va rejalashtirilgan uchrashuvlar kalendari.</p>
        <div className="mt-4 flex gap-1 border-b border-slate-200">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={clsx("-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition", tab === t.key ? "border-brand-700 text-brand-800" : "border-transparent text-slate-500 hover:text-slate-800")}>{t.label}</button>
          ))}
        </div>
      </div>
      {tab === "leads" && <LeadsBoard canEdit={canEdit} />}
      {tab === "clients" && <ClientsTab canEdit={canEdit} />}
      {tab === "calls" && <PhoneCallsTab />}
      {tab === "calendar" && <CallCalendar onOpen={() => setTab("leads")} />}
    </div>
  );
}
