"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, ShieldCheck } from "lucide-react";
import { useManagerAssignments } from "../../hooks/useManagerAssignments";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function ManagerAssignmentsTab() {
  const t = useTranslations("admin")
  const [userId, setUserId] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>([]);

  const {
    branches,
    users,
    assignments,
    isLoading,
    isAssignmentsLoading,
    isUpdating,
    updateAssignments,
  } = useManagerAssignments(userId);

  // Sync state with assignments data
  useEffect(() => {
    if (assignments) {
      setBranchIds(assignments.branch_ids || []);
    } else {
      setBranchIds([]);
    }
  }, [assignments]);

  const toggleBranch = (id: string) => {
    setBranchIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    updateAssignments({
      branch_ids: branchIds,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-ui-semibold text-foreground">
            {t('assignments.manager.title')}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('assignments.manager.description')}
          </p>
        </div>
      </div>

      <div className="max-w-md">
        <div className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-xs font-ui-semibold uppercase tracking-wider text-muted-foreground">
           
            {t('assignments.manager.staffLabel')}
          </span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className={selectClass}
          >
            <option value="">{t('assignments.waiter.staffSelect')}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username} {u.first_name || u.last_name ? `(${u.first_name} ${u.last_name})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(isLoading || (isAssignmentsLoading && userId)) && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
          {t('common.loading')}
        </div>
      )}

      <div className="max-w-2xl">
        <section className="overflow-hidden rounded-lg border border-border bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-col gap-2 border-b border-border bg-slate-50 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-800/80">
            <h3 className="flex items-center gap-2 text-sm font-ui-semibold text-foreground">
            
              {t('assignments.manager.branchesTitle')}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={branches.length === 0}
                onClick={() => setBranchIds(branches.map((b) => b.id))}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-ui-medium transition-colors",
                  branches.length === 0
                    ? "cursor-not-allowed text-slate-300 dark:text-slate-600"
                    : "text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                )}
              >
                {t('assignments.common.selectAll')}
              </button>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <button
                type="button"
                disabled={branches.length === 0 || branchIds.length === 0}
                onClick={() => setBranchIds([])}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-ui-medium transition-colors",
                  branches.length === 0 || branchIds.length === 0
                    ? "cursor-not-allowed text-slate-300 dark:text-slate-600"
                    : "text-slate-600 hover:bg-slate-100 dark:text-muted-foreground dark:hover:bg-slate-800"
                )}
              >
                {t('assignments.common.deselectAll')}
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto p-3">
            {branches.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground dark:text-muted-foreground">
                {t('assignments.manager.noBranches')}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {branches.map((b) => (
                  <li key={b.id}>
                    <Label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <Checkbox
                        checked={branchIds.includes(b.id)}
                        onCheckedChange={() => toggleBranch(b.id)}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-ui-medium text-foreground dark:text-slate-200">
                          {b.name}
                        </span>
                        <span className="text-2xs text-muted-foreground uppercase tracking-tighter">
                          {b.code}
                        </span>
                      </div>
                      {branchIds.includes(b.id) && (
                        <ShieldCheck size={14} className="ml-auto text-green-600 dark:text-green-500" />
                      )}
                    </Label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-border bg-slate-50/80 px-4 py-2 text-xs text-muted-foreground dark:border-slate-700 dark:bg-slate-800/50 dark:text-muted-foreground">
            {t('assignments.manager.branchesSelected', { count: branchIds.length, total: branches.length })}
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4 dark:border-slate-700">
        <Button
          type="button"
          disabled={isUpdating || !userId}
          onClick={handleSave}
        >
          {isUpdating && <Loader2 size={14} className="animate-spin" />}
          {isUpdating ? t('assignments.common.saving') : t('assignments.common.save')}
        </Button>
        {!userId ? (
          <span className="text-xs text-muted-foreground">
            {t('assignments.manager.saveWarning')}
          </span>
        ) : null}
      </div>
    </div>
  );
}
