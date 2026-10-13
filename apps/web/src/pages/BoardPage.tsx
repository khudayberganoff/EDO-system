import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, MessageSquare, Pencil, Plus, Search, Send, Trash2, User as UserIcon, X } from "lucide-react";
import clsx from "clsx";
import {
  addBoardComment, createBoard, createBoardTask, deleteBoard, deleteBoardComment, deleteBoardTask, fetchBoardComments,
  fetchBoards, fetchBoardTasks, fetchBoardUsers, moveBoardTask, renameBoard, updateBoardTask,
  type Board, type BoardPriority, type BoardStatus, type BoardTask,
} from "../api/board";
import { useAuth } from "../context/AuthContext";
import { createTelegramLink, fetchTelegramStatus, unlinkTelegram } from "../api/telegram";
import { useLanguage } from "../i18n/LanguageContext";
import type { TranslationKey } from "../i18n/translations";

const COLUMNS: { status: BoardStatus; key: TranslationKey; accent: string }[] = [
  { status: "TODO", key: "board.todo", accent: "bg-slate-400" },
  { status: "IN_PROGRESS", key: "board.inProgress", accent: "bg-blue-500" },
  { status: "REVIEW", key: "board.review", accent: "bg-amber-500" },
  { status: "DONE", key: "board.done", accent: "bg-emerald-500" },
];

// Ranglar Telegram botdagi tugmalar bilan bir xil: 🔴 Yuqori, 🟡 O'rta, ⚪ Past
const PRIORITIES: { value: BoardPriority; key: TranslationKey; badge: string; dot: string; stripe: string; emoji: string }[] = [
  { value: "LOW", key: "board.low", badge: "bg-slate-100 text-slate-600", dot: "bg-slate-300 ring-1 ring-slate-400", stripe: "border-l-slate-300", emoji: "⚪" },
  { value: "MEDIUM", key: "board.medium", badge: "bg-amber-100 text-amber-800", dot: "bg-amber-400", stripe: "border-l-amber-400", emoji: "🟡" },
  { value: "HIGH", key: "board.high", badge: "bg-rose-100 text-rose-700", dot: "bg-rose-500", stripe: "border-l-rose-500", emoji: "🔴" },
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
  const [showTelegram, setShowTelegram] = useState(false);
  const { data: tgStatus } = useQuery({ queryKey: ["telegram", "status"], queryFn: fetchTelegramStatus, staleTime: 60_000 });
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
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-tight text-brand-950">{t("board.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("board.desc")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tgStatus?.enabled && (
            <button
              onClick={() => setShowTelegram(true)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-3 text-base font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Send size={18} className={tgStatus.linked ? "text-emerald-600" : "text-sky-600"} /> Telegram
              {tgStatus.linked && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
            </button>
          )}
          <button
            onClick={() => { setNewStatus("TODO"); setEditing("new"); }}
            disabled={!board}
            className="flex items-center gap-2 rounded-lg bg-brand-800 px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus size={18} /> {t("board.add")}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {boards.map((b) => (
          <button
            key={b.id}
            onClick={() => setBoardId(b.id)}
            className={clsx(
              "rounded-full px-6 py-2.5 text-sm font-medium transition",
              b.id === boardId ? "bg-brand-800 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
            )}
          >
            {b.name}{b.ownerId && <span className={clsx("ml-1.5 text-xs", b.id === boardId ? "text-white/70" : "text-slate-400")}>({t("board.personalTag")})</span>}
          </button>
        ))}
        <button onClick={() => setBoardModal("new")} className="flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:border-brand-500 hover:text-brand-800">
          <Plus size={14} /> {t("board.newBoard")}
        </button>
        {board && (
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setBoardModal("rename")} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-brand-800" title={t("board.rename")}>
              <Pencil size={16} />
            </button>
            {boards.length > 1 && (
              <button
                onClick={() => window.confirm(t("board.confirmDeleteBoard")) && removeBoard.mutate()}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" title={t("board.deleteBoard")}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        )}
      </div>
      {removeBoard.isError && <div className="mb-2 text-sm text-rose-600">{(removeBoard.error as any)?.response?.data?.message ?? "Error"}</div>}

      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("board.search")}
            className="input w-56 !py-2 !pl-9"
          />
        </div>
        <select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} className="input !w-auto !py-2">
          <option value="">{t("board.allAssignees")}</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </select>
        <select value={fPriority} onChange={(e) => setFPriority(e.target.value)} className="input !w-auto !py-2">
          <option value="">{t("board.allPriorities")}</option>
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.emoji} {t(p.key)}</option>)}
        </select>
        <button
          onClick={() => setFAssignee(fAssignee === user?.id ? "" : user?.id ?? "")}
          className={clsx("rounded-lg border px-4 py-2 font-medium transition", fAssignee === user?.id ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-300 text-slate-600 hover:bg-slate-50")}
        >
          {t("board.mine")}
        </button>
        <button
          onClick={() => setFOverdue(!fOverdue)}
          className={clsx("rounded-lg border px-4 py-2 font-medium transition", fOverdue ? "border-rose-500 bg-rose-50 text-rose-700" : "border-slate-300 text-slate-600 hover:bg-slate-50")}
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
              className={clsx("flex min-h-[60vh] flex-col rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition", overCol === col.status && "border-brand-500 bg-brand-50/60 ring-2 ring-brand-300")}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={clsx("h-2.5 w-2.5 rounded-full", col.accent)} />
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{t(col.key)}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 shadow-sm">{items.length}</span>
                </div>
                <button
                  onClick={() => { setNewStatus(col.status); setEditing("new"); }}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-brand-800"
                  aria-label={t("board.add")}
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="space-y-3">
                {items.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">{t("board.emptyColumn")}</div>}
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
                        "cursor-pointer rounded-xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                        prio.stripe,
                        dragId === task.id && "opacity-40",
                      )}
                    >
                      <div className="text-sm font-semibold text-slate-900">{task.title}</div>
                      {task.description && <div className="mt-1 line-clamp-2 text-xs text-slate-500">{task.description}</div>}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium", prio.badge)}><span className={clsx("h-2 w-2 rounded-full", prio.dot)} />{t(prio.key)}</span>
                        {task.dueDate && (
                          <span className={clsx("flex items-center gap-1", isOverdue(task) ? "font-medium text-rose-600" : "text-slate-500")}>
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

      {showTelegram && <TelegramModal onClose={() => setShowTelegram(false)} />}

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

  const field = "input";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{task ? t("board.edit") : t("board.add")}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <input className={field} placeholder={t("board.titlePlaceholder")} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <textarea className={field} rows={3} placeholder={t("board.description")} value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <select className={field} value={priority} onChange={(e) => setPriority(e.target.value as BoardPriority)}>
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.emoji} {t(p.key)}</option>)}
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
              className="flex items-center gap-1 text-sm text-rose-600 hover:text-rose-700"
            >
              <Trash2 size={14} /> {t("board.delete")}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm">{t("board.cancel")}</button>
            <button
              disabled={!title.trim() || save.isPending}
              onClick={() => save.mutate()}
              className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
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
          <div key={c.id} className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{c.author.fullName} · {new Date(c.createdAt).toLocaleString()}</span>
              {c.author.id === user?.id && (
                <button onClick={() => remove.mutate(c.id)} className="text-slate-400 hover:text-rose-600"><X size={12} /></button>
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
          className="input flex-1"
        />
        <button disabled={!text.trim() || add.isPending} onClick={() => add.mutate()} className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">{board ? t("board.rename") : t("board.newBoard")}</h2>
        <input
          autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("board.boardName")}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && save.mutate()}
          className="input"
        />
        {!board && (
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={personal} onChange={(e) => setPersonal(e.target.checked)} /> {t("board.personal")}
          </label>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm">{t("board.cancel")}</button>
          <button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">
            {board ? t("board.save") : t("board.create")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Telegram'ni EDO hisobiga ulash va bot buyruqlari bo'yicha qo'llanma. */
function TelegramModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ["telegram", "status"],
    queryFn: fetchTelegramStatus,
    // Havola ochilgandan keyin ulanish tugashini kutamiz
    refetchInterval: (q) => (q.state.data?.linked ? false : 3000),
  });
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const makeLink = useMutation({
    mutationFn: createTelegramLink,
    onSuccess: (d) => { setLink(d); setError(null); window.open(d.url, "_blank", "noopener"); },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Havola yaratib bo'lmadi."),
  });
  const unlink = useMutation({
    mutationFn: unlinkTelegram,
    onSuccess: () => { setLink(null); qc.invalidateQueries({ queryKey: ["telegram", "status"] }); },
  });
  const code = (c: string) => <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{c}</code>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><Send size={18} className="text-sky-600" /> Telegram orqali vazifa qo'shish</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        {status?.linked ? (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="text-sm text-emerald-900">✅ Ulangan{status.username ? <> · <b>@{status.username}</b></> : null}</div>
            <button onClick={() => window.confirm("Telegram uzilsinmi?") && unlink.mutate()} className="text-xs font-medium text-rose-600 hover:text-rose-700">Uzish</button>
          </div>
        ) : (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="mb-3 text-sm text-slate-600">
              Telegram hisobingizni EDO bilan ulang: tugmani bosing, Telegram ochilganda <b>Start</b> (Boshlash) ni bosing. Havola 15 daqiqa amal qiladi.
            </p>
            <button
              onClick={() => makeLink.mutate()}
              disabled={makeLink.isPending}
              className="flex items-center gap-2 rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              <Send size={15} /> {link ? "Havolani qayta ochish" : "Telegram'ni ulash"}
            </button>
            {link && <p className="mt-3 break-all text-xs text-slate-500">Telegram ochilmasa: <a href={link.url} target="_blank" rel="noreferrer" className="text-brand-800 underline">{link.url}</a></p>}
            {link && <p className="mt-1 text-xs text-slate-400">Ulanish kutilmoqda...</p>}
            {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
          </div>
        )}

        <div className="space-y-3 text-sm text-slate-700">
          <div className="font-semibold text-slate-900">Qanday ishlaydi</div>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>{code("/vazifa")} yoki <b>➕ Yangi vazifa</b> tugmasi — bot avval <b>kimga</b> ekanini so'raydi (xodimlar ro'yxati), keyin vazifa matnini yozasiz.</li>
            <li>Vazifa matnini to'g'ridan-to'g'ri yozsangiz ham, bot avval <b>kimga</b> ekanini so'raydi; tanlangach vazifa "Umumiy doska"ga "Rejada" holatida qo'shiladi. Matnda {code("@Familiya")} bo'lsa, ro'yxat so'ralmaydi.</li>
            <li><b>Guruhda</b> (botni guruhga qo'shing): {code("/vazifa matn")} yoki biror xabarga javob (reply) qilib {code("/vazifa")}.</li>
            <li>Matn ichida: {code("!yuqori")} {code("!o'rta")} {code("!past")} — muhimlik; {code("#ertaga")} {code("#bugun")} {code("#2026-10-20")} — muddat; {code("@Familiya")} — mas'ul.</li>
            <li>Birinchi qator — sarlavha, qolgan qatorlar — tavsif.</li>
            <li>Vazifa qo'shilgach, bot xabari ostidagi tugmalar bilan muhimlikni (🔴 🟡 ⚪) va muddatni (Bugun, Ertaga, 3 kun, Hafta yoki <b>📅 Kalendar</b>) tanlash mumkin.</li>
            <li>{code("/mening")} — sizga biriktirilgan ochiq vazifalar; {code("/vafo")} — VAFO MOLIYA doskasiga qo'shish.</li>
            <li>Sizga vazifa biriktirilsa, bot Telegram'da xabar yuboradi.</li>
          </ul>
          {status?.botUsername && <p className="text-xs text-slate-400">Bot: @{status.botUsername}</p>}
        </div>
      </div>
    </div>
  );
}
