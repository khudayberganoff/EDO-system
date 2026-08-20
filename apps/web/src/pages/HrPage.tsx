import { useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X, Check, XCircle, Users, Palmtree } from "lucide-react";
import {
  fetchEmployees, createEmployee, deleteEmployee,
  fetchHrOrders, createHrOrder, deleteHrOrder,
  fetchContracts, createContract, deleteContract,
  fetchLeaves, createLeave, approveLeave, rejectLeave, deleteLeave,
  fetchHrStats, type Employee,
  fetchDepartments, createDepartment, deleteDepartment,
  fetchPositions, createPosition, deletePosition,
  fetchHolidays, createHoliday, deleteHoliday,
  fetchAttendance, setAttendance,
} from "../api/hr";
import { useAuth } from "../context/AuthContext";
import { formatUzPhone, normalizeUzPhone, formatMoney, parseMoney } from "../utils/format";

const ORDER_TYPES = [
  { value: "HIRE", label: "Ishga qabul qilish" },
  { value: "DISMISS", label: "Ishdan bo'shatish" },
  { value: "TRANSFER", label: "Lavozimga o'tkazish" },
  { value: "VACATION", label: "Ta'til berish" },
  { value: "BONUS", label: "Rag'batlantirish" },
  { value: "PENALTY", label: "Intizomiy jazo" },
  { value: "OTHER", label: "Boshqa" },
];

const CONTRACT_TYPES = [
  { value: "PERMANENT", label: "Muddatsiz" },
  { value: "FIXED_TERM", label: "Muddatli" },
  { value: "PART_TIME", label: "To'liqmas ish kuni" },
];

const LEAVE_TYPES = [
  { value: "ANNUAL", label: "Mehnat ta'tili" },
  { value: "UNPAID", label: "Haq to'lanmaydigan" },
  { value: "SICK", label: "Kasallik varaqasi" },
  { value: "MATERNITY", label: "Homiladorlik va tug'ish" },
  { value: "STUDY", label: "O'quv ta'tili" },
];

const label = (list: { value: string; label: string }[], v: string) => list.find((x) => x.value === v)?.label ?? v;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("uz-UZ") : "—");

export function HrPage() {
  const { tab } = useParams<{ tab?: string }>();
  const section = tab ?? "employees";
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN" || user?.role === "MANAGER";
  const { data: stats } = useQuery({ queryKey: ["hr", "stats"], queryFn: fetchHrStats });

  const TITLES: Record<string, { title: string; description: string }> = {
    employees: { title: "Xodimlar", description: "Shaxsiy kartoteka: lavozim, bo'lim va ish staji" },
    orders: { title: "Buyruqlar", description: "Ishga qabul, bo'shatish va boshqa kadrlar buyruqlari" },
    contracts: { title: "Mehnat shartnomalari", description: "Xodimlar bilan tuzilgan shartnomalar" },
    leaves: { title: "Ta'tillar", description: "Ta'til arizalari va grafigi" },
    attendance: { title: "Davomat", description: "Xodimlarning kunlik davomat jadvali" },
    departments: { title: "Bo'limlar", description: "Tashkilot bo'linmalari" },
    positions: { title: "Lavozimlar", description: "Shtat jadvali va lavozimlar" },
    holidays: { title: "Bayram kunlari", description: "Bayram va dam olish kunlari" },
  };
  const meta = TITLES[section] ?? TITLES.employees;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-slate-900">{meta.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{meta.description}</p>
      </div>

      {section === "employees" && stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatBox icon={Users} label="Jami xodimlar" value={stats.total} />
          <StatBox icon={Check} label="Faol" value={stats.active} accent="text-emerald-600 bg-emerald-50" />
          <StatBox icon={XCircle} label="Bo'shatilgan" value={stats.dismissed} accent="text-slate-500 bg-slate-100" />
          <StatBox icon={Palmtree} label="Ta'til kutilmoqda" value={stats.pendingLeaves} accent="text-amber-600 bg-amber-50" />
        </div>
      )}

      {section === "employees" && <EmployeesTab canEdit={canEdit} />}
      {section === "orders" && <OrdersTab canEdit={canEdit} />}
      {section === "contracts" && <ContractsTab canEdit={canEdit} />}
      {section === "leaves" && <LeavesTab canEdit={canEdit} />}
      {section === "attendance" && <AttendanceTab canEdit={canEdit} />}
      {section === "departments" && <DepartmentsTab canEdit={canEdit} />}
      {section === "positions" && <PositionsTab canEdit={canEdit} />}
      {section === "holidays" && <HolidaysTab canEdit={canEdit} />}
    </div>
  );
}

function StatBox({ icon: Icon, label, value, accent = "text-brand-700 bg-brand-50" }: { icon: any; label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${accent}`}><Icon size={16} /></div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

// ==================== XODIMLAR ====================

function EmployeesTab({ canEdit }: { canEdit: boolean }) {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["hr", "employees", search], queryFn: () => fetchEmployees({ search: search || undefined }) });
  const remove = useMutation({
    mutationFn: deleteEmployee,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hr"] }),
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="F.I.Sh., lavozim yoki bo'lim bo'yicha qidirish..."
          className="input max-w-md flex-1"
        />
        {canEdit && <NewButton onClick={() => setShowCreate(true)}>Yangi xodim</NewButton>}
      </div>

      <Table head={["F.I.Sh.", "Lavozim", "Bo'lim", "Ishga kirgan", "Staj", "Pasport muddati", "Holati", ""]}>
        {isLoading && <Empty colSpan={8}>Yuklanmoqda...</Empty>}
        {!isLoading && data?.length === 0 && <Empty colSpan={8}>Xodimlar topilmadi.</Empty>}
        {data?.map((e: Employee) => (
          <tr key={e.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-900">{e.fullName}
              {e.phone && <div className="text-xs font-normal text-slate-400">{e.phone}</div>}
            </td>
            <td className="px-4 py-3 text-slate-600">{e.position}</td>
            <td className="px-4 py-3 text-slate-500">{e.department ?? "—"}</td>
            <td className="px-4 py-3 text-slate-500">{fmtDate(e.hireDate)}</td>
            <td className="px-4 py-3 text-slate-500">{workExperience(e.hireDate, e.dismissDate)}</td>
            <td className="px-4 py-3">
              {(() => {
                const st = passportState(e.passportExpiry);
                if (!st) return <span className="text-slate-400">—</span>;
                if (st.level === "expired") return <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-800">Muddati tugagan</span>;
                if (st.level === "soon") return <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">{st.days} kun qoldi</span>;
                return <span className="text-slate-500">{fmtDate(e.passportExpiry)}</span>;
              })()}
            </td>
            <td className="px-4 py-3">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${e.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                {e.status === "ACTIVE" ? "Faol" : "Bo'shatilgan"}
              </span>
            </td>
            <td className="px-4 py-3">
              {canEdit && (
                <button onClick={() => confirm(`${e.fullName} o'chirilsinmi? Uning buyruq, shartnoma va ta'tillari ham o'chadi.`) && remove.mutate(e.id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50">
                  <Trash2 size={16} />
                </button>
              )}
            </td>
          </tr>
        ))}
      </Table>

      {showCreate && <EmployeeModal onClose={() => setShowCreate(false)} />}
    </>
  );
}

/**
 * Pasport muddati holati: tugagan / 60 kundan kam qolgan / normal.
 * Kadrlar bo'limi muddati tugayotgan hujjatlarni oldindan ko'rishi uchun.
 */
function passportState(expiry?: string | null): { level: "expired" | "soon" | "ok"; days: number } | null {
  if (!expiry) return null;
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (days < 0) return { level: "expired", days };
  if (days <= 60) return { level: "soon", days };
  return { level: "ok", days };
}

/** Ish staji: yil va oy hisobida */
function workExperience(hireDate: string, dismissDate?: string | null): string {
  const start = new Date(hireDate);
  const end = dismissDate ? new Date(dismissDate) : new Date();
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  if (months < 0) return "—";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years > 0 ? `${years} yil` : "", rest > 0 ? `${rest} oy` : ""].filter(Boolean).join(" ") || "1 oydan kam";
}

function EmployeeModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    fullName: "", position: "", department: "", hireDate: new Date().toISOString().slice(0, 10),
    birthDate: "", phone: "", email: "", passportSerial: "", passportIssueDate: "", passportExpiry: "", passportIssuedBy: "",
    pinfl: "", address: "", notes: "", dismissDate: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => createEmployee({
      ...form,
      department: form.department || undefined,
      birthDate: form.birthDate || undefined,
      phone: normalizeUzPhone(form.phone) || undefined,
      email: form.email || undefined,
      passportSerial: form.passportSerial || undefined,
      passportIssueDate: form.passportIssueDate || undefined,
      passportExpiry: form.passportExpiry || undefined,
      passportIssuedBy: form.passportIssuedBy || undefined,
      dismissDate: form.dismissDate || undefined,
      pinfl: form.pinfl || undefined,
      address: form.address || undefined,
      notes: form.notes || undefined,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["hr"] }); onClose(); },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Saqlab bo'lmadi."),
  });

  return (
    <Modal title="Yangi xodim" onClose={onClose}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="F.I.Sh. *"><input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} className="input" /></Field>
        <Field label="Lavozimi *"><input value={form.position} onChange={(e) => set("position", e.target.value)} className="input" /></Field>
        <Field label="Bo'limi"><input value={form.department} onChange={(e) => set("department", e.target.value)} className="input" /></Field>
        <Field label="Ishga kirgan sana *"><input type="date" value={form.hireDate} onChange={(e) => set("hireDate", e.target.value)} className="input" /></Field>
        <Field label="Tug'ilgan sana"><input type="date" value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)} className="input" /></Field>
        <Field label="Telefon"><input value={form.phone} onChange={(e) => set("phone", formatUzPhone(e.target.value))} placeholder="+998 90 123 45 67" className="input" /></Field>
        <Field label="Email"><input value={form.email} onChange={(e) => set("email", e.target.value)} className="input" /></Field>
        <Field label="Pasport"><input value={form.passportSerial} onChange={(e) => set("passportSerial", e.target.value.toUpperCase())} placeholder="AA1234567" className="input" /></Field>
        <Field label="Pasport berilgan sana"><input type="date" value={form.passportIssueDate} onChange={(e) => set("passportIssueDate", e.target.value)} className="input" /></Field>
        <Field label="Pasport amal qilish muddati"><input type="date" value={form.passportExpiry} onChange={(e) => set("passportExpiry", e.target.value)} className="input" /></Field>
        <Field label="Kim tomonidan berilgan"><input value={form.passportIssuedBy} onChange={(e) => set("passportIssuedBy", e.target.value)} placeholder="Chilonzor tumani IIB" className="input" /></Field>
        <Field label="Ishdan bo'shagan sana"><input type="date" value={form.dismissDate} onChange={(e) => set("dismissDate", e.target.value)} className="input" /></Field>
        <Field label="JSHSHIR"><input value={form.pinfl} onChange={(e) => set("pinfl", e.target.value.replace(/\D/g, "").slice(0, 14))} className="input" /></Field>
        <Field label="Manzil"><input value={form.address} onChange={(e) => set("address", e.target.value)} className="input" /></Field>
      </div>
      <div className="mt-4"><Field label="Izoh"><textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="input" /></Field></div>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      <Actions onClose={onClose} disabled={mutation.isPending || !form.fullName || !form.position} onSave={() => mutation.mutate()} />
    </Modal>
  );
}

// ==================== BUYRUQLAR ====================

function OrdersTab({ canEdit }: { canEdit: boolean }) {
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["hr", "orders"], queryFn: () => fetchHrOrders() });
  const remove = useMutation({ mutationFn: deleteHrOrder, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hr"] }) });

  return (
    <>
      {canEdit && <div className="mb-4 flex justify-end"><NewButton onClick={() => setShowCreate(true)}>Yangi buyruq</NewButton></div>}
      <Table head={["Raqami", "Sanasi", "Xodim", "Turi", "Mavzusi", ""]}>
        {isLoading && <Empty colSpan={6}>Yuklanmoqda...</Empty>}
        {!isLoading && data?.length === 0 && <Empty colSpan={6}>Buyruqlar topilmadi.</Empty>}
        {data?.map((o: any) => (
          <tr key={o.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-900">№ {o.number}</td>
            <td className="px-4 py-3 text-slate-500">{fmtDate(o.orderDate)}</td>
            <td className="px-4 py-3 text-slate-700">{o.employee?.fullName}</td>
            <td className="px-4 py-3 text-slate-500">{label(ORDER_TYPES, o.type)}</td>
            <td className="px-4 py-3 text-slate-600">{o.subject}</td>
            <td className="px-4 py-3">{canEdit && <button onClick={() => remove.mutate(o.id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={16} /></button>}</td>
          </tr>
        ))}
      </Table>
      {showCreate && <OrderModal onClose={() => setShowCreate(false)} />}
    </>
  );
}

function OrderModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: employees } = useQuery({ queryKey: ["hr", "employees", ""], queryFn: () => fetchEmployees() });
  const [form, setForm] = useState({ employeeId: "", type: "HIRE", number: "", orderDate: new Date().toISOString().slice(0, 10), subject: "", content: "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const mutation = useMutation({
    mutationFn: () => createHrOrder({ ...form, content: form.content || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["hr"] }); onClose(); },
  });

  return (
    <Modal title="Yangi buyruq" onClose={onClose}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Xodim *">
          <select value={form.employeeId} onChange={(e) => set("employeeId", e.target.value)} className="input">
            <option value="">— tanlang —</option>
            {employees?.map((e: Employee) => <option key={e.id} value={e.id}>{e.fullName} ({e.position})</option>)}
          </select>
        </Field>
        <Field label="Buyruq turi">
          <select value={form.type} onChange={(e) => set("type", e.target.value)} className="input">
            {ORDER_TYPES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </Field>
        <Field label="Buyruq raqami *"><input value={form.number} onChange={(e) => set("number", e.target.value)} placeholder="12-K" className="input" /></Field>
        <Field label="Sanasi *"><input type="date" value={form.orderDate} onChange={(e) => set("orderDate", e.target.value)} className="input" /></Field>
      </div>
      <div className="mt-4"><Field label="Mavzusi *"><input value={form.subject} onChange={(e) => set("subject", e.target.value)} placeholder="Ishga qabul qilish to'g'risida" className="input" /></Field></div>
      <div className="mt-4"><Field label="Matni"><textarea value={form.content} onChange={(e) => set("content", e.target.value)} rows={4} className="input" /></Field></div>
      <Actions onClose={onClose} disabled={mutation.isPending || !form.employeeId || !form.number || !form.subject} onSave={() => mutation.mutate()} />
    </Modal>
  );
}

// ==================== SHARTNOMALAR ====================

function ContractsTab({ canEdit }: { canEdit: boolean }) {
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["hr", "contracts"], queryFn: () => fetchContracts() });
  const remove = useMutation({ mutationFn: deleteContract, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hr"] }) });

  return (
    <>
      {canEdit && <div className="mb-4 flex justify-end"><NewButton onClick={() => setShowCreate(true)}>Yangi shartnoma</NewButton></div>}
      <Table head={["Raqami", "Xodim", "Turi", "Boshlanish", "Tugash", "Oylik maosh", ""]}>
        {isLoading && <Empty colSpan={7}>Yuklanmoqda...</Empty>}
        {!isLoading && data?.length === 0 && <Empty colSpan={7}>Shartnomalar topilmadi.</Empty>}
        {data?.map((c: any) => (
          <tr key={c.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-900">№ {c.number}</td>
            <td className="px-4 py-3 text-slate-700">{c.employee?.fullName}</td>
            <td className="px-4 py-3 text-slate-500">{label(CONTRACT_TYPES, c.type)}</td>
            <td className="px-4 py-3 text-slate-500">{fmtDate(c.startDate)}</td>
            <td className="px-4 py-3 text-slate-500">{c.endDate ? fmtDate(c.endDate) : "muddatsiz"}</td>
            <td className="px-4 py-3 text-slate-600">{c.salary ? `${formatMoney(String(c.salary))} so'm` : "—"}</td>
            <td className="px-4 py-3">{canEdit && <button onClick={() => remove.mutate(c.id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={16} /></button>}</td>
          </tr>
        ))}
      </Table>
      {showCreate && <ContractModal onClose={() => setShowCreate(false)} />}
    </>
  );
}

function ContractModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: employees } = useQuery({ queryKey: ["hr", "employees", ""], queryFn: () => fetchEmployees() });
  const [form, setForm] = useState({ employeeId: "", number: "", type: "PERMANENT", startDate: new Date().toISOString().slice(0, 10), endDate: "", salary: "", notes: "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const mutation = useMutation({
    mutationFn: () => createContract({
      employeeId: form.employeeId, number: form.number, type: form.type,
      startDate: form.startDate, endDate: form.endDate || undefined,
      salary: parseMoney(form.salary), notes: form.notes || undefined,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["hr"] }); onClose(); },
  });

  return (
    <Modal title="Yangi mehnat shartnomasi" onClose={onClose}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Xodim *">
          <select value={form.employeeId} onChange={(e) => set("employeeId", e.target.value)} className="input">
            <option value="">— tanlang —</option>
            {employees?.map((e: Employee) => <option key={e.id} value={e.id}>{e.fullName} ({e.position})</option>)}
          </select>
        </Field>
        <Field label="Shartnoma raqami *"><input value={form.number} onChange={(e) => set("number", e.target.value)} placeholder="MSH-2026-014" className="input" /></Field>
        <Field label="Turi">
          <select value={form.type} onChange={(e) => set("type", e.target.value)} className="input">
            {CONTRACT_TYPES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </Field>
        <Field label="Oylik maosh (so'm)"><input value={form.salary} onChange={(e) => set("salary", formatMoney(e.target.value))} placeholder="5 500 000" className="input" /></Field>
        <Field label="Boshlanish sanasi *"><input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className="input" /></Field>
        <Field label="Tugash sanasi"><input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className="input" /></Field>
      </div>
      <div className="mt-4"><Field label="Izoh"><textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="input" /></Field></div>
      <Actions onClose={onClose} disabled={mutation.isPending || !form.employeeId || !form.number} onSave={() => mutation.mutate()} />
    </Modal>
  );
}

// ==================== TA'TILLAR ====================

function LeavesTab({ canEdit }: { canEdit: boolean }) {
  const [showCreate, setShowCreate] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["hr", "leaves"], queryFn: () => fetchLeaves() });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["hr"] });
  const approve = useMutation({ mutationFn: approveLeave, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: deleteLeave, onSuccess: invalidate });

  const STATUS_STYLE: Record<string, string> = {
    REQUESTED: "bg-amber-100 text-amber-800",
    APPROVED: "bg-emerald-100 text-emerald-800",
    REJECTED: "bg-rose-100 text-rose-800",
  };
  const STATUS_LABEL: Record<string, string> = { REQUESTED: "Kutilmoqda", APPROVED: "Tasdiqlangan", REJECTED: "Rad etilgan" };

  return (
    <>
      {canEdit && <div className="mb-4 flex justify-end"><NewButton onClick={() => setShowCreate(true)}>Yangi ta'til</NewButton></div>}
      <Table head={["Xodim", "Turi", "Boshlanish", "Tugash", "Kunlar", "Holati", ""]}>
        {isLoading && <Empty colSpan={7}>Yuklanmoqda...</Empty>}
        {!isLoading && data?.length === 0 && <Empty colSpan={7}>Ta'tillar topilmadi.</Empty>}
        {data?.map((l: any) => (
          <tr key={l.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-900">{l.employee?.fullName}</td>
            <td className="px-4 py-3 text-slate-500">{label(LEAVE_TYPES, l.type)}</td>
            <td className="px-4 py-3 text-slate-500">{fmtDate(l.startDate)}</td>
            <td className="px-4 py-3 text-slate-500">{fmtDate(l.endDate)}</td>
            <td className="px-4 py-3 text-slate-600">{l.days}</td>
            <td className="px-4 py-3">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[l.status]}`}>{STATUS_LABEL[l.status]}</span>
              {l.rejectionReason && <div className="mt-1 text-xs text-rose-600">{l.rejectionReason}</div>}
            </td>
            <td className="px-4 py-3">
              {canEdit && (
                <div className="flex gap-1">
                  {l.status === "REQUESTED" && (
                    <>
                      <button title="Tasdiqlash" onClick={() => approve.mutate(l.id)} className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"><Check size={16} /></button>
                      <button title="Rad etish" onClick={() => setRejectTarget(l)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><XCircle size={16} /></button>
                    </>
                  )}
                  <button title="O'chirish" onClick={() => remove.mutate(l.id)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><Trash2 size={16} /></button>
                </div>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {showCreate && <LeaveModal onClose={() => setShowCreate(false)} />}
      {rejectTarget && <RejectLeaveModal leave={rejectTarget} onClose={() => setRejectTarget(null)} />}
    </>
  );
}

function LeaveModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: employees } = useQuery({ queryKey: ["hr", "employees", ""], queryFn: () => fetchEmployees() });
  const [form, setForm] = useState({ employeeId: "", type: "ANNUAL", startDate: "", endDate: "", reason: "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const mutation = useMutation({
    mutationFn: () => createLeave({ ...form, reason: form.reason || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["hr"] }); onClose(); },
  });

  const days = form.startDate && form.endDate
    ? Math.floor((new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) / 86400000) + 1
    : 0;

  return (
    <Modal title="Yangi ta'til" onClose={onClose}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Xodim *">
          <select value={form.employeeId} onChange={(e) => set("employeeId", e.target.value)} className="input">
            <option value="">— tanlang —</option>
            {employees?.map((e: Employee) => <option key={e.id} value={e.id}>{e.fullName} ({e.position})</option>)}
          </select>
        </Field>
        <Field label="Ta'til turi">
          <select value={form.type} onChange={(e) => set("type", e.target.value)} className="input">
            {LEAVE_TYPES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </Field>
        <Field label="Boshlanish sanasi *"><input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className="input" /></Field>
        <Field label="Tugash sanasi *"><input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className="input" /></Field>
      </div>
      {days > 0 && <p className="mt-3 text-sm text-slate-500">Jami: <strong className="text-slate-800">{days} kun</strong></p>}
      <div className="mt-4"><Field label="Sabab / izoh"><textarea value={form.reason} onChange={(e) => set("reason", e.target.value)} rows={2} className="input" /></Field></div>
      <Actions onClose={onClose} disabled={mutation.isPending || !form.employeeId || !form.startDate || !form.endDate || days <= 0} onSave={() => mutation.mutate()} />
    </Modal>
  );
}

function RejectLeaveModal({ leave, onClose }: { leave: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => rejectLeave(leave.id, reason),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["hr"] }); onClose(); },
  });

  return (
    <Modal title="Ta'tilni rad etish" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">{leave.employee?.fullName} — {fmtDate(leave.startDate)} / {fmtDate(leave.endDate)}</p>
      <Field label="Rad etish sababi *">
        <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="input" />
      </Field>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm">Bekor qilish</button>
        <button disabled={mutation.isPending || reason.trim().length < 3} onClick={() => mutation.mutate()} className="rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">Rad etish</button>
      </div>
    </Modal>
  );
}


// ==================== DAVOMAT ====================

const ATT_STATUSES = [
  { value: "PRESENT", label: "Ishda", short: "✓", cls: "bg-emerald-100 text-emerald-700" },
  { value: "LATE", label: "Kechikdi", short: "!", cls: "bg-amber-100 text-amber-700" },
  { value: "ABSENT", label: "Kelmadi", short: "×", cls: "bg-rose-100 text-rose-700" },
  { value: "LEAVE", label: "Ta'tilda", short: "T", cls: "bg-sky-100 text-sky-700" },
  { value: "SICK", label: "Kasal", short: "K", cls: "bg-violet-100 text-violet-700" },
  { value: "BUSINESS_TRIP", label: "Xizmat safari", short: "S", cls: "bg-indigo-100 text-indigo-700" },
  { value: "DAYOFF", label: "Dam olish", short: "D", cls: "bg-slate-100 text-slate-500" },
];

const UZ_MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"];
const WEEKDAY_SHORT = ["ya", "du", "se", "ch", "pa", "ju", "sh"];

function AttendanceTab({ canEdit }: { canEdit: boolean }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [cell, setCell] = useState<{ employeeId: string; day: number; name: string } | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["hr", "attendance", year, month],
    queryFn: () => fetchAttendance(year, month),
  });

  const save = useMutation({
    mutationFn: setAttendance,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hr", "attendance"] }),
  });

  const days = Array.from({ length: data?.daysInMonth ?? 30 }, (_, i) => i + 1);
  const statusOf = (v?: string) => ATT_STATUSES.find((s) => s.value === v);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input max-w-[180px]">
          {UZ_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input max-w-[120px]">
          {[year - 2, year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        <div className="ml-auto flex flex-wrap gap-2">
          {ATT_STATUSES.map((s) => (
            <span key={s.value} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>
              <span className="font-bold">{s.short}</span> {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left">Xodim</th>
              {days.map((d) => {
                const dow = new Date(year, month - 1, d).getDay();
                const isWeekend = dow === 0 || dow === 6;
                const holiday = data?.holidays?.[String(d)];
                return (
                  <th key={d} title={holiday} className={`w-9 px-1 py-2 text-center font-medium ${holiday ? "text-rose-600" : isWeekend ? "text-rose-400" : "text-slate-500"}`}>
                    <div>{d}</div>
                    <div className="text-[10px] font-normal opacity-70">{WEEKDAY_SHORT[dow]}</div>
                  </th>
                );
              })}
              <th className="px-3 py-2 text-center">Jami</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && <tr><td colSpan={days.length + 2} className="px-4 py-8 text-center text-slate-400">Yuklanmoqda...</td></tr>}
            {!isLoading && data?.employees.length === 0 && <tr><td colSpan={days.length + 2} className="px-4 py-8 text-center text-slate-400">Faol xodimlar yo'q.</td></tr>}
            {data?.employees.map((e) => {
              const present = days.filter((d) => ["PRESENT", "LATE"].includes(e.days?.[String(d)]?.status ?? "")).length;
              return (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="sticky left-0 z-10 bg-white px-4 py-2.5 hover:bg-slate-50">
                    <div className="font-medium text-slate-900">{e.fullName}</div>
                    <div className="text-xs text-slate-400">{e.position}</div>
                  </td>
                  {days.map((d) => {
                    const rec = e.days?.[String(d)];
                    const st = statusOf(rec?.status);
                    const holiday = data?.holidays?.[String(d)];
                    return (
                      <td key={d} className="px-0.5 py-2 text-center">
                        <button
                          disabled={!canEdit}
                          onClick={() => canEdit && setCell({ employeeId: e.id, day: d, name: e.fullName })}
                          title={st ? st.label : holiday ? holiday : "Belgilanmagan"}
                          className={`mx-auto flex h-6 w-6 items-center justify-center rounded text-xs font-bold transition ${
                            st ? st.cls : holiday ? "bg-rose-50 text-rose-400" : "text-slate-200 hover:bg-slate-100"
                          } ${canEdit ? "cursor-pointer" : "cursor-default"}`}
                        >
                          {st ? st.short : holiday ? "B" : "·"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center text-slate-600">{present} / {data?.daysInMonth}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {cell && (
        <AttendanceCellModal
          cell={cell}
          year={year}
          month={month}
          onClose={() => setCell(null)}
          onSave={(status, note, lateMinutes) => {
            const date = `${year}-${String(month).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
            save.mutate({ employeeId: cell.employeeId, date, status, note, lateMinutes });
            setCell(null);
          }}
        />
      )}
    </>
  );
}

function AttendanceCellModal({ cell, year, month, onClose, onSave }: {
  cell: { employeeId: string; day: number; name: string };
  year: number; month: number;
  onClose: () => void;
  onSave: (status: string, note?: string, lateMinutes?: number) => void;
}) {
  const [status, setStatus] = useState("PRESENT");
  const [note, setNote] = useState("");
  const [lateMinutes, setLateMinutes] = useState("");

  return (
    <Modal title={`${cell.name} — ${cell.day} ${UZ_MONTHS[month - 1]} ${year}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ATT_STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatus(s.value)}
            className={`rounded-lg border px-3 py-3 text-sm font-medium transition ${
              status === s.value ? "border-brand-700 bg-brand-50 text-brand-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className={`mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold ${s.cls}`}>{s.short}</span>
            {s.label}
          </button>
        ))}
      </div>

      {status === "LATE" && (
        <div className="mt-4">
          <Field label="Necha daqiqa kechikdi">
            <input type="number" min="1" value={lateMinutes} onChange={(e) => setLateMinutes(e.target.value)} className="input" />
          </Field>
        </div>
      )}

      <div className="mt-4">
        <Field label="Izoh"><input value={note} onChange={(e) => setNote(e.target.value)} className="input" /></Field>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm">Bekor qilish</button>
        <button
          onClick={() => onSave(status, note || undefined, lateMinutes ? Number(lateMinutes) : undefined)}
          className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Saqlash
        </button>
      </div>
    </Modal>
  );
}

// ==================== BO'LIMLAR ====================

function DepartmentsTab({ canEdit }: { canEdit: boolean }) {
  const [name, setName] = useState("");
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["hr", "departments"], queryFn: fetchDepartments });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["hr"] });
  const add = useMutation({ mutationFn: () => createDepartment({ name }), onSuccess: () => { setName(""); invalidate(); } });
  const remove = useMutation({ mutationFn: deleteDepartment, onSuccess: invalidate });

  return (
    <>
      {canEdit && (
        <div className="mb-4 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bo'lim nomi (masalan: Moliya bo'limi)" className="input max-w-md flex-1" />
          <NewButton onClick={() => name.trim() && add.mutate()}>Qo'shish</NewButton>
        </div>
      )}
      <Table head={["Bo'lim nomi", "Xodimlar", "Lavozimlar", ""]}>
        {isLoading && <Empty colSpan={4}>Yuklanmoqda...</Empty>}
        {!isLoading && data?.length === 0 && <Empty colSpan={4}>Bo'limlar qo'shilmagan.</Empty>}
        {data?.map((d: any) => (
          <tr key={d.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-900">{d.name}</td>
            <td className="px-4 py-3 text-slate-500">{d._count?.employees ?? 0}</td>
            <td className="px-4 py-3 text-slate-500">{d._count?.positions ?? 0}</td>
            <td className="px-4 py-3">{canEdit && <button onClick={() => remove.mutate(d.id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={16} /></button>}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

// ==================== LAVOZIMLAR ====================

function PositionsTab({ canEdit }: { canEdit: boolean }) {
  const [form, setForm] = useState({ title: "", departmentId: "", headcount: "1" });
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["hr", "positions"], queryFn: fetchPositions });
  const { data: departments } = useQuery({ queryKey: ["hr", "departments"], queryFn: fetchDepartments });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["hr"] });
  const add = useMutation({
    mutationFn: () => createPosition({ title: form.title, departmentId: form.departmentId || undefined, headcount: Number(form.headcount) || 1 }),
    onSuccess: () => { setForm({ title: "", departmentId: "", headcount: "1" }); invalidate(); },
  });
  const remove = useMutation({ mutationFn: deletePosition, onSuccess: invalidate });

  return (
    <>
      {canEdit && (
        <div className="mb-4 flex flex-wrap gap-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Lavozim nomi" className="input max-w-xs flex-1" />
          <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="input max-w-xs">
            <option value="">— bo'limsiz —</option>
            {departments?.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <input type="number" min="1" value={form.headcount} onChange={(e) => setForm({ ...form, headcount: e.target.value })} className="input max-w-[120px]" placeholder="Shtat" />
          <NewButton onClick={() => form.title.trim() && add.mutate()}>Qo'shish</NewButton>
        </div>
      )}
      <Table head={["Lavozim", "Bo'lim", "Shtat birligi", ""]}>
        {isLoading && <Empty colSpan={4}>Yuklanmoqda...</Empty>}
        {!isLoading && data?.length === 0 && <Empty colSpan={4}>Lavozimlar qo'shilmagan.</Empty>}
        {data?.map((p: any) => (
          <tr key={p.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-900">{p.title}</td>
            <td className="px-4 py-3 text-slate-500">{p.department?.name ?? "—"}</td>
            <td className="px-4 py-3 text-slate-500">{p.headcount}</td>
            <td className="px-4 py-3">{canEdit && <button onClick={() => remove.mutate(p.id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={16} /></button>}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

// ==================== BAYRAM KUNLARI ====================

function HolidaysTab({ canEdit }: { canEdit: boolean }) {
  const [form, setForm] = useState({ date: "", name: "" });
  const queryClient = useQueryClient();
  const year = new Date().getFullYear();
  const { data, isLoading } = useQuery({ queryKey: ["hr", "holidays", year], queryFn: () => fetchHolidays(year) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["hr"] });
  const add = useMutation({ mutationFn: () => createHoliday(form), onSuccess: () => { setForm({ date: "", name: "" }); invalidate(); } });
  const remove = useMutation({ mutationFn: deleteHoliday, onSuccess: invalidate });

  return (
    <>
      {canEdit && (
        <div className="mb-4 flex flex-wrap gap-2">
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input max-w-[200px]" />
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bayram nomi (masalan: Mustaqillik kuni)" className="input max-w-md flex-1" />
          <NewButton onClick={() => form.date && form.name.trim() && add.mutate()}>Qo'shish</NewButton>
        </div>
      )}
      <Table head={["Sana", "Nomi", ""]}>
        {isLoading && <Empty colSpan={3}>Yuklanmoqda...</Empty>}
        {!isLoading && data?.length === 0 && <Empty colSpan={3}>Bu yil uchun bayram kunlari kiritilmagan.</Empty>}
        {data?.map((h: any) => (
          <tr key={h.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-900">{fmtDate(h.date)}</td>
            <td className="px-4 py-3 text-slate-600">{h.name}</td>
            <td className="px-4 py-3">{canEdit && <button onClick={() => remove.mutate(h.id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={16} /></button>}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

// ==================== UMUMIY KOMPONENTLAR ====================

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>{head.map((h, i) => <th key={i} className="px-4 py-3">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return <tr><td colSpan={colSpan} className="px-4 py-8 text-center text-slate-400">{children}</td></tr>;
}

function NewButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 rounded-lg bg-brand-800 px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-brand-700">
      <Plus size={18} /> {children}
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>{children}</label>;
}

function Actions({ onClose, onSave, disabled }: { onClose: () => void; onSave: () => void; disabled: boolean }) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <button onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm">Bekor qilish</button>
      <button disabled={disabled} onClick={onSave} className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">Saqlash</button>
    </div>
  );
}
