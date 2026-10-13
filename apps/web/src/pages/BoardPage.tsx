import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus, Trash2, User as UserIcon, X } from "lucide-react";
import clsx from "clsx";
import {
  createBoardTask, deleteBoardTask, fetchBoardTasks, fetchBoardUsers, moveBoardTask, updateBoardTask,
  type BoardPriority, type BoardStatus, type BoardTask,
} from "../api/board";
import { useLanguage } from "../i18n/LanguageContext";
import type { TranslationKey } from "../i18n/translations";

const COLUMNS: { status: BoardStatus; key: TranslationKey; accent: string }[] = [
  { status: "TODO", key: "board.todo", accent: "bg-slate-400" },
  { status: "IN_PROGRESS", key: "board.inProgress", accent: "bg-blue-500" },
  { status: "REVIEW", key: "board.review", accent: "bg-amber-500" },
  { status: "DONE", key: "board.done", accent: "bg-emerald-500" },
];

const PRIORITIES: { value: BoardPriority; key: TranslationKey; badge: string }[] = [
  { value: "LOW", key: "board.low", badge: "bg-slate-100 text-slate-600" },
  { value: "MEDIUM", key: "board.medium", badge: "bg-blue-50 text-blue-700" },
  { value: "HIGH", key: "board.high", badge: "bg-red-50 text-red-700" },
];

function isOverdue(task: BoardTask) {
  if (!task.dueDate || task.status === "DONE") return false;
  return new Date(task.dueDate).getTime() < new Date().setHours(0, 0, 0, 0);
}

export function BoardPage() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { data: tasks = [] } = useQuery({ queryKey: ["board", "tasks"], queryFn: fetchBoardTasks });
  const { data: users = [] } = useQuery({ queryKey: ["board", "users"], queryFn: fetchBoardUsers });
  const [editing, setEditing] = useState<BoardTask | "new" | null>(null);
  const [newStatus, setNewStatus] = useState<BoardStatus>("TODO");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<BoardStatus | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["board", "tasks"] });

  const move = useMutation({
    mutationFn: (v: { id: string; status: BoardStatus; position: number }) => moveBoardTask(v.id, { status: v.status, position: v.position }),
    // Kartochka darhol yangi joyda ko'rinsin, server javobi bilan tasdiqlanadi
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["board", "tasks"] });
      const prev = qc.getQueryData<BoardTask[]>(["board", "tasks"]);
      if (prev) {
        const moving = prev.find((x) => x.id === v.id);
        if (moving) {
          const target = prev.filter((x) => x.status === v.status && x.id !== v.id).sort((a, b) => a.position - b.position);
          target.splice(Math.min(v.position, target.length), 0, { ...moving, status: v.status });
          const reindexed = new Map(target.map((x, i) => [x.id, { ...x, position: i }]));
          qc.setQueryData<BoardTask[]>(["board", "tasks"], prev.map((x) => reindexed.get(x.id) ?? x));
        }
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(["board", "tasks"], ctx.prev),
    onSuccess: (data) => qc.setQueryData(["board", "tasks"], data),
  });

  const handleDrop = (status: BoardStatus, position: number) => {
    if (dragId) move.mutate({ id: dragId, status, position });
    setDragId(null);
    setOverCol(null);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{t("board.title")}</h1>
        <button
          onClick={() => { setNewStatus("TODO"); setEditing("new"); }}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus size={16} /> {t("board.add")}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = tasks.filter((x) => x.status === col.status).sort((a, b) => a.position - b.position);
          return (
            <div
              key={col.status}
              onDragOver={(e) => { e.preventDefault(); setOverCol(col.status); }}
              onDragLeave={() => setOverCol((c) => (c === col.status ? null : c))}
              onDrop={(e) => { e.preventDefault(); handleDrop(col.status, items.length); }}
              className={clsx("flex min-h-[60vh] flex-col rounded-xl bg-slate-100/70 p-3 transition", overCol === col.status && "ring-2 ring-blue-300")}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={clsx("h-2.5 w-2.5 rounded-full", col.accent)} />
                  <span className="text-sm font-semibold text-slate-700">{t(col.key)}</span>
                  <span className="rounded-full bg-white px-2 text-xs text-slate-500">{items.length}</span>
                </div>
                <button
                  onClick={() => { setNewStatus(col.status); setEditing("new"); }}
                  className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
                  aria-label={t("board.add")}
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="space-y-2">
                {items.map((task, index) => {
                  const prio = PRIORITIES.find((p) => p.value === task.priority)!;
                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => setDragId(task.id)}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(col.status, index); }}
                      onClick={() => setEditing(task)}
                      className={clsx(
                        "cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:shadow",
                        dragId === task.id && "opacity-40",
                      )}
                    >
                      <div className="text-sm font-medium text-slate-800">{task.title}</div>
                      {task.description && <div className="mt-1 line-clamp-2 text-xs text-slate-500">{task.description}</div>}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className={clsx("rounded px-1.5 py-0.5 font-medium", prio.badge)}>{t(prio.key)}</span>
                        {task.dueDate && (
                          <span className={clsx("flex items-center gap-1", isOverdue(task) ? "text-red-600" : "text-slate-500")}>
                            <CalendarDays size={12} /> {task.dueDate.slice(0, 10)}
                          </span>
                        )}
                        {task.assignee && (
                          <span className="ml-auto flex items-center gap-1 text-slate-500">
                            <UserIcon size={12} /> {task.assignee.fullName}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <TaskModal
          task={editing === "new" ? null : editing}
          initialStatus={newStatus}
          users={users}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function TaskModal({ task, initialStatus, users, onClose, onSaved }: {
  task: BoardTask | null;
  initialStatus: BoardStatus;
  users: { id: string; fullName: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<BoardPriority>(task?.priority ?? "MEDIUM");
  const [dueDate, setDueDate] = useState(task?.dueDate?.slice(0, 10) ?? "");
  const [assigneeId, setAssigneeId] = useState(task?.assignee?.id ?? "");

  const save = useMutation({
    mutationFn: () => {
      if (task) {
        return updateBoardTask(task.id, { title, description, priority, dueDate: dueDate || null, assigneeId: assigneeId || null });
      }
      return createBoardTask({ title, description: description || undefined, priority, status: initialStatus, dueDate: dueDate || undefined, assigneeId: assigneeId || undefined });
    },
    onSuccess: onSaved,
  });
  const remove = useMutation({ mutationFn: () => deleteBoardTask(task!.id), onSuccess: onSaved });

  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{task ? t("board.edit") : t("board.add")}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <input className={field} placeholder={t("board.titlePlaceholder")} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <textarea className={field} rows={3} placeholder={t("board.description")} value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <select className={field} value={priority} onChange={(e) => setPriority(e.target.value as BoardPriority)}>
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{t(p.key)}</option>)}
            </select>
            <input type="date" className={field} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <select className={field} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">{t("board.noAssignee")}</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
        </div>
        <div className="mt-5 flex items-center justify-between">
          {task ? (
            <button
              onClick={() => window.confirm(t("board.confirmDelete")) && remove.mutate()}
              className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
            >
              <Trash2 size={14} /> {t("board.delete")}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">{t("board.cancel")}</button>
            <button
              disabled={!title.trim() || save.isPending}
              onClick={() => save.mutate()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {t("board.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
