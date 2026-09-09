import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Trash2, CalendarDays } from "lucide-react";
import { createDailyTask, deleteDailyTask, fetchDailyTasks, updateDailyTask, type DailyTask } from "../api/dailyTasks";
import { formatUzGregorian } from "../utils/hijriDate";

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

/**
 * Bosh sahifadagi kundalik reja/vazifalar bloki - xodim tanlangan kun uchun
 * (ixtiyoriy ravishda soat bilan) shaxsiy vazifalarini yozib, bajarilganini
 * belgilashi mumkin. Har kim faqat o'zining ro'yxatini ko'radi.
 */
export function DailyPlanner() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const dateKey = toDateKey(selectedDate);
  const queryClient = useQueryClient();

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["daily-tasks", dateKey],
    queryFn: () => fetchDailyTasks(dateKey),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["daily-tasks", dateKey] });
  const createMutation = useMutation({ mutationFn: createDailyTask, onSuccess: invalidate });
  const toggleMutation = useMutation({
    mutationFn: (t: DailyTask) => updateDailyTask(t.id, { done: !t.done }),
    onSuccess: invalidate,
  });
  const removeMutation = useMutation({ mutationFn: deleteDailyTask, onSuccess: invalidate });

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

  const today = new Date();

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <CalendarDays size={18} className="text-sky-600" />
          Kundalik reja
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSelectedDate((d) => new Date(d.getTime() - 86_400_000))}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setSelectedDate(new Date())}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              isSameDay(selectedDate, today) ? "bg-sky-50 text-sky-700" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {formatUzGregorian(selectedDate)}
          </button>
          <button
            onClick={() => setSelectedDate((d) => new Date(d.getTime() + 86_400_000))}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <ChevronRight size={16} />
          </button>
        </div>
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
