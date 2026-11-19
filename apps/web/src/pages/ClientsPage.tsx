import { Contact } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { fetchMyAccess } from "../api/settings";
import { ClientsTab } from "./call/ClientsTab";

/** Mijozlar (CRM) - call saytida chap menyudagi alohida bo'lim. Ko'rish/o'zgartirish "Rollar va ruxsatlar"dagi "Mijozlar (CRM)" bo'yicha. */
export function ClientsPage() {
  const { t } = useLanguage();
  const { data: access } = useQuery({ queryKey: ["settings", "my-access"], queryFn: fetchMyAccess, staleTime: 60_000 });
  if (access && access.clients?.canView === false) return <Navigate to="/calls" replace />;
  const canEdit = access?.clients?.canEdit ?? false;

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
