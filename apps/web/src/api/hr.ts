import { apiClient } from "./client";

export interface Employee {
  id: string;
  fullName: string;
  position: string;
  department?: string;
  hireDate: string;
  birthDate?: string;
  phone?: string;
  email?: string;
  passportSerial?: string;
  pinfl?: string;
  address?: string;
  status: string;
  dismissDate?: string;
  notes?: string;
  _count?: { orders: number; contracts: number; leaves: number };
}

// --- Xodimlar ---
export async function fetchEmployees(params: { search?: string; status?: string } = {}) {
  const { data } = await apiClient.get<Employee[]>("/hr/employees", { params });
  return data;
}
export async function fetchEmployee(id: string) {
  const { data } = await apiClient.get(`/hr/employees/${id}`);
  return data;
}
export async function createEmployee(payload: Record<string, unknown>) {
  const { data } = await apiClient.post("/hr/employees", payload);
  return data;
}
export async function updateEmployee(id: string, payload: Record<string, unknown>) {
  const { data } = await apiClient.patch(`/hr/employees/${id}`, payload);
  return data;
}
export async function deleteEmployee(id: string) {
  const { data } = await apiClient.delete(`/hr/employees/${id}`);
  return data;
}

// --- Buyruqlar ---
export async function fetchHrOrders(params: { employeeId?: string; type?: string } = {}) {
  const { data } = await apiClient.get("/hr/orders", { params });
  return data as any[];
}
export async function createHrOrder(payload: Record<string, unknown>) {
  const { data } = await apiClient.post("/hr/orders", payload);
  return data;
}
export async function deleteHrOrder(id: string) {
  const { data } = await apiClient.delete(`/hr/orders/${id}`);
  return data;
}

// --- Mehnat shartnomalari ---
export async function fetchContracts(params: { employeeId?: string } = {}) {
  const { data } = await apiClient.get("/hr/contracts", { params });
  return data as any[];
}
export async function createContract(payload: Record<string, unknown>) {
  const { data } = await apiClient.post("/hr/contracts", payload);
  return data;
}
export async function deleteContract(id: string) {
  const { data } = await apiClient.delete(`/hr/contracts/${id}`);
  return data;
}

// --- Ta'tillar ---
export async function fetchLeaves(params: { employeeId?: string; status?: string } = {}) {
  const { data } = await apiClient.get("/hr/leaves", { params });
  return data as any[];
}
export async function createLeave(payload: Record<string, unknown>) {
  const { data } = await apiClient.post("/hr/leaves", payload);
  return data;
}
export async function approveLeave(id: string) {
  const { data } = await apiClient.post(`/hr/leaves/${id}/approve`);
  return data;
}
export async function rejectLeave(id: string, reason: string) {
  const { data } = await apiClient.post(`/hr/leaves/${id}/reject`, { reason });
  return data;
}
export async function deleteLeave(id: string) {
  const { data } = await apiClient.delete(`/hr/leaves/${id}`);
  return data;
}

export async function fetchHrStats() {
  const { data } = await apiClient.get("/hr/stats");
  return data as { total: number; active: number; dismissed: number; pendingLeaves: number };
}
