"use client";

import {
  CheckCircle2,
  Clock,
  Loader2,
  Minus,
  MoreVertical,
  Play,
  Plus,
  Trash2,
  ClipboardList,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/formatters";
import { adjustPrepCompletedQuantity, prepProgressPercent } from "../utils/progressQuantity";
import type { PrepStatus, PrepTask } from "../types";

export interface PrepTasksTableProps {
  tasks: PrepTask[];
  isLoading: boolean;
  fetchMore: () => void;
  hasMore: boolean;
  isFetchingNextPage: boolean;
  showActionsColumn: boolean;
  canAddTask: boolean;
  canManageTemplates: boolean;
  canStartAssignedTask: (task: PrepTask) => boolean;
  progressRecordingTaskId: string | null;
  taskListFilter: "all" | "active" | "completed";
  onUpdateStatus: (args: { taskId: string; status: PrepStatus }) => void;
  onRecordProgress: (args: { taskId: string; qty: number }) => void;
  onDeleteTask: (taskId: string) => void;
}

export function PrepTasksTable({
  tasks,
  isLoading,
  fetchMore,
  hasMore,
  isFetchingNextPage,
  showActionsColumn,
  canAddTask,
  canManageTemplates,
  canStartAssignedTask,
  progressRecordingTaskId,
  taskListFilter,
  onUpdateStatus,
  onRecordProgress,
  onDeleteTask,
}: PrepTasksTableProps) {
  const t = useTranslations("prep");

  const emptyMessage =
    taskListFilter === "completed"
      ? t("management.emptyCompletedTasks")
      : taskListFilter === "active"
        ? t("management.emptyTasks")
        : t("management.emptyAllTasks");

  return (
    <VirtualTable
      rows={tasks}
      rowHeight={76}
      overscan={8}
      fetchMore={fetchMore}
      hasMore={hasMore}
      isFetchingNextPage={isFetchingNextPage}
      className="min-h-0 flex-1 bg-card"
      tableClassName="w-full text-sm"
      header={
        <thead className={virtualTableStickyHeadClass}>
          <tr className="text-xs font-bold text-slate-500">
            <th className="px-4 py-2 text-left font-bold">
              {t("management.columns.tasks.nameStation")}
            </th>
            <th className="px-4 py-2 text-left font-bold w-[140px]">
              {t("management.columns.tasks.status")}
            </th>
            <th className="px-4 py-2 text-right font-bold">
              {t("management.columns.tasks.progress")}
            </th>
            {showActionsColumn && (
              <th className="px-4 py-2 text-right font-bold w-[120px]">
                {t("management.columns.tasks.actions")}
              </th>
            )}
          </tr>
        </thead>
      }
      emptyState={
        isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <ClipboardList size={48} className="opacity-10 mb-4" />
            <p className="text-sm font-medium">{emptyMessage}</p>
          </div>
        )
      }
      loadingMore={
        <tr>
          <td colSpan={showActionsColumn ? 4 : 3} className="text-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600 mx-auto" />
          </td>
        </tr>
      }
      renderRow={(task) => {
        const done = Number(task.completed_quantity);
        const target = Number(task.target_quantity);
        const pct = prepProgressPercent(done, target);
        const canAdjust = task.status !== "COMPLETED" && task.status !== "CANCELLED";
        const saving = progressRecordingTaskId === task.id;

        return (
          <>
            <td className="px-4 py-3 align-middle">
              <h4 className="text-sm font-bold text-slate-800 dark:text-white leading-none">
                {task.title}
              </h4>
              <p className="text-2xs font-medium text-muted-foreground mt-1">
                {task.station_name || t("management.defaultStation")}
              </p>
            </td>
            <td className="px-4 py-3 align-middle">
              <div
                className={cn(
                  "px-2 py-0.5 rounded-full inline-flex items-center gap-1.5",
                  task.status === "COMPLETED"
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                    : task.status === "IN_PROGRESS"
                      ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
                      : "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
                )}
              >
                <div
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    task.status === "COMPLETED"
                      ? "bg-emerald-500"
                      : task.status === "IN_PROGRESS"
                        ? "bg-amber-500"
                        : "bg-blue-500",
                  )}
                />
                <span className="text-sub font-bold">
                  {task.status === "COMPLETED"
                    ? t("management.taskStatus.completed")
                    : task.status === "IN_PROGRESS"
                      ? t("management.taskStatus.inProgress")
                      : t("management.taskStatus.pending")}
                </span>
              </div>
            </td>
            <td className="px-4 py-3 align-middle">
              <div className="flex flex-col gap-1.5 items-end w-full max-w-[220px] ml-auto">
                <div className="h-1.5 w-full rounded-full bg-slate-200 bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-end gap-2 w-full">
                  <span className="text-xs font-bold text-foreground tabular-nums">
                    {formatNumber(done, 0)} / {formatNumber(target, 0)}
                    <span className="text-2xs font-bold text-muted-foreground ml-1">
                      {task.unit}
                    </span>
                  </span>
                  {canAdjust && (
                    <div className="flex gap-0.5 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={saving || done <= 0}
                        onClick={() =>
                          onRecordProgress({
                            taskId: task.id,
                            qty: adjustPrepCompletedQuantity(done, target, -1),
                          })
                        }
                        aria-label={t("management.progressDecreaseAria")}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={saving || done >= target}
                        onClick={() =>
                          onRecordProgress({
                            taskId: task.id,
                            qty: adjustPrepCompletedQuantity(done, target, 1),
                          })
                        }
                        aria-label={t("management.progressIncreaseAria")}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </td>
            {showActionsColumn && (
              <td className="px-4 py-3 text-right align-middle">
                {canStartAssignedTask(task) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-sub font-bold border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-900/50 dark:text-blue-400"
                    onClick={() => onUpdateStatus({ taskId: task.id, status: "IN_PROGRESS" })}
                  >
                    <Play size={14} />
                    {t("management.start")}
                  </Button>
                ) : canAddTask || canManageTemplates ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-slate-100 transition-colors outline-none">
                      <MoreVertical size={14} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-2xs text-muted-foreground">
                          {t("management.changeStatus")}
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() => onUpdateStatus({ taskId: task.id, status: "PENDING" })}
                        >
                          <Clock className="mr-2 h-4 w-4 text-blue-500" />
                          {t("management.setPending")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            onUpdateStatus({ taskId: task.id, status: "IN_PROGRESS" })
                          }
                        >
                          <Loader2 className="mr-2 h-4 w-4 text-amber-500" />
                          {t("management.setInProgress")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onUpdateStatus({ taskId: task.id, status: "COMPLETED" })}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" />
                          {t("management.setCompleted")}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDeleteTask(task.id)}
                        className="text-rose-600 focus:text-rose-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t("management.deleteTask")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </td>
            )}
          </>
        );
      }}
    />
  );
}
