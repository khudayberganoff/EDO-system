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
  passportIssueDate?: string;
  passportExpiry?: string;
  passportIssuedBy?: string;
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

// --- Bo'limlar ---
export async function fetchDepartments() {
  const { data } = await apiClient.get("/hr/departments");
  return data as any[];
}
export async function createDepartment(payload: { name: string; parentId?: string }) {
  const { data } = await apiClient.post("/hr/departments", payload);
  return data;
}
export async function deleteDepartment(id: string) {
  const { data } = await apiClient.delete(`/hr/departments/${id}`);
  return data;
}

// --- Lavozimlar ---
export async function fetchPositions() {
  const { data } = await apiClient.get("/hr/positions");
  return data as any[];
}
export async function createPosition(payload: { title: string; departmentId?: string; headcount?: number }) {
  const { data } = await apiClient.post("/hr/positions", payload);
  return data;
}
export async function deletePosition(id: string) {
  const { data } = await apiClient.delete(`/hr/positions/${id}`);
  return data;
}

// --- Bayram kunlari ---
export async function fetchHolidays(year?: number) {
  const { data } = await apiClient.get("/hr/holidays", { params: { year } });
  return data as any[];
}
export async function createHoliday(payload: { date: string; name: string; type?: string }) {
  const { data } = await apiClient.post("/hr/holidays", payload);
  return data;
}
export async function deleteHoliday(id: string) {
  const { data } = await apiClient.delete(`/hr/holidays/${id}`);
  return data;
}

// --- Davomat ---
export interface AttendanceMonth {
  year: number;
  month: number;
  daysInMonth: number;
  holidays: Record<string, string>;
  employees: {
    id: string;
    fullName: string;
    position: string;
    department?: string;
    days: Record<string, { status: string; note?: string; lateMinutes?: number }>;
  }[];
}
export async function fetchAttendance(year: number, month: number) {
  const { data } = await apiClient.get<AttendanceMonth>("/hr/attendance", { params: { year, month } });
  return data;
}
export async function setAttendance(payload: { employeeId: string; date: string; status: string; lateMinutes?: number; note?: string }) {
  const { data } = await apiClient.post("/hr/attendance", payload);
  return data;
}
