import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Trash2, CalendarDays } from "lucide-react";
import { createDailyTask, deleteDailyTask, fetchDailyTasks, fetchDailyTasksForMonth, updateDailyTask, type DailyTask } from "../api/dailyTasks";
import { formatUzGregorian } from "../utils/hijriDate";

const WEEKDAYS_UZ = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

/** Dushanba=0 ... Yakshanba=6 bo'yicha hisoblangan hafta kuni (JS'dagi getDay() Yakshanba=0 dan farqli). */
function mondayFirstWeekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/**
 * Bosh sahifadagi kundalik reja/vazifalar bloki - oy kalendari (30/31 kunlik
 * to'r) orqali kun tanlanadi, vazifa reja borligi kunning ostida nuqta bilan
 * ko'rinadi. Tanlangan kun uchun (ixtiyoriy ravishda SOAT bilan) shaxsiy
 * vazifalar yoziladi va bajarilganini belgilash mumkin. Har kim faqat
 * o'zining ro'yxatini ko'radi.
 */
export function DailyPlanner() {
  const today = new Date();
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const dateKey = toDateKey(selectedDate);
  const monthKey = toMonthKey(visibleMonth);
  const queryClient = useQueryClient();

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["daily-tasks", dateKey],
    queryFn: () => fetchDailyTasks(dateKey),
  });

  // Kalendar tokchalarida "shu kunga reja yozilgan" nuqtasini ko'rsatish uchun - butun oy bo'yicha bitta so'rov.
  const { data: monthTasks } = useQuery({
    queryKey: ["daily-tasks", "month", monthKey],
    queryFn: () => fetchDailyTasksForMonth(monthKey),
  });
  const daysWithTasks = useMemo(() => new Set((monthTasks ?? []).map((t) => t.date.slice(0, 10))), [monthTasks]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["daily-tasks", dateKey] });
    queryClient.invalidateQueries({ queryKey: ["daily-tasks", "month", monthKey] });
  };
  const createMutation = useMutation({ mutationFn: createDailyTask, onSuccess: invalidateAll });
  const toggleMutation = useMutation({
    mutationFn: (t: DailyTask) => updateDailyTask(t.id, { done: !t.done }),
    onSuccess: invalidateAll,
  });
  const removeMutation = useMutation({ mutationFn: deleteDailyTask, onSuccess: invalidateAll });

  const [time, setTime] = useState("");
  const [title, setTitle] = useState("");

  const submit = () => {
    if (!title.trim()) return;
    createMutation.mutate({ date: dateKey, time: time || undefined, title: title.trim() });
    setTitle("");
    setTime("");
  };

  const sorted = [...(tasks ?? [])].sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });

  // Kalendar to'ri: ushbu oydagi har bir kun uchun bitta katak, oy boshigacha bo'sh joy bilan.
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const leadingBlanks = mondayFirstWeekday(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1));
  const monthCells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), i + 1)),
  ];

  const goMonth = (delta: number) => {
    setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  const monthLabel = visibleMonth.toLocaleDateString("uz-UZ", { month: "long", year: "numeric" });

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <CalendarDays size={18} className="text-sky-600" />
          Kundalik reja
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => goMonth(-1)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[130px] text-center text-sm font-medium capitalize text-slate-700">{monthLabel}</span>
          <button onClick={() => goMonth(1)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Oy kalendari - 30/31 kunlik to'r, reja yozilgan kunlar nuqta bilan */}
      <div className="mb-5 grid grid-cols-7 gap-1">
        {WEEKDAYS_UZ.map((w) => (
          <div key={w} className="py-1 text-center text-[11px] font-medium uppercase text-slate-400">{w}</div>
        ))}
        {monthCells.map((d, i) => {
          if (!d) return <div key={`blank-${i}`} />;
          const key = toDateKey(d);
          const isSelected = isSameDay(d, selectedDate);
          const isToday = isSameDay(d, today);
          const hasTasks = daysWithTasks.has(key);
          return (
            <button
              key={key}
              onClick={() => setSelectedDate(d)}
              className={`relative flex h-9 flex-col items-center justify-center rounded-lg text-sm transition ${
                isSelected
                  ? "bg-sky-600 text-white font-semibold"
                  : isToday
                  ? "bg-sky-50 text-sky-700 font-semibold"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {d.getDate()}
              {hasTasks && (
                <span className={`absolute bottom-1 h-1 w-1 rounded-full ${isSelected ? "bg-white" : "bg-sky-500"}`} />
              )}
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium text-slate-800">{formatUzGregorian(selectedDate)}</div>
        {!isSameDay(selectedDate, today) && (
          <button
            onClick={() => { setSelectedDate(new Date()); setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1)); }}
            className="text-xs font-medium text-sky-600 hover:text-sky-700"
          >
            Bugunga qaytish
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="input w-28"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Vazifa matni - masalan, 'Buxgalteriya bilan uchrashuv'"
          className="input flex-1 min-w-[200px]"
        />
        <button
          onClick={submit}
          disabled={!title.trim() || createMutation.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-700 disabled:opacity-50"
        >
          <Plus size={16} /> Qo'shish
        </button>
      </div>

      {isLoading && <p className="py-4 text-center text-sm text-slate-400">Yuklanmoqda...</p>}
      {!isLoading && sorted.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-400">Bu kunga hali reja yozilmagan.</p>
      )}
      {sorted.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {sorted.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => toggleMutation.mutate(t)}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-400"
              />
              {t.time && (
                <span className="w-14 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-center text-xs font-medium text-slate-500">
                  {t.time}
                </span>
              )}
              <span className={`flex-1 text-sm ${t.done ? "text-slate-400 line-through" : "text-slate-800"}`}>{t.title}</span>
              <button
                onClick={() => removeMutation.mutate(t.id)}
                className="rounded-lg p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
