import { Contact } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import { ClientsTab } from "./call/ClientsTab";

/** Mijozlar (CRM) - call saytida chap menyudagi alohida bo'lim. */
export function ClientsPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const canEdit = user?.role !== "OBSERVER";

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-display flex items-center gap-3 text-[30px] font-semibold tracking-tight text-brand-950"><Contact size={28} className="text-brand-700" /> {t("nav.clients")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("calls.clients.subtitle")}</p>
      </div>
      <ClientsTab canEdit={canEdit} />
    </div>
  );
}
