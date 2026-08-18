import { apiClient } from "./client";
import type { DocumentDto, PaginatedResult, DocumentType } from "@edo/shared-types";

export async function fetchDocuments(params?: { status?: string; page?: number }) {
  const { data } = await apiClient.get<PaginatedResult<DocumentDto>>("/documents", { params });
  return data;
}

export async function fetchDocument(id: string) {
  const { data } = await apiClient.get<DocumentDto>(`/documents/${id}`);
  return data;
}

export async function createDocument(input: { title: string; type: DocumentType; contractRefId?: string }) {
  const { data } = await apiClient.post<DocumentDto>("/documents", input);
  return data;
}

export async function createWorkflow(documentId: string, approverIds: string[]) {
  const { data } = await apiClient.post(`/documents/${documentId}/workflow`, {
    type: "SEQUENTIAL",
    approverIds,
  });
  return data;
}

export async function approveStep(stepId: string, comment?: string) {
  const { data } = await apiClient.post(`/documents/workflow-steps/${stepId}/approve`, { comment });
  return data;
}

export async function rejectStep(stepId: string, comment?: string) {
  const { data } = await apiClient.post(`/documents/workflow-steps/${stepId}/reject`, { comment });
  return data;
}

export async function signDocument(documentId: string) {
  const { data } = await apiClient.post(`/documents/${documentId}/sign`);
  return data;
}
