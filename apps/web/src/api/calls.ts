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
  owner: { id: string; fullName: string } | null;
  phoneCalls?: { direction: "IN" | "OUT"; status: "ANSWERED" | "MISSED" | "BUSY" | "FAILED"; startedAt: string }[];
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

// ---------- IP-telefoniya qo'ng'iroqlari ----------

export interface PhoneCall {
  id: string;
  direction: "IN" | "OUT";
  status: "ANSWERED" | "MISSED" | "BUSY" | "FAILED";
  phone: string;
  ourNumber: string | null;
  extension: string | null;
  startedAt: string;
  durationSec: number;
  recordingUrl: string | null;
  hasRecording: boolean;
  lead: { id: string; name: string } | null;
}

export async function fetchPhoneCalls(params: { direction?: string; status?: string; q?: string; leadId?: string }) {
  const { data } = await apiClient.get<{ items: PhoneCall[]; today: { in: number; out: number; missed: number } }>("/calls/phone-calls", { params });
  return data;
}

// ---------- IP-telefoniya sozlamasi (administrator) ----------

export interface TelephonySettings {
  token: string;
  organizationId: string | null;
  autoLead: boolean;
  retentionDays: number;
  recordingBytes: number;
  recordingCount: number;
  organizations: { id: string; name: string }[];
  last: { at: string; ok: boolean; error: string | null; raw: unknown } | null;
  total: number;
  last24h: number;
}
export async function fetchTelephonySettings() {
  const { data } = await apiClient.get<TelephonySettings>("/telephony/settings");
  return data;
}
export async function saveTelephonySettings(payload: { organizationId?: string; autoLead?: boolean; retentionDays?: number }) {
  const { data } = await apiClient.put("/telephony/settings", payload);
  return data;
}
export async function regenerateTelephonyToken() {
  const { data } = await apiClient.post<{ token: string }>("/telephony/settings/regenerate-token");
  return data;
}

/** Yozuv uchun havola: EDO'da saqlangan bo'lsa qisqa muddatli imzolangan yo'l (API'ga nisbatan), aks holda tashqi havola. */
export async function fetchRecordingLink(callId: string) {
  const { data } = await apiClient.get<{ url: string; external: boolean }>(`/calls/phone-calls/${callId}/recording-link`);
  return { url: data.external ? data.url : `${apiClient.defaults.baseURL ?? ""}${data.url}`, external: data.external };
}
