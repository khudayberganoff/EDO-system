import { apiClient } from "./client";

export type BoardStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
export type BoardPriority = "LOW" | "MEDIUM" | "HIGH";

export interface BoardTask {
  id: string;
  title: string;
  description: string | null;
  status: BoardStatus;
  priority: BoardPriority;
  dueDate: string | null;
  position: number;
  assignee: { id: string; fullName: string } | null;
  creator: { id: string; fullName: string };
}

export interface BoardTaskInput {
  title?: string;
  description?: string;
  status?: BoardStatus;
  priority?: BoardPriority;
  dueDate?: string | null;
  assigneeId?: string | null;
}

export async function fetchBoardTasks() {
  const { data } = await apiClient.get<BoardTask[]>("/board/tasks");
  return data;
}

export async function fetchBoardUsers() {
  const { data } = await apiClient.get<{ id: string; fullName: string }[]>("/board/users");
  return data;
}

export async function createBoardTask(payload: BoardTaskInput & { title: string }) {
  const { data } = await apiClient.post<BoardTask>("/board/tasks", payload);
  return data;
}

export async function updateBoardTask(id: string, payload: BoardTaskInput) {
  const { data } = await apiClient.patch<BoardTask>(`/board/tasks/${id}`, payload);
  return data;
}

export async function moveBoardTask(id: string, payload: { status: BoardStatus; position: number }) {
  const { data } = await apiClient.patch<BoardTask[]>(`/board/tasks/${id}/move`, payload);
  return data;
}

export async function deleteBoardTask(id: string) {
  const { data } = await apiClient.delete(`/board/tasks/${id}`);
  return data;
}
