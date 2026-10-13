import { apiClient } from "./client";

export type BoardStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
export type BoardPriority = "LOW" | "MEDIUM" | "HIGH";

export interface Board {
  id: string;
  name: string;
  /** null - umumiy doska, aks holda shaxsiy doska egasi */
  ownerId: string | null;
}

export interface BoardComment {
  id: string;
  text: string;
  createdAt: string;
  author: { id: string; fullName: string };
}

export interface BoardTask {
  id: string;
  boardId: string;
  _count: { comments: number };
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

export async function fetchBoards() {
  const { data } = await apiClient.get<Board[]>("/board/boards");
  return data;
}

export async function createBoard(payload: { name: string; personal?: boolean }) {
  const { data } = await apiClient.post<Board>("/board/boards", payload);
  return data;
}

export async function renameBoard(id: string, name: string) {
  const { data } = await apiClient.patch<Board>(`/board/boards/${id}`, { name });
  return data;
}

export async function deleteBoard(id: string) {
  const { data } = await apiClient.delete(`/board/boards/${id}`);
  return data;
}

export async function fetchBoardTasks(boardId: string) {
  const { data } = await apiClient.get<BoardTask[]>("/board/tasks", { params: { boardId } });
  return data;
}

export async function fetchBoardComments(taskId: string) {
  const { data } = await apiClient.get<BoardComment[]>(`/board/tasks/${taskId}/comments`);
  return data;
}

export async function addBoardComment(taskId: string, text: string) {
  const { data } = await apiClient.post<BoardComment>(`/board/tasks/${taskId}/comments`, { text });
  return data;
}

export async function deleteBoardComment(taskId: string, commentId: string) {
  const { data } = await apiClient.delete(`/board/tasks/${taskId}/comments/${commentId}`);
  return data;
}

export async function fetchBoardUsers() {
  const { data } = await apiClient.get<{ id: string; fullName: string }[]>("/board/users");
  return data;
}

export async function createBoardTask(payload: BoardTaskInput & { title: string; boardId: string }) {
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
