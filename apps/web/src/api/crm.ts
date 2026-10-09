import { apiClient } from "./client";

export interface CrmContract {
  organization: string;
  clientId: string;
  clientName: string;
  clientType: "CITIZEN" | "ORGANIZATION";
  phone: string | null;
  address: string | null;
  contractId: string;
  contractNumber: string | null;
  contractDate: string | null;
  endDate: string | null;
  product: string | null;
  contractKind: "MURABAHA" | "LEASING";
  principalBalance: number | null;
  profitBalance: number | null;
  overdueAmount: number | null;
  dpd: number | null;
  monthlyPayment: number | null;
  paymentDay: number | null;
}

export async function fetchCrmStatus() {
  const { data } = await apiClient.get<{ enabled: boolean }>("/crm/status");
  return data;
}

export async function searchCrmContracts(q: string, overdueOnly = true) {
  const { data } = await apiClient.get<CrmContract[]>("/crm/contracts", { params: { q: q || undefined, overdue: overdueOnly ? "1" : "0" } });
  return data;
}
