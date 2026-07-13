"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  Settings2,
  CalendarClock,
  BrainCircuit,
  Search,
  Filter,
  Sparkles,
  Loader2,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Tabs } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { AuthGuard } from "@/components/auth/AuthGuard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useAuthStore } from "@/store/useAuthStore";
import {
  usePrepTasksInfinite,
  usePrepTaskCounts,
  usePrepTemplatesInfinite,
  usePrepSmartSuggestionsInfinite,
  usePrepSmartRulesInfinite,
} from "@/features/prep/hooks/usePrepInfinite";
import { usePrepTaskMutations } from "@/features/prep/hooks/usePrepTaskMutations";
import { usePrepTemplates } from "@/features/prep/hooks/usePrepTemplates";
import { usePrepSocket } from "@/features/prep/hooks/usePrepSocket";
import { getPrimaryBranchIdForSession } from "@/lib/ws/authWsUrl";
import { usePrepRuleDiscovery } from "@/features/prep/hooks/usePrepRuleDiscovery";
import { usePrepSmartRules } from "@/features/prep/hooks/usePrepSmartRules";
import { prepApi } from "@/features/prep/services/prepApi";
import { PrepTemplate, PrepSmartRule, PrepTask, SmartSuggestion } from "@/features/prep/types";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { PREP_TAB_META, type PrepTabKey } from "@/config/moduleNav/prepNavConfig";
import { PrepTasksTable } from "@/features/prep/components/PrepTasksTable";
import { PrepTemplatesTable } from "@/features/prep/components/PrepTemplatesTable";
import { PrepSuggestionsTable } from "@/features/prep/components/PrepSuggestionsTable";
import { PrepRulesTable } from "@/features/prep/components/PrepRulesTable";

// Modal bileşenleri — sadece açıldığında yüklenir
const TemplateFormModal = dynamic(
  () => import("@/features/prep/components/TemplateFormModal").then(m => m.TemplateFormModal),
  { ssr: false, loading: () => null }
);
const SmartRuleFormModal = dynamic(
  () => import("@/features/prep/components/SmartRuleFormModal").then(m => m.SmartRuleFormModal),
  { ssr: false, loading: () => null }
);

export default function PrepManagementPage() {
  return (
    <AuthGuard module="prep" mode="view">
      <PrepManagementContent />
    </AuthGuard>
  );
}

function PrepManagementContent() {
  const t = useTranslations("prep");
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const baseBranchId = useMemo(() => getPrimaryBranchIdForSession(user), [user]);

  // İzin türevleri
  const isSuperuser = Boolean(user?.is_superuser);
  const hasPerm = (p: string) => isSuperuser || Boolean(user?.permissions?.includes(p));
  const canManageTemplates = hasPerm("prep.manage_templates");
  const canManageSmartRules = hasPerm("prep.manage_smart_rules");
  const canAddTask = hasPerm("prep.add_preptask");
  /** Sadece görüntüleme izni var, yönetim yetkisi yok */
  const isViewOnly = !canManageTemplates && !canManageSmartRules && !canAddTask;
  const [activeTab, setActiveTab] = useState<PrepTabKey>('tasks');
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab");
    const valid = PREP_TAB_META.some((m) => m.key === tab);
    if (valid && tab) {
      setActiveTab(tab as PrepTabKey);
    }
  }, [searchParams]);
  const [smartSubTab, setSmartSubTab] = useState<'suggestions' | 'rules'>('suggestions');

  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PrepTemplate | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);

  const [isSmartRuleModalOpen, setIsSmartRuleModalOpen] = useState(false);
  const [editingSmartRule, setEditingSmartRule] = useState<
    PrepSmartRule | (Partial<PrepSmartRule> & { id?: string }) | null
  >(null);
  const [smartRuleToDelete, setSmartRuleToDelete] = useState<string | null>(null);

  const [localBranchId, setLocalBranchId] = useState<string | null>(null);
  const effectiveBranchId =
    localBranchId !== null ? localBranchId : baseBranchId;

  /** Sunucudaki şube ayarı + liste modu; açıkken operasyon filtresi (eski tamamlananlar gizli). */
  const [prepAutoHideOldCompleted, setPrepAutoHideOldCompleted] = useState(false);

  useEffect(() => {
    const bid = (effectiveBranchId || "").trim();
    if (!bid) {
      setPrepAutoHideOldCompleted(false);
      return;
    }
    let cancelled = false;
    prepApi
      .getPrepBranchSettingsByBranch(bid)
      .then((row) => {
        if (!cancelled) {
          setPrepAutoHideOldCompleted(!!row.management_hide_old_completed);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPrepAutoHideOldCompleted(false);
          toast.error(t("toasts.settingsLoadFailed"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveBranchId, t]);

  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  /** Görev tablosu: tümü / aktif (bekleyen+süreçte) / tamamlanan */
  const [taskListFilter, setTaskListFilter] = useState<"all" | "active" | "completed">("all");

  const {
    updateStatus,
    recordProgress,
    progressRecordingTaskId,
    createTask,
    deleteTask,
  } = usePrepTaskMutations();

  const {
    rows: tasks,
    isLoading: isTasksLoading,
    fetchNextPage: fetchMoreTasks,
    hasNextPage: hasMoreTasks,
    isFetchingNextPage: isFetchingMoreTasks,
    refetch: refreshTasks,
  } = usePrepTasksInfinite({
    branchId: effectiveBranchId,
    statusGroup: taskListFilter,
    listMode: "branch_default",
  });

  const { activeCount: activeTaskCount, completedCount: completedTaskCount } = usePrepTaskCounts({
    branchId: effectiveBranchId,
    listMode: "branch_default",
  });

  const {
    rows: templates,
    isLoading: isTemplatesLoading,
    fetchNextPage: fetchMoreTemplates,
    hasNextPage: hasMoreTemplates,
    isFetchingNextPage: isFetchingMoreTemplates,
    refetch: refreshTemplates,
    totalCount: templatesTotalCount,
  } = usePrepTemplatesInfinite(effectiveBranchId);

  const {
    createTemplate,
    updateTemplate,
    deleteTemplate,
    isCreating,
    isUpdating,
    isDeleting,
  } = usePrepTemplates(effectiveBranchId, { skipQuery: true });

  const {
    rows: suggestions,
    isLoading: isSuggestionsLoading,
    fetchNextPage: fetchMoreSuggestions,
    hasNextPage: hasMoreSuggestions,
    isFetchingNextPage: isFetchingMoreSuggestions,
    refetch: refreshSuggestions,
    totalCount: suggestionsTotalCount,
  } = usePrepSmartSuggestionsInfinite(effectiveBranchId);

  const { data: discovery } = usePrepRuleDiscovery(effectiveBranchId);

  const {
    rows: rules,
    isLoading: isRulesLoading,
    fetchNextPage: fetchMoreRules,
    hasNextPage: hasMoreRules,
    isFetchingNextPage: isFetchingMoreRules,
    refetch: refreshRules,
    totalCount: rulesTotalCount,
  } = usePrepSmartRulesInfinite(effectiveBranchId);

  const {
    createRule,
    updateRule,
    deleteRule,
    isCreating: isCreatingRule,
    isUpdating: isUpdatingRule,
    isDeleting: isDeletingRule,
  } = usePrepSmartRules(effectiveBranchId, { skipQuery: true });

  usePrepSocket(effectiveBranchId);

  const userId = user?.id ?? "";

  const enabledTemplateCount = useMemo(() => {
    if (hasMoreTemplates) return null;
    return templates.filter((tpl) => tpl.is_enabled).length;
  }, [templates, hasMoreTemplates]);

  const canStartAssignedTask = (task: PrepTask) =>
    isViewOnly &&
    task.status === "PENDING" &&
    !!userId &&
    task.assigned_to === userId;

  const showTaskActionsColumn =
    canAddTask ||
    canManageTemplates ||
    tasks.some(canStartAssignedTask);

  const handleTaskStatCardClick = (filter: "active" | "completed") => {
    setTaskListFilter((prev) => (prev === filter ? "all" : filter));
  };

  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (activeTab === 'tasks') refreshTasks();
    if (activeTab === 'templates') refreshTemplates();
    if (activeTab === 'smart-rules') {
      refreshSuggestions();
      refreshRules();
    }
  }, [activeTab, refreshTasks, refreshTemplates, refreshSuggestions, refreshRules]);

  useEffect(() => {
    if (user?.is_superuser || (user?.available_branches && user.available_branches.length > 1)) {
      prepApi.getBranches().then(setBranches);
    }
  }, [user]);

  const handleSaveTemplate = async (data: Partial<PrepTemplate>) => {
    if (editingTemplate) {
      await updateTemplate({ id: editingTemplate.id, data });
    } else {
      await createTemplate({ ...data, branch: data.branch || effectiveBranchId });
    }
    setIsTemplateModalOpen(false);
    setEditingTemplate(null);
  };

  const handleSaveSmartRule = async (data: Partial<PrepSmartRule>) => {
    const existingId = editingSmartRule?.id;
    if (existingId) {
      await updateRule({ id: existingId, data });
    } else {
      await createRule({ ...data, branch: data.branch || effectiveBranchId });
    }
    setIsSmartRuleModalOpen(false);
    setEditingSmartRule(null);
  };

  const handleEditTemplate = (template: PrepTemplate) => {
    setEditingTemplate(template);
    setIsTemplateModalOpen(true);
  };

  const handleEditSmartRule = (rule: PrepSmartRule) => {
    setEditingSmartRule(rule);
    setIsSmartRuleModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (templateToDelete) {
      await deleteTemplate(templateToDelete);
      setTemplateToDelete(null);
    }
  };

  const handleSmartRuleDeleteConfirm = async () => {
    if (smartRuleToDelete) {
      await deleteRule(smartRuleToDelete);
      setSmartRuleToDelete(null);
    }
  };

  const handleTaskDeleteConfirm = async () => {
    if (taskToDelete) {
      await deleteTask(taskToDelete);
      setTaskToDelete(null);
    }
  };

  const showBranchSelect = user?.is_superuser || (user?.available_branches && user.available_branches.length > 1);

  return (
    <AppShell>
      <div className="flex h-full flex-col bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 bg-card border-border shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-bold dark:text-white leading-tight">
                {t("management.title")}
                {activeTab === 'templates' && templatesTotalCount > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">({templatesTotalCount})</span>}
                {activeTab === 'smart-rules' && rulesTotalCount > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">({rulesTotalCount})</span>}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                {showBranchSelect ? (
                  (() => {
                    const selId = effectiveBranchId || "__all__";
                    const selLabel = selId === "__all__"
                      ? t("management.allBranches")
                      : (branches.find(b => b.id === selId)?.name || selId);
                    return (
                  <Select
                    value={selId}
                    onValueChange={(val) => setLocalBranchId(val === "__all__" ? "" : val)}
                  >
                    <SelectTrigger className="text-xs font-medium bg-transparent border-none text-blue-600 outline-none cursor-pointer p-0 h-auto shadow-none hover:bg-transparent">
                      <span className="truncate">{selLabel}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t("management.allBranches")}</SelectItem>
                      {branches.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  );
                })()
                ) : (
                  <p className="text-xs text-muted-foreground font-medium">
                    {user?.branch_name || t("management.noBranchAssigned")}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'templates' && canManageTemplates && (
              <Button size="sm" className="gap-2 shadow-sm" onClick={() => setIsTemplateModalOpen(true)}>
                <Plus size={16} />
                {t("management.newTemplate")}
              </Button>
            )}
            {activeTab === 'smart-rules' && canManageSmartRules && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-purple-200 text-purple-600 hover:bg-purple-50"
                onClick={() => {
                  setEditingSmartRule(null);
                  setIsSmartRuleModalOpen(true);
                }}
              >
                <Plus size={16} />
                {t("management.newRule")}
              </Button>
            )}
            {activeTab === 'tasks' && (
              <Button size="sm" variant="secondary" className="gap-2" onClick={() => refreshTasks()}>
                <Loader2 size={16} className={cn(isTasksLoading && "animate-spin")} />
                {t("management.refresh")}
              </Button>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Tab Navigation */}
          <div className="flex items-center gap-1 border-b border-border px-4 bg-card border-border shrink-0">
            {([
              { value: 'tasks' as const, tab: 'tasks' as const, icon: ClipboardList, visible: true },
              { value: 'templates' as const, tab: 'templates' as const, icon: CalendarClock, visible: canManageTemplates },
              { value: 'smart-rules' as const, tab: 'smartRules' as const, icon: BrainCircuit, visible: canManageSmartRules || canManageTemplates },
              { value: 'settings' as const, tab: 'settings' as const, icon: Settings2, visible: canManageTemplates },
            ]).filter((t) => t.visible).map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  activeTab === tab.value
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                    : 'border-transparent text-muted-foreground hover: hover:border-slate-300 dark:text-muted-foreground dark:hover:'
                )}
              >
                <tab.icon size={16} />
                {t(`management.tabs.${tab.tab}`)}
              </button>
            ))}
          </div>

          {/* Main Content Area */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 bg-muted">

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 shrink-0">
              {([
                {
                  labelKey: 'activeTasks' as const,
                  value: activeTaskCount.toString(),
                  icon: ClipboardList, color: 'blue' as const,
                  visible: true,
                  filterKey: 'active' as const,
                },
                {
                  labelKey: 'completed' as const,
                  value: completedTaskCount.toString(),
                  icon: CheckCircle2, color: 'emerald' as const,
                  visible: true,
                  filterKey: 'completed' as const,
                },
                {
                  labelKey: 'activeTemplates' as const,
                  value: (enabledTemplateCount ?? templatesTotalCount).toString(),
                  icon: CalendarClock, color: 'amber' as const,
                  visible: canManageTemplates,
                },
                {
                  labelKey: 'smartSuggestions' as const,
                  value: suggestionsTotalCount.toString(),
                  icon: Sparkles, color: 'purple' as const,
                  visible: canManageSmartRules || canManageTemplates,
                },
              ]).filter((s) => s.visible).map((stat, i) => {
                const isTaskStatCard =
                  stat.labelKey === "activeTasks" || stat.labelKey === "completed";
                const isSelected =
                  isTaskStatCard &&
                  stat.filterKey != null &&
                  taskListFilter === stat.filterKey;
                const CardTag = isTaskStatCard ? "button" : "div";
                return (
                  <CardTag
                    key={i}
                    type={isTaskStatCard ? "button" : undefined}
                    onClick={
                      isTaskStatCard && stat.filterKey
                        ? () => handleTaskStatCardClick(stat.filterKey!)
                        : undefined
                    }
                    className={cn(
                      "bg-card/40 p-3 rounded-xl border shadow-sm flex items-center gap-3 text-left w-full",
                      isTaskStatCard && "cursor-pointer transition-colors hover: dark:hover:/60",
                      isSelected
                        ? "border-blue-500 ring-2 ring-blue-500/20 dark:border-blue-400"
                        : "border-border",
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      stat.color === 'blue' ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400" :
                        stat.color === 'emerald' ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400" :
                          stat.color === 'amber' ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400" :
                          "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400"
                    )}>
                      <stat.icon size={16} />
                    </div>
                    <div>
                      <p className="text-sub font-semibold text-muted-foreground leading-none mb-1">{t(`management.stats.${stat.labelKey}`)}</p>
                      <p className="text-base font-bold dark:text-white leading-none">{stat.value}</p>
                    </div>
                  </CardTag>
                );
              })}
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border shadow-none border-border bg-card">
                {/* Search Bar Row (White) */}
                <div className="p-2 flex items-center justify-between shrink-0 bg-card">
                  <div className="flex items-center gap-2">
                    <div className="relative w-64">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={t("management.searchPlaceholder")}
                        className="pl-9 h-9 text-sm bg-card border-border"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-9 gap-2 text-muted-foreground border-border">
                        <Filter size={14} />
                        {t("management.filter")}
                      </Button>
                    </div>
                  </div>

                  {activeTab === 'smart-rules' && (
                    <div className="flex bg-secondary p-1 rounded-lg">
                      <button
                        onClick={() => setSmartSubTab('suggestions')}
                        className={cn(
                          "px-4 py-1.5 text-xs font-semibold rounded-md transition-all",
                          smartSubTab === 'suggestions' ? "bg-card text-purple-600 shadow-sm" : "text-muted-foreground hover:"
                        )}
                      >
                        {t("management.smartSubTabs.suggestions")}
                      </button>
                      <button
                        onClick={() => setSmartSubTab('rules')}
                        className={cn(
                          "px-4 py-1.5 text-xs font-semibold rounded-md transition-all",
                          smartSubTab === 'rules' ? "bg-card text-purple-600 shadow-sm" : "text-muted-foreground hover:"
                        )}
                      >
                        {t("management.smartSubTabs.ruleManagement")}
                      </button>
                    </div>
                  )}
                </div>

                <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0 bg-card">
                  {activeTab === "tasks" && (
                    <PrepTasksTable
                      tasks={tasks}
                      isLoading={isTasksLoading}
                      fetchMore={() => void fetchMoreTasks()}
                      hasMore={!!hasMoreTasks}
                      isFetchingNextPage={isFetchingMoreTasks}
                      showActionsColumn={showTaskActionsColumn}
                      canAddTask={canAddTask}
                      canManageTemplates={canManageTemplates}
                      canStartAssignedTask={canStartAssignedTask}
                      progressRecordingTaskId={progressRecordingTaskId}
                      taskListFilter={taskListFilter}
                      onUpdateStatus={updateStatus}
                      onRecordProgress={recordProgress}
                      onDeleteTask={setTaskToDelete}
                    />
                  )}

                  {activeTab === "templates" && (
                    <PrepTemplatesTable
                      templates={templates}
                      isLoading={isTemplatesLoading}
                      fetchMore={() => void fetchMoreTemplates()}
                      hasMore={!!hasMoreTemplates}
                      isFetchingNextPage={isFetchingMoreTemplates}
                      onEdit={handleEditTemplate}
                      onDelete={setTemplateToDelete}
                      onCreateFirst={() => setIsTemplateModalOpen(true)}
                    />
                  )}

                  {activeTab === "smart-rules" && smartSubTab === "suggestions" && (
                    <PrepSuggestionsTable
                      suggestions={suggestions}
                      isLoading={isSuggestionsLoading}
                      fetchMore={() => void fetchMoreSuggestions()}
                      hasMore={!!hasMoreSuggestions}
                      isFetchingNextPage={isFetchingMoreSuggestions}
                      onCreateTask={(sug: SmartSuggestion) =>
                        createTask({
                          title: t("management.suggestionTaskTitle", { item: sug.target_item }),
                          target_quantity: sug.suggested_quantity,
                          unit: sug.unit,
                          branch: effectiveBranchId,
                          is_recurring: false,
                        })
                      }
                    />
                  )}

                  {activeTab === "smart-rules" && smartSubTab === "rules" && (
                    <PrepRulesTable
                      rules={rules}
                      discovery={discovery}
                      isLoading={isRulesLoading}
                      fetchMore={() => void fetchMoreRules()}
                      hasMore={!!hasMoreRules}
                      isFetchingNextPage={isFetchingMoreRules}
                      onEdit={handleEditSmartRule}
                      onDelete={setSmartRuleToDelete}
                      onCreateManual={() => {
                        setEditingSmartRule(null);
                        setIsSmartRuleModalOpen(true);
                      }}
                      onDiscoveryAdd={(disc) => {
                        setEditingSmartRule({
                          title: t("management.discoveryRuleTitle", { product: disc.product_name }),
                          branch: effectiveBranchId || "",
                          base_product: disc.product_id,
                          target_item: t("management.discoveryTargetMaterial", {
                            product: disc.product_name,
                          }),
                          ratio: 1,
                          unit: "ADET",
                          is_active: true,
                        });
                        setIsSmartRuleModalOpen(true);
                      }}
                    />
                  )}

                  {activeTab === 'settings' && (
                    <div className="p-6 space-y-6 bg-card">
                      <h3 className="text-sm font-bold dark:text-white">{t("management.moduleSettings")}</h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-4 p-4 bg-muted/50 rounded-xl border border-transparent border-border">
                          <div className="min-w-0 flex-1">
                            <Label htmlFor="prep-auto-archive" className="text-sm font-bold text-foreground cursor-pointer">
                              {t("management.autoArchive.label")}
                            </Label>
                            <p className="text-xs text-muted-foreground mt-1">
                              {t("management.autoArchive.description")}
                            </p>
                            {!(effectiveBranchId || "").trim() && (
                              <p className="text-xs text-amber-600 mt-2">
                                {t("management.autoArchive.branchRequired")}
                              </p>
                            )}
                          </div>
                          <Switch
                            id="prep-auto-archive"
                            checked={prepAutoHideOldCompleted}
                            disabled={!(effectiveBranchId || "").trim()}
                            onCheckedChange={async (checked) => {
                              const bid = (effectiveBranchId || "").trim();
                              if (!bid) return;
                              const prev = prepAutoHideOldCompleted;
                              setPrepAutoHideOldCompleted(checked);
                              try {
                                await prepApi.patchPrepBranchSettingsByBranch({
                                  branch: bid,
                                  management_hide_old_completed: checked,
                                });
                                await queryClient.invalidateQueries({ queryKey: ["prep-tasks"] });
                                await queryClient.invalidateQueries({ queryKey: ["prep-tasks-infinite"] });
                                await queryClient.invalidateQueries({ queryKey: ["prep-task-count"] });
                              } catch {
                                setPrepAutoHideOldCompleted(prev);
                                toast.error(t("toasts.settingsSaveFailed"));
                              }
                            }}
                            className="shrink-0 data-[state=checked]:bg-blue-600"
                          />
                        </div>
                      </div>
                    </div>
                  )}
</CardContent>
              </Card>
            </div>

            <div className="shrink-0 mt-4 p-4 bg-card border border-border rounded-xl shadow-sm">
              <h4 className="text-xs font-bold mb-3 flex items-center gap-2">
                <Sparkles size={14} className="text-blue-500" />
                {t("management.tipsTitle")}
              </h4>
              <ul className="space-y-2 text-xs text-muted-foreground font-medium">
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                  {t("management.tips.templatesFire")}
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                  {t("management.tips.smartRulesTrend")}
                </li>
              </ul>
            </div>
          </div>
        </Tabs>
      </div>

      <TemplateFormModal
        open={isTemplateModalOpen}
        onClose={() => {
          setIsTemplateModalOpen(false);
          setEditingTemplate(null);
        }}
        onSave={handleSaveTemplate}
        isLoading={isCreating || isUpdating}
        branchId={effectiveBranchId}
        initialData={editingTemplate}
      />

      <SmartRuleFormModal
        open={isSmartRuleModalOpen}
        onClose={() => {
          setIsSmartRuleModalOpen(false);
          setEditingSmartRule(null);
        }}
        onSave={handleSaveSmartRule}
        isLoading={isCreatingRule || isUpdatingRule}
        branchId={effectiveBranchId}
        initialData={editingSmartRule}
      />

      <AlertDialog open={!!taskToDelete} onOpenChange={(val) => !val && setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("management.dialogs.deleteTask.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("management.dialogs.deleteTask.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("management.dialogs.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleTaskDeleteConfirm();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {t("management.dialogs.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!templateToDelete} onOpenChange={(val) => !val && setTemplateToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("management.dialogs.deleteTemplate.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("management.dialogs.deleteTemplate.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("management.dialogs.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? t("management.dialogs.deleting") : t("management.dialogs.deleteTemplate.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!smartRuleToDelete} onOpenChange={(val) => !val && setSmartRuleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("management.dialogs.deleteRule.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("management.dialogs.deleteRule.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingRule}>{t("management.dialogs.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleSmartRuleDeleteConfirm();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={isDeletingRule}
            >
              {isDeletingRule ? t("management.dialogs.deleting") : t("management.dialogs.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
