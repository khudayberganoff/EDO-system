import { apiClient } from "./client";

export interface DailyTask {
  id: string;
  userId: string;
  date: string;
  time: string | null;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function fetchDailyTasks(date: string) {
  const { data } = await apiClient.get<DailyTask[]>("/daily-tasks", { params: { date } });
  return data;
}

/** Butun oy uchun vazifalar - kalendar tokchalarida nuqta bilan belgilash uchun. month: "YYYY-MM" */
export async function fetchDailyTasksForMonth(month: string) {
  const { data } = await apiClient.get<DailyTask[]>("/daily-tasks", { params: { month } });
  return data;
}

export async function createDailyTask(payload: { date: string; time?: string; title: string }) {
  const { data } = await apiClient.post<DailyTask>("/daily-tasks", payload);
  return data;
}

export async function updateDailyTask(id: string, payload: { title?: string; time?: string; done?: boolean }) {
  const { data } = await apiClient.patch<DailyTask>(`/daily-tasks/${id}`, payload);
  return data;
}

export async function deleteDailyTask(id: string) {
  const { data } = await apiClient.delete(`/daily-tasks/${id}`);
  return data;
}
