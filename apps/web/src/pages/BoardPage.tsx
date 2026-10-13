import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, MessageSquare, Pencil, Plus, Search, Trash2, User as UserIcon, X } from "lucide-react";
import clsx from "clsx";
import {
  addBoardComment, createBoard, createBoardTask, deleteBoard, deleteBoardComment, deleteBoardTask, fetchBoardComments,
  fetchBoards, fetchBoardTasks, fetchBoardUsers, moveBoardTask, renameBoard, updateBoardTask,
  type Board, type BoardPriority, type BoardStatus, type BoardTask,
} from "../api/board";
import { useAuth } from "../context/AuthContext";
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
  const { user } = useAuth();
  const { data: boards = [] } = useQuery({ queryKey: ["board", "boards"], queryFn: fetchBoards });
  const [boardId, setBoardId] = useState<string | null>(null);
  // Birinchi yuklanganda yoki tanlangan doska o'chirilganda birinchi doskaga o'tamiz
  useEffect(() => {
    if (boards.length && !boards.some((b) => b.id === boardId)) setBoardId(boards[0].id);
  }, [boards, boardId]);
  const board = boards.find((b) => b.id === boardId) ?? null;

  const taskKey = ["board", "tasks", boardId];
  const { data: allTasks = [] } = useQuery({ queryKey: taskKey, queryFn: () => fetchBoardTasks(boardId!), enabled: !!boardId });
  const { data: users = [] } = useQuery({ queryKey: ["board", "users"], queryFn: fetchBoardUsers });

  // Filtrlar (faqat ko'rinishga ta'sir qiladi, ustun tartibi o'zgarmaydi)
  const [search, setSearch] = useState("");
  const [fAssignee, setFAssignee] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fOverdue, setFOverdue] = useState(false);
  const filtersOn = !!(search || fAssignee || fPriority || fOverdue);
  const tasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTasks.filter((x) =>
      (!q || x.title.toLowerCase().includes(q) || (x.description ?? "").toLowerCase().includes(q)) &&
      (!fAssignee || x.assignee?.id === fAssignee) &&
      (!fPriority || x.priority === fPriority) &&
      (!fOverdue || isOverdue(x)),
    );
  }, [allTasks, search, fAssignee, fPriority, fOverdue]);
  const clearFilters = () => { setSearch(""); setFAssignee(""); setFPriority(""); setFOverdue(false); };
  const [boardModal, setBoardModal] = useState<"new" | "rename" | null>(null);
  const [editing, setEditing] = useState<BoardTask | "new" | null>(null);
  const [newStatus, setNewStatus] = useState<BoardStatus>("TODO");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<BoardStatus | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["board", "tasks"] });
  const removeBoard = useMutation({
    mutationFn: () => deleteBoard(boardId!),
    onSuccess: () => { setBoardId(null); qc.invalidateQueries({ queryKey: ["board", "boards"] }); },
  });

  const move = useMutation({
    mutationFn: (v: { id: string; status: BoardStatus; position: number }) => moveBoardTask(v.id, { status: v.status, position: v.position }),
    // Kartochka darhol yangi joyda ko'rinsin, server javobi bilan tasdiqlanadi
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: taskKey });
      const prev = qc.getQueryData<BoardTask[]>(taskKey);
      if (prev) {
        const moving = prev.find((x) => x.id === v.id);
        if (moving) {
          const target = prev.filter((x) => x.status === v.status && x.id !== v.id).sort((a, b) => a.position - b.position);
          target.splice(Math.min(v.position, target.length), 0, { ...moving, status: v.status });
          const reindexed = new Map(target.map((x, i) => [x.id, { ...x, position: i }]));
          qc.setQueryData<BoardTask[]>(taskKey, prev.map((x) => reindexed.get(x.id) ?? x));
        }
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(taskKey, ctx.prev),
    onSuccess: (data) => qc.setQueryData(taskKey, data),
  });

  // Filtr yoqilganda ko'rinadigan o'rin emas, ustundagi haqiqiy o'rin yuboriladi
  const handleDrop = (status: BoardStatus, beforeTaskId: string | null) => {
    if (dragId && boardId) {
      const column = allTasks.filter((x) => x.status === status && x.id !== dragId).sort((a, b) => a.position - b.position);
      const idx = beforeTaskId ? column.findIndex((x) => x.id === beforeTaskId) : -1;
      move.mutate({ id: dragId, status, position: idx === -1 ? column.length : idx });
    }
    setDragId(null);
    setOverCol(null);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-800">{t("board.title")}</h1>
        <button
          onClick={() => { setNewStatus("TODO"); setEditing("new"); }}
          disabled={!board}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus size={16} /> {t("board.add")}
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-slate-200">
        {boards.map((b) => (
          <button
            key={b.id}
            onClick={() => setBoardId(b.id)}
            className={clsx(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              b.id === boardId ? "border-blue-600 font-semibold text-blue-700" : "border-transparent text-slate-600 hover:text-slate-900",
            )}
          >
            {b.name}{b.ownerId && <span className="ml-1 text-xs text-slate-400">({t("board.personalTag")})</span>}
          </button>
        ))}
        <button onClick={() => setBoardModal("new")} className="ml-1 flex items-center gap-1 px-2 py-2 text-sm text-slate-500 hover:text-blue-600">
          <Plus size={14} /> {t("board.newBoard")}
        </button>
        {board && (
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setBoardModal("rename")} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title={t("board.rename")}>
              <Pencil size={14} />
            </button>
            {boards.length > 1 && (
              <button
                onClick={() => window.confirm(t("board.confirmDeleteBoard")) && removeBoard.mutate()}
                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title={t("board.deleteBoard")}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>
      {removeBoard.isError && <div className="mb-2 text-sm text-red-600">{(removeBoard.error as any)?.response?.data?.message ?? "Error"}</div>}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("board.search")}
            className="w-48 rounded-lg border border-slate-300 py-2 pl-8 pr-3 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2">
          <option value="">{t("board.allAssignees")}</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </select>
        <select value={fPriority} onChange={(e) => setFPriority(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2">
          <option value="">{t("board.allPriorities")}</option>
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{t(p.key)}</option>)}
        </select>
        <button
          onClick={() => setFAssignee(fAssignee === user?.id ? "" : user?.id ?? "")}
          className={clsx("rounded-lg border px-3 py-2", fAssignee === user?.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-600")}
        >
          {t("board.mine")}
        </button>
        <button
          onClick={() => setFOverdue(!fOverdue)}
          className={clsx("rounded-lg border px-3 py-2", fOverdue ? "border-red-500 bg-red-50 text-red-700" : "border-slate-300 text-slate-600")}
        >
          {t("board.overdue")}
        </button>
        {filtersOn && <button onClick={clearFilters} className="px-2 py-2 text-slate-500 hover:text-slate-800">{t("board.clearFilters")}</button>}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = tasks.filter((x) => x.status === col.status).sort((a, b) => a.position - b.position);
          return (
            <div
              key={col.status}
              onDragOver={(e) => { e.preventDefault(); setOverCol(col.status); }}
              onDragLeave={() => setOverCol((c) => (c === col.status ? null : c))}
              onDrop={(e) => { e.preventDefault(); handleDrop(col.status, null); }}
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
                {items.map((task) => {
                  const prio = PRIORITIES.find((p) => p.value === task.priority)!;
                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => setDragId(task.id)}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(col.status, task.id); }}
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
                        {task._count.comments > 0 && (
                          <span className="flex items-center gap-1 text-slate-500"><MessageSquare size={12} /> {task._count.comments}</span>
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

      {boardModal && (
        <BoardModal
          board={boardModal === "rename" ? board : null}
          onClose={() => setBoardModal(null)}
          onSaved={(saved) => { setBoardModal(null); setBoardId(saved.id); qc.invalidateQueries({ queryKey: ["board", "boards"] }); }}
        />
      )}

      {editing && boardId && (
        <TaskModal
          boardId={boardId}
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

function TaskModal({ boardId, task, initialStatus, users, onClose, onSaved }: {
  boardId: string;
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
      return createBoardTask({ boardId, title, description: description || undefined, priority, status: initialStatus, dueDate: dueDate || undefined, assigneeId: assigneeId || undefined });
    },
    onSuccess: onSaved,
  });
  const remove = useMutation({ mutationFn: () => deleteBoardTask(task!.id), onSuccess: onSaved });

  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
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
        {task && <Comments taskId={task.id} />}
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

function Comments({ taskId }: { taskId: string }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const { data: comments = [] } = useQuery({ queryKey: ["board", "comments", taskId], queryFn: () => fetchBoardComments(taskId) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["board", "comments", taskId] });
    qc.invalidateQueries({ queryKey: ["board", "tasks"] });
  };
  const add = useMutation({ mutationFn: () => addBoardComment(taskId, text.trim()), onSuccess: () => { setText(""); refresh(); } });
  const remove = useMutation({ mutationFn: (id: string) => deleteBoardComment(taskId, id), onSuccess: refresh });

  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      <div className="mb-2 text-sm font-semibold text-slate-700">{t("board.comments")}</div>
      <div className="max-h-48 space-y-2 overflow-y-auto">
        {comments.length === 0 && <div className="text-xs text-slate-400">{t("board.noComments")}</div>}
        {comments.map((c) => (
          <div key={c.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{c.author.fullName} · {new Date(c.createdAt).toLocaleString()}</span>
              {c.author.id === user?.id && (
                <button onClick={() => remove.mutate(c.id)} className="text-slate-400 hover:text-red-600"><X size={12} /></button>
              )}
            </div>
            <div className="mt-0.5 whitespace-pre-wrap text-slate-800">{c.text}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && text.trim() && !add.isPending && add.mutate()}
          placeholder={t("board.commentPlaceholder")}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button disabled={!text.trim() || add.isPending} onClick={() => add.mutate()} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white disabled:opacity-50">
          {t("board.send")}
        </button>
      </div>
    </div>
  );
}

function BoardModal({ board, onClose, onSaved }: { board: Board | null; onClose: () => void; onSaved: (b: Board) => void }) {
  const { t } = useLanguage();
  const [name, setName] = useState(board?.name ?? "");
  const [personal, setPersonal] = useState(false);
  const save = useMutation({
    mutationFn: () => (board ? renameBoard(board.id, name.trim()) : createBoard({ name: name.trim(), personal })),
    onSuccess: onSaved,
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">{board ? t("board.rename") : t("board.newBoard")}</h2>
        <input
          autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("board.boardName")}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && save.mutate()}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        {!board && (
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={personal} onChange={(e) => setPersonal(e.target.checked)} /> {t("board.personal")}
          </label>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">{t("board.cancel")}</button>
          <button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {board ? t("board.save") : t("board.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
