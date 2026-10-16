import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, CalendarDays, Check, Play, UserRound } from "lucide-react";
import clsx from "clsx";
import { fetchMyBoardTasks, moveBoardTask, type BoardStatus, type MyBoardTask } from "../api/board";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";
import type { TranslationKey } from "../i18n/translations";
import { PRIORITIES, daysUntilDue, isOverdue } from "../utils/boardMeta";

const COLUMNS: { status: BoardStatus; key: TranslationKey; accent: string; next: BoardStatus; nextKey: TranslationKey; nextIcon: typeof Play }[] = [
  { status: "TODO", key: "board.todo", accent: "bg-slate-400", next: "IN_PROGRESS", nextKey: "dashboard.startTask", nextIcon: Play },
  { status: "IN_PROGRESS", key: "board.inProgress", accent: "bg-blue-500", next: "DONE", nextKey: "dashboard.finishTask", nextIcon: Check },
];

/**
 * Bosh sahifadagi "Mening vazifalarim": menga biriktirilgan vazifalardan
 * "Rejada" va "Jarayonda" ustunlari. Kartochka ostidagi tugma vazifani keyingi
 * bosqichga o'tkazadi (Rejada -> Jarayonda -> Bajarildi); to'liq doska alohida sahifada.
 */
export function MyTasksPanel() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useQuery({ queryKey: ["board", "my-tasks"], queryFn: fetchMyBoardTasks });
  const move = useMutation({
    mutationFn: (v: { id: string; status: BoardStatus }) => moveBoardTask(v.id, { status: v.status, position: 0 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board"] }),
  });

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-[22px] font-semibold tracking-tight text-brand-950">{t("board.mine")}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{t("dashboard.myTasksDesc")}</p>
        </div>
        <Link to="/board" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-800 hover:underline">
          {t("dashboard.openBoard")} <ArrowRight size={15} />
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {COLUMNS.map((col) => {
          const items = tasks.filter((x) => x.status === col.status);
          return (
            <div key={col.status} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className={clsx("h-2.5 w-2.5 rounded-full", col.accent)} />
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{t(col.key)}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 shadow-sm">{items.length}</span>
              </div>
              <div className="space-y-3">
                {isLoading && <div className="py-6 text-center text-xs text-slate-400">{t("documents.loading")}</div>}
                {!isLoading && items.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">{t("dashboard.noMyTasks")}</div>
                )}
                {items.map((task) => (
                  <TaskCard key={task.id} task={task} col={col} busy={move.isPending && move.variables?.id === task.id} onNext={() => move.mutate({ id: task.id, status: col.next })} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({ task, col, busy, onNext }: { task: MyBoardTask; col: (typeof COLUMNS)[number]; busy: boolean; onNext: () => void }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const prio = PRIORITIES.find((p) => p.value === task.priority) ?? PRIORITIES[1];
  const NextIcon = col.nextIcon;
  // Boshqa korxonaning vazifasi: xira va faqat ko'rish uchun (tahrirlash uchun korxonani almashtirish kerak)
  const foreign = !!task.organization && task.organization.id !== user?.organizationId;
  const left = daysUntilDue(task);
  const late = isOverdue(task);
  const dueText = left === null ? "" : left < 0 ? t("dashboard.daysOverdue").replace("{n}", String(-left)) : left === 0 ? t("dashboard.dueToday") : left === 1 ? t("dashboard.dueTomorrow") : t("dashboard.daysLeft").replace("{n}", String(left));
  return (
    <div
      className={clsx("rounded-xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm", prio.stripe, foreign && "opacity-50")}
      title={foreign ? `${task.organization?.name} — ${t("board.otherOrgHint")}` : undefined}
    >
      <Link to="/board" className="text-sm font-semibold text-slate-900 hover:text-brand-800">{task.title}</Link>
      {task.description && <div className="mt-1 line-clamp-2 text-xs text-slate-500">{task.description}</div>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium", prio.badge)}>
          <span className={clsx("h-2 w-2 rounded-full", prio.dot)} />{t(prio.key)}
        </span>
        {task.board && <span className="ml-auto text-slate-400">{task.board.name}</span>}
      </div>
      <div className="mt-2.5 space-y-1 text-xs">
        <div className={clsx("flex items-center gap-1.5", late ? "font-medium text-rose-600" : "text-slate-600")}>
          <CalendarDays size={13} className="shrink-0" />
          {task.dueDate ? (
            <span>
              {t("dashboard.dueLabel")}: <b className="font-semibold">{task.dueDate.slice(0, 10)}</b>
              <span className="ml-1.5 font-normal">({dueText})</span>
            </span>
          ) : (
            <span className="text-slate-400">{t("dashboard.noDue")}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-slate-600">
          <UserRound size={13} className="shrink-0 text-slate-400" />
          <span>{t("dashboard.createdBy")}: <b className="font-semibold">{task.creator?.fullName ?? "—"}</b></span>
        </div>
        {(task.organization?.name ?? user?.organizationName) && (
          <div className={clsx("flex items-center gap-1.5", foreign ? "font-medium text-slate-700" : "text-slate-600")}>
            <Building2 size={13} className="shrink-0 text-slate-400" />
            <span>{task.organization?.name ?? user?.organizationName}</span>
          </div>
        )}
      </div>
      {!foreign && <button
        onClick={onNext}
        disabled={busy}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-brand-500 hover:bg-brand-50 hover:text-brand-800 disabled:opacity-50"
      >
        <NextIcon size={13} /> {t(col.nextKey)}
      </button>}
    </div>
  );
}
