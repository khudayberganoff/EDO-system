import { apiClient } from "./client";
import type { CrmContract } from "./crm";

export type CallOutcome = "ANSWERED" | "NO_ANSWER" | "BUSY" | "PROMISE" | "REFUSED" | "WRONG_NUMBER" | "CALLBACK";

export interface QueueItem extends CrmContract {
  calls: number;
  calledToday: boolean;
  lastCall: { outcome: CallOutcome; at: string; by: string; note: string | null } | null;
  promise: { date: string; amount: number | null; active: boolean; broken: boolean } | null;
  callbackAt: string | null;
  callbackDue: boolean;
}

export interface QueueResponse {
  enabled: boolean;
  items: QueueItem[];
  counts: Partial<Record<"all" | "todo" | "promise" | "broken" | "callback" | "today", number>>;
}

export interface CallLogItem {
  id: string;
  outcome: CallOutcome;
  note: string | null;
  promiseDate: string | null;
  promiseAmount: number | null;
  callbackAt: string | null;
  phone: string | null;
  dpdAtCall: number | null;
  overdueAtCall: number | null;
  createdAt: string;
  operator: { fullName: string };
}

export interface CallStats {
  days: number;
  total: number;
  uniqueClients: number;
  reached: number;
  reachRate: number;
  promises: number;
  promiseSum: number;
  outcomes: Record<string, number>;
  operators: { name: string; calls: number; reached: number; promises: number; promiseSum: number }[];
}

export async function fetchCallQueue(params: { q?: string; filter?: string }) {
  const { data } = await apiClient.get<QueueResponse>("/calls/queue", { params });
  return data;
}
export async function fetchCallHistory(clientId: string, org?: string) {
  const { data } = await apiClient.get<CallLogItem[]>(`/calls/history/${encodeURIComponent(clientId)}`, { params: { org } });
  return data;
}
export async function fetchCallStats(days: number) {
  const { data } = await apiClient.get<CallStats>("/calls/stats", { params: { days } });
  return data;
}
export async function saveCallLog(payload: {
  clientId: string; crmOrg?: string; clientName: string; contractNumber?: string; phone?: string; outcome: CallOutcome; note?: string;
  promiseDate?: string; promiseAmount?: number; callbackAt?: string; dpd?: number; overdueAmount?: number;
}) {
  const { data } = await apiClient.post("/calls/log", payload);
  return data;
}

// ---------- Lidlar (Kanban) ----------

export type LeadStage = "NEW" | "INFO_GIVEN" | "CALLBACK" | "MEETING" | "VISITED" | "CONTRACT" | "UNQUALIFIED";

export interface Lead {
  id: string;
  name: string;
  phone: string | null;
  source: string | null;
  note: string | null;
  stage: LeadStage;
  meetingAt: string | null;
  callbackAt: string | null;
  stageChangedAt: string;
  createdAt: string;
  owner: { id: string; fullName: string };
}

export type LeadInput = Partial<Pick<Lead, "name" | "phone" | "source" | "note" | "stage" | "meetingAt" | "callbackAt">>;

export async function fetchLeads() {
  const { data } = await apiClient.get<Lead[]>("/calls/leads");
  return data;
}
export async function createLead(payload: LeadInput & { name: string }) {
  const { data } = await apiClient.post<Lead>("/calls/leads", payload);
  return data;
}
export async function updateLead(id: string, payload: LeadInput) {
  const { data } = await apiClient.patch<Lead>(`/calls/leads/${id}`, payload);
  return data;
}
export async function deleteLead(id: string) {
  const { data } = await apiClient.delete(`/calls/leads/${id}`);
  return data;
}

// ---------- Kalendar ----------

export type CalendarEventType = "MEETING" | "LEAD_CALLBACK" | "DEBT_CALLBACK" | "PROMISE";

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  at: string;
  allDay: boolean;
  title: string;
  subtitle: string | null;
  phone: string | null;
  leadId?: string;
  clientId?: string;
  crmOrg?: string;
}

export async function fetchCalendar(from: Date, to: Date) {
  const { data } = await apiClient.get<CalendarEvent[]>("/calls/calendar", { params: { from: from.toISOString(), to: to.toISOString() } });
  return data;
}
