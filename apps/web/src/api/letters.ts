import { apiClient } from "./client";
import type { LetterDirection, LetterType, LetterStatus } from "@edo/shared-types";

export async function fetchLetters(params?: { direction?: LetterDirection; type?: LetterType; status?: LetterStatus; page?: number }) {
  const { data } = await apiClient.get("/letters", { params }); return data;
}
export async function fetchLetterCounts() { const { data } = await apiClient.get("/letters/counts"); return data; }
export async function fetchAiAgentStats() { const { data } = await apiClient.get("/letters/ai-agent/stats"); return data; }
export async function createLetter(input: any) { const { data } = await apiClient.post("/letters", input); return data; }
export async function aiGenerateLetter(input: any) { const { data } = await apiClient.post("/letters/ai-generate", input); return data; }
export async function submitLetter(id: string) { const { data } = await apiClient.post(`/letters/${id}/submit`); return data; }
export async function approveLetter(id: string) { const { data } = await apiClient.post(`/letters/${id}/approve`); return data; }
export async function rejectLetter(id: string, reason: string) { const { data } = await apiClient.post(`/letters/${id}/reject`, { reason }); return data; }
export async function deleteLetter(id: string) { const { data } = await apiClient.post(`/letters/${id}/delete`); return data; }
export async function fetchLetter(id: string) { const { data } = await apiClient.get(`/letters/${id}`); return data; }
export async function fetchArchive() { const { data } = await apiClient.get("/letters/archive"); return data; }
export async function fetchNextLetterNumber(type: LetterType) { const { data } = await apiClient.get("/letters/next-number", { params: { type } }); return data; }
export async function exportLetters(params?: any) { const { data } = await apiClient.get<Blob>("/letters/export", { params, responseType: "blob" }); return data; }
export async function downloadLetter(id: string, kind: "draft" | "final") { const { data } = await apiClient.get<Blob>(`/letters/${id}/download/${kind}`, { responseType: "blob" }); return data; }
export async function downloadLetterPdf(id: string) { const { data } = await apiClient.get<Blob>(`/letters/${id}/download-pdf`, { responseType: "blob" }); return data; }
export async function fetchLetterRenderedText(id: string) { const { data } = await apiClient.get<{ paragraphs: string[] }>(`/letters/${id}/rendered-text`); return data.paragraphs; }
export async function fetchLetterheadStatus() { const { data } = await apiClient.get("/letters/letterhead"); return data as { exists: boolean; url: string | null }; }
export async function uploadLetterhead(file: File) { const form = new FormData(); form.append("file", file); const { data } = await apiClient.post("/letters/letterhead", form, { headers: { "Content-Type": "multipart/form-data" } }); return data; }
export async function removeLetterhead() { const { data } = await apiClient.delete("/letters/letterhead"); return data; }
