"use client";

import { useState } from "react";
import {
  ListChecks, CheckCircle2, Clock, ChefHat, AlertCircle,
  Plus, Send, Minus, User, ChevronDown, X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { usePrepTasks } from "../hooks/usePrepTasks";
import { prepApi } from "../services/prepApi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { PrepStatus, PrepTask } from "../types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { toastApiError } from "@/lib/operationalToast";
import { adjustPrepCompletedQuantity, prepProgressPercent } from "../utils/progressQuantity";

interface Props {
  activeStationId: string;
  branchId: string;
}

type BranchUser = { id: string; username: string; first_name: string; last_name: string };

function userDisplayName(u: BranchUser) {
  const full = `${u.first_name} ${u.last_name}`.trim();
  return full || u.username;
}

export function PrepListDrawer({ activeStationId, branchId }: Props) {
  const t = useTranslations("prep");
  const queryClient = useQueryClient();
  const { tasks, isLoading, completeTask, updateStatus, recordProgress, progressRecordingTaskId } = usePrepTasks(
    branchId,
    activeStationId
  );
  const { canManage } = useModulePermissions();

  const [filter, setFilter] = useState<PrepStatus | 'ALL'>('ALL');
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newUnit, setNewUnit] = useState(t('drawer.defaultUnit'));
  // Multi-assignee: sistem kullanıcıları + free-text isimler
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
  const [assigneeNames, setAssigneeNames] = useState<string[]>([]);
  const [nameInput, setNameInput] = useState("");
  /** Hangi görevin atama dropdown'u açık: taskId | null */
  const [openAssignTaskId, setOpenAssignTaskId] = useState<string | null>(null);

  const canAdd = canManage("prep.add_preptask");

  /* Şubeye bağlı kullanıcılar */
  const { data: branchUsers = [] } = useQuery<BranchUser[]>({
    queryKey: ["branch-users", branchId],
    queryFn: () => prepApi.getBranchUsers(branchId),
    enabled: !!branchId,
    staleTime: 5 * 60_000,
  });

  /* Görev atama / atama değiştirme */
  const assignMutation = useMutation({
    mutationFn: ({ taskId, userId }: { taskId: string; userId: string | null }) =>
      prepApi.patchTask(taskId, { assigned_to: userId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["prep-tasks"] });
      setOpenAssignTaskId(null);
    },
    onError: (err: unknown) => toastApiError(err, t("drawer.errorAssign")),
  });

  const PREP_STATUS_MAP: Record<PrepStatus, { label: string; className: string }> = {
    PENDING: {
      label: t('drawer.status.pending'),
      className: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20",
    },
    IN_PROGRESS: {
      label: t('drawer.status.inProgress'),
      className: "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20",
    },
    COMPLETED: {
      label: t('drawer.status.completed'),
      className: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20",
    },
    CANCELLED: {
      label: t('drawer.status.cancelled'),
      className: "bg-muted text-muted-foreground border border-border",
    },
  };

  const createMutation = useMutation({
    mutationFn: (data: Partial<PrepTask>) => prepApi.createTask(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prep-tasks"] });
      setIsAdding(false);
      setNewTitle("");
      toast.success(t('drawer.successAdd'));
    },
    onError: (err: unknown) => {
      toastApiError(err, t('drawer.errorAdd'));
    },
  });

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    const bid = (branchId || "").trim();
    if (!bid) {
      toast.error(t('drawer.errorBranch'));
      return;
    }
    createMutation.mutate({
      branch: bid,
      station: activeStationId?.trim() || null,
      title: newTitle.trim(),
      target_quantity: parseFloat(newQty) || 1,
      unit: newUnit.trim() || t('drawer.defaultUnit'),
      status: "PENDING",
      assigned_user_ids: assignedUserIds,
      assignee_names: assigneeNames,
    });
  };

  const toggleStaff = (userId: string) => {
    setAssignedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const addAssigneeName = () => {
    const name = nameInput.trim();
    if (!name) return;
    setAssigneeNames((prev) => [...prev, name]);
    setNameInput("");
  };

  const removeAssigneeName = (index: number) => {
    setAssigneeNames((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddClose = () => {
    setIsAdding(false);
    setNewTitle("");
    setAssignedUserIds([]);
    setAssigneeNames([]);
    setNameInput("");
  };

  const filteredTasks = tasks.filter(t => filter === 'ALL' || t.status === filter);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
        <span className="text-2xs uppercase tracking-widest">{t('drawer.loading')}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header & Filters */}
      <div className="p-4 border-b border-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <ChefHat size={20} className="text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground uppercase">{t('drawer.title')}</h3>
              <p className="text-2xs text-muted-foreground uppercase">{t('drawer.activeTasks', { count: tasks.length })}</p>
            </div>
          </div>

          {canAdd && (
            <button
              onClick={() => (isAdding ? handleAddClose() : setIsAdding(true))}
              aria-label={t('drawer.addTask')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                isAdding ? "bg-destructive/20 text-destructive" : "bg-primary/10 text-primary hover:bg-primary/20"
              )}
            >
              <Plus size={20} className={cn(isAdding && "rotate-45")} />
            </button>
          )}
        </div>

        {isAdding && (
          <div className="bg-card border border-primary/20 rounded-xl p-3 space-y-3">
            {/* Görev adı */}
            <input
              autoFocus
              placeholder={t('drawer.placeholder')}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:ring-2 ring-primary/20 outline-none transition-all"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />

            {/* Miktar + Birim */}
            <div className="flex gap-2">
              <input
                type="number"
                placeholder={t('drawer.quantity')}
                className="w-20 bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:ring-2 ring-primary/20 transition-all"
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
              />
              <input
                placeholder={t('drawer.unit')}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:ring-2 ring-primary/20 transition-all"
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
              />
            </div>

            {/* Atanan kişiler — çoklu (sistem kullanıcıları + free-text) */}
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-2xs font-bold uppercase text-muted-foreground">
                <User size={12} />
                {t("drawer.assignedTo")}
              </div>

              {/* Sistem kullanıcı pill'leri */}
              {branchUsers.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {branchUsers.map((u) => {
                    const isSelected = assignedUserIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleStaff(u.id)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium transition-colors",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        )}
                      >
                        {userDisplayName(u)}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Manuel isim girişi */}
              <div className="flex gap-1">
                <input
                  placeholder={t("drawer.namePlaceholder") || "İsim yazın..."}
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 ring-primary/20 transition-all"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAssigneeName())}
                />
                <button
                  type="button"
                  onClick={addAssigneeName}
                  className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Eklenen isim tag'leri */}
              {assigneeNames.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {assigneeNames.map((name, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    >
                      {name}
                      <button
                        type="button"
                        onClick={() => removeAssigneeName(idx)}
                        className="hover:text-amber-900 dark:hover:text-amber-200"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Kaydet butonu */}
            <button
              onClick={handleCreate}
              disabled={!newTitle.trim() || createMutation.isPending}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground py-2 rounded-lg transition-colors shadow-lg text-xs font-bold"
            >
              <Send size={14} />
              {t("drawer.addTask")}
            </button>
          </div>
        )}

        <div className="flex gap-1">
          {(['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED'] as const).map((f) => {
            const labelKey = f === 'ALL' ? 'all' : f === 'PENDING' ? 'pending' : f === 'IN_PROGRESS' ? 'inProgress' : 'completed';
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-2 py-1 rounded text-3xs font-bold",
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                )}
              >
                {t(`drawer.filters.${labelKey}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* List Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-600">
            <ListChecks size={40} className="opacity-20 mb-4" />
            <p className="text-xs uppercase tracking-widest italic">{t('drawer.emptyList')}</p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const statusStyle = PREP_STATUS_MAP[task.status] ?? PREP_STATUS_MAP.PENDING;
            return (
              <div
                key={task.id}
                className={cn(
                  "relative rounded-xl border border-border bg-card p-4 border-l-4 shadow-sm",
                  task.status === "PENDING" && "border-l-amber-500",
                  task.status === "IN_PROGRESS" && "border-l-sky-500",
                  task.status === "COMPLETED" && "border-l-primary opacity-80",
                  task.status === "CANCELLED" && "border-l-muted-foreground opacity-75"
                )}
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded px-2 py-0.5 text-3xs font-bold uppercase tracking-wide",
                        statusStyle.className
                      )}
                    >
                      {statusStyle.label}
                    </span>
                    {task.priority > 1 && (
                      <span className="bg-destructive/15 text-destructive text-4xs font-bold px-1.5 py-0.5 rounded border border-destructive/20 uppercase">
                        {t('drawer.urgent')}
                      </span>
                    )}
                  </div>
                  <h4 className={cn(
                    "text-sm font-bold leading-none",
                    task.status === 'COMPLETED' ? "text-muted-foreground line-through" : "text-foreground"
                  )}>
                    {task.title}
                  </h4>
                  {task.description && (
                    <p className="text-sub text-muted-foreground leading-relaxed font-medium">
                      {task.description}
                    </p>
                  )}

                  {/* Atanan kişi — rozet + değiştirme dropdown'u */}
                  {branchUsers.length > 0 && canManage("prep.change_preptask") && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenAssignTaskId(
                            openAssignTaskId === task.id ? null : task.id
                          )
                        }
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-2xs font-bold transition-colors",
                          task.assigned_to_name
                            ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20"
                            : "border-border bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                        )}
                      >
                        <User size={11} />
                        {task.assigned_to_name ?? t("drawer.assignPlaceholder")}
                        <ChevronDown size={10} className={cn("transition-transform", openAssignTaskId === task.id && "rotate-180")} />
                      </button>

                      {openAssignTaskId === task.id && (
                        <>
                          {/* Backdrop */}
                          <button
                            type="button"
                            className="fixed inset-0 z-[70]"
                            aria-label="kapat"
                            onClick={() => setOpenAssignTaskId(null)}
                          />
                          <div className="absolute left-0 top-full z-[80] mt-1 min-w-[180px] rounded-xl border border-border bg-popover shadow-md overflow-hidden">
                            {/* "Atanmamış" seçeneği */}
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted transition-colors"
                              onClick={() =>
                                assignMutation.mutate({ taskId: task.id, userId: null })
                              }
                            >
                              <div className="h-5 w-5 rounded-full border border-border bg-muted" />
                              {t("drawer.unassigned")}
                            </button>
                            <div className="h-px bg-border" />
                            {branchUsers.map((u) => (
                              <button
                                key={u.id}
                                type="button"
                                className={cn(
                                  "flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted",
                                  task.assigned_to === u.id
                                    ? "bg-indigo-500/10 text-indigo-300 font-bold"
                                    : "text-foreground"
                                )}
                                onClick={() =>
                                  assignMutation.mutate({ taskId: task.id, userId: u.id })
                                }
                              >
                                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-3xs font-bold uppercase text-indigo-300">
                                  {userDisplayName(u).charAt(0)}
                                </div>
                                {userDisplayName(u)}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {/* Yönetim yetkisi yoksa sadece oku */}
                  {task.assigned_to_name && !canManage("prep.change_preptask") && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-2xs font-bold text-indigo-400">
                      <User size={11} />
                      {task.assigned_to_name}
                    </span>
                  )}
                </div>

                {(() => {
                  const done = Number(task.completed_quantity);
                  const target = Number(task.target_quantity);
                  const pct = prepProgressPercent(done, target);
                  const saving = progressRecordingTaskId === task.id;
                  const canAdjust =
                    task.status !== "COMPLETED" && task.status !== "CANCELLED";
                  return (
                    <div className="mt-3 space-y-2">
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-base font-bold text-primary tabular-nums">
                          {done} / {target}
                          <span className="text-2xs ml-1 text-muted-foreground uppercase">
                            {task.unit}
                          </span>
                        </span>
                        {canAdjust && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={saving || done <= 0}
                              onClick={() =>
                                recordProgress({
                                  taskId: task.id,
                                  qty: adjustPrepCompletedQuantity(done, target, -1),
                                })
                              }
                              className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground hover:bg-muted/80 disabled:opacity-40 disabled:pointer-events-none transition-colors border border-border"
                              aria-label={t('drawer.actions.decrease')}
                            >
                              <Minus size={18} />
                            </button>
                            <button
                              type="button"
                              disabled={saving || done >= target}
                              onClick={() =>
                                recordProgress({
                                  taskId: task.id,
                                  qty: adjustPrepCompletedQuantity(done, target, 1),
                                })
                              }
                              className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground hover:bg-muted/80 disabled:opacity-40 disabled:pointer-events-none transition-colors border border-border"
                              aria-label={t('drawer.actions.increase')}
                            >
                              <Plus size={18} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Status & Actions */}
                <div className="mt-4 flex items-center justify-between gap-4 pt-3 border-t border-border">
                  <div className="flex items-center gap-3">
                    {task.status !== 'COMPLETED' ? (
                      <button
                        onClick={() => completeTask({ taskId: task.id })}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-2xs font-bold"
                      >
                        <CheckCircle2 size={14} />
                        {t('drawer.actions.finish')}
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 text-primary text-2xs font-bold uppercase">
                        <CheckCircle2 size={14} />
                        {t('drawer.status.ready')}
                      </div>
                    )}

                    {task.status === 'PENDING' && (
                      <button
                        onClick={() => updateStatus({ taskId: task.id, status: 'IN_PROGRESS' })}
                        className="text-muted-foreground hover:text-primary text-2xs font-bold"
                      >
                        {t('drawer.actions.start')}
                      </button>
                    )}
                  </div>

                  {task.deadline && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock size={12} />
                      <span className="text-3xs uppercase tracking-tighter">
                        {new Date(task.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-muted/50 border-t border-border text-center">
        <p className="text-3xs text-muted-foreground font-bold uppercase flex items-center justify-center gap-1">
          <AlertCircle size={10} />
          {t('drawer.footerNote')}
        </p>
      </div>
    </div>
  );
}
