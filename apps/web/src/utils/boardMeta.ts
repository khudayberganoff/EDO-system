import type { BoardPriority, BoardTask } from "../api/board";
import type { TranslationKey } from "../i18n/translations";

// Ranglar Telegram botdagi tugmalar bilan bir xil: 🔴 Yuqori, 🟡 O'rta, ⚪ Past
export const PRIORITIES: { value: BoardPriority; key: TranslationKey; badge: string; dot: string; stripe: string; emoji: string }[] = [
  { value: "LOW", key: "board.low", badge: "bg-slate-100 text-slate-600", dot: "bg-slate-300 ring-1 ring-slate-400", stripe: "border-l-slate-300", emoji: "⚪" },
  { value: "MEDIUM", key: "board.medium", badge: "bg-amber-100 text-amber-800", dot: "bg-amber-400", stripe: "border-l-amber-400", emoji: "🟡" },
  { value: "HIGH", key: "board.high", badge: "bg-rose-100 text-rose-700", dot: "bg-rose-500", stripe: "border-l-rose-500", emoji: "🔴" },
];

export function isOverdue(task: Pick<BoardTask, "dueDate" | "status">) {
  if (!task.dueDate || task.status === "DONE") return false;
  return new Date(task.dueDate).getTime() < new Date().setHours(0, 0, 0, 0);
}
