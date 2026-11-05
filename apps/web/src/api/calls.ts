import { apiClient } from "./client";

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

export type CalendarEventType = "MEETING" | "LEAD_CALLBACK";

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  at: string;
  allDay: boolean;
  title: string;
  subtitle: string | null;
  phone: string | null;
  leadId?: string;
}

export async function fetchCalendar(from: Date, to: Date) {
  const { data } = await apiClient.get<CalendarEvent[]>("/calls/calendar", { params: { from: from.toISOString(), to: to.toISOString() } });
  return data;
}
