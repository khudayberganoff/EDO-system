import { apiClient } from "./client";

// ---------- Facebook / Instagram Lead Ads ----------

export type MetaTarget = "name" | "phone" | "note" | "skip";

export interface MetaPageInfo {
  pageId: string;
  pageName: string;
  subscribed: boolean;
  allForms: boolean;
  stage: string;
  organizationId: string | null;
  assigneeId: string | null;
  lastLeadAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  formsTotal: number;
  formsEnabled: number;
}

export interface MetaStatus {
  app: { appId: string | null; appIdSource: "env" | "db" | null; hasSecret: boolean; secretSource: "env" | "db" | null; verifyToken: string; verifySource: "env" | "db"; graphVersion: string; loginConfigId: string | null; loginConfigSource: "env" | "db" | null };
  urls: { webhook: string; redirect: string; domain: string };
  settings: { dedupeByPhone: boolean; notifyTelegram: boolean; telegramEnabled: boolean };
  connection: { fbUserName: string | null; status: "ACTIVE" | "REAUTH"; connectedAt: string; connectedBy: string | null } | null;
  pages: MetaPageInfo[];
  stats: { today: number; total: number; pending: number; lastLeadAt: string | null };
  lastError: { message: string | null; at: string } | null;
  stages: string[];
  organizations: { id: string; name: string }[];
  users: { id: string; fullName: string; role: string }[];
}

export interface MetaForm {
  formId: string;
  formName: string;
  formStatus: string | null;
  /** null - sahifaning "Barcha formalar" sozlamasiga bo'ysunadi */
  enabled: boolean | null;
  active: boolean;
  questions: { key: string; label: string; type?: string }[];
  mapping: Record<string, MetaTarget>;
  stage: string | null;
  organizationId: string | null;
  assigneeId: string | null;
}

export interface MetaFormsResponse {
  page: { pageId: string; pageName: string; allForms: boolean; stage: string; organizationId: string | null; assigneeId: string | null; subscribed: boolean };
  forms: MetaForm[];
}

export interface MetaEvent {
  id: string;
  leadgenId: string;
  pageName: string;
  formName: string | null;
  status: "new" | "done" | "skipped" | "error";
  attempts: number;
  error: string | null;
  leadName: string | null;
  createdAt: string;
}

export const fetchMetaStatus = async () => (await apiClient.get<MetaStatus>("/meta/status")).data;
export const saveMetaApp = async (payload: { appId?: string; appSecret?: string; loginConfigId?: string; dedupeByPhone?: boolean; notifyTelegram?: boolean }) => (await apiClient.put("/meta/app", payload)).data;
export const regenerateMetaVerifyToken = async () => (await apiClient.post<{ verifyToken: string }>("/meta/app/verify-token")).data;
export const startMetaOauth = async (returnUrl: string) => (await apiClient.post<{ url: string }>("/meta/oauth/start", { returnUrl })).data;
export const disconnectMeta = async () => (await apiClient.delete("/meta/connection")).data;
export const connectMetaPage = async (pageId: string) => (await apiClient.post(`/meta/pages/${pageId}/connect`)).data;
export const disconnectMetaPage = async (pageId: string) => (await apiClient.delete(`/meta/pages/${pageId}`)).data;
export const updateMetaPage = async (pageId: string, payload: { allForms?: boolean; stage?: string; organizationId?: string | null; assigneeId?: string | null }) =>
  (await apiClient.put(`/meta/pages/${pageId}`, payload)).data;
export const fetchMetaForms = async (pageId: string, refresh = false) => (await apiClient.get<MetaFormsResponse>(`/meta/pages/${pageId}/forms`, { params: refresh ? { refresh: 1 } : {} })).data;
export const saveMetaForm = async (formId: string, payload: { enabled?: boolean | null; mapping?: Record<string, MetaTarget>; stage?: string | null; organizationId?: string | null; assigneeId?: string | null }) =>
  (await apiClient.put(`/meta/forms/${formId}/mapping`, payload)).data;
export const fetchMetaEvents = async () => (await apiClient.get<MetaEvent[]>("/meta/events")).data;
export const retryMetaEvent = async (id: string) => (await apiClient.post(`/meta/events/${id}/retry`)).data;
