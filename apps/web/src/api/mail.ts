import { apiClient } from "./client";

export interface MailAccount {
  id: string;
  name: string;
  email: string;
  imapHost: string;
  imapPort: number;
  useSsl: boolean;
  username: string;
  isActive: boolean;
  lastSyncAt?: string | null;
  lastError?: string | null;
  _count?: { mails: number };
}

export interface IncomingMail {
  id: string;
  fromName?: string | null;
  fromEmail: string;
  subject: string;
  body?: string | null;
  receivedAt: string;
  hasAttachments: boolean;
  isRead: boolean;
  account?: { name: string; email: string };
}

export async function fetchMailAccounts() {
  const { data } = await apiClient.get<MailAccount[]>("/mail/accounts");
  return data;
}
export async function createMailAccount(payload: Record<string, unknown>) {
  const { data } = await apiClient.post("/mail/accounts", payload);
  return data;
}
export async function updateMailAccount(id: string, payload: Record<string, unknown>) {
  const { data } = await apiClient.patch(`/mail/accounts/${id}`, payload);
  return data;
}
export async function deleteMailAccount(id: string) {
  const { data } = await apiClient.delete(`/mail/accounts/${id}`);
  return data;
}
export async function testMailAccount(id: string) {
  const { data } = await apiClient.post<{ ok: boolean; message: string }>(`/mail/accounts/${id}/test`);
  return data;
}
export async function syncMailAccount(id: string) {
  const { data } = await apiClient.post<{ imported: number }>(`/mail/accounts/${id}/sync`);
  return data;
}
export async function fetchInbox(params: { accountId?: string; unread?: boolean } = {}) {
  const { data } = await apiClient.get<IncomingMail[]>("/mail/inbox", {
    params: { accountId: params.accountId, unread: params.unread ? "true" : undefined },
  });
  return data;
}
export async function markMailRead(id: string, isRead: boolean) {
  const { data } = await apiClient.patch(`/mail/inbox/${id}/read`, { isRead });
  return data;
}
export async function deleteMail(id: string) {
  const { data } = await apiClient.delete(`/mail/inbox/${id}`);
  return data;
}
