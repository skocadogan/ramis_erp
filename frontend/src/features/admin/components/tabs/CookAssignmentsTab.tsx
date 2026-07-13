"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/store/useAuthStore";
import type { Branch } from "@/types/user.types";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useCookAssignments } from "../../hooks/useCookAssignments";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function CookAssignmentsTab({ branches }: { branches: Branch[] }) {
  const t = useTranslations("admin")
  const user = useAuthStore((s) => s.user);
  const [branchId, setBranchId] = useState("");
  const [userId, setUserId] = useState("");
  const [stationIds, setStationIds] = useState<string[]>([]);

  // Initial branch selection
  useEffect(() => {
    if (branches.length === 0 || branchId) return;
    const initialBranchId =
      branches.length === 1
        ? branches[0].id
        : user?.branch_id && branches.some((b) => b.id === user.branch_id)
          ? user.branch_id
          : branches[0].id;
    setBranchId(initialBranchId);
  }, [branches, branchId, user?.branch_id]);

  const {
    stations,
    users,
    assignments,
    isLoading,
    isAssignmentsLoading,
    isUpdating,
    updateAssignments,
  } = useCookAssignments(branchId, userId);

  // Sync state with assignments data
  useEffect(() => {
    if (assignments) {
      setStationIds(assignments.station_ids || []);
    } else {
      setStationIds([]);
    }
  }, [assignments]);

  const toggleStation = (id: string) => {
    setStationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    updateAssignments({
      station_ids: stationIds,
    });
  };

  if (branches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('assignments.common.emptyBranches')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {t('assignments.cook.title')}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('assignments.cook.description')}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('assignments.common.branch')}
          </span>
          <select
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setUserId("");
            }}
            className={selectClass}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
           
            {t('assignments.cook.staffLabel')}
          </span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className={selectClass}
          >
            <option value="">{t('assignments.waiter.staffSelect')}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(isLoading || (isAssignmentsLoading && userId)) && (
        <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm border-border bg-muted/80 text-muted-foreground">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
          {t('common.loading')}
        </div>
      )}

      <div className="max-w-2xl">
        <section className="overflow-hidden rounded-lg border border-border border-border bg-card">
          <div className="flex flex-col gap-2 border-b border-border px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between border-border bg-muted/80">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
             
              {t('assignments.cook.stationsTitle')}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={stations.length === 0}
                onClick={() => setStationIds(stations.map((s) => s.id))}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  stations.length === 0
                    ? "cursor-not-allowed text-muted-foreground"
                    : "text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                )}
              >
                {t('assignments.common.selectAll')}
              </button>
              <span className="text-muted-foreground">|</span>
              <button
                type="button"
                disabled={stations.length === 0 || stationIds.length === 0}
                onClick={() => setStationIds([])}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  stations.length === 0 || stationIds.length === 0
                    ? "cursor-not-allowed text-muted-foreground"
                    : " hover: dark:text-muted-foreground dark:hover:"
                )}
              >
                {t('assignments.common.deselectAll')}
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto p-3">
            {stations.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground dark:text-muted-foreground">
                {t('assignments.cook.noStations')}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {stations.map((s) => (
                  <li key={s.id}>
                    <Label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover: dark:hover:/60">
                      <Checkbox
                        checked={stationIds.includes(s.id)}
                        onCheckedChange={() => toggleStation(s.id)}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground text-foreground">
                          {s.name}
                        </span>
                        <span className="text-2xs text-muted-foreground uppercase tracking-tighter">
                          {s.code}
                        </span>
                      </div>
                      <div 
                        className="ml-auto size-2 rounded-full" 
                        style={{ backgroundColor: s.color }} 
                      />
                    </Label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-border /80 px-4 py-2 text-xs text-muted-foreground border-border bg-muted/50 dark:text-muted-foreground">
            {t('assignments.cook.stationsSelected', { count: stationIds.length, total: stations.length })}
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4 border-border">
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
            {t('assignments.cook.saveWarning')}
          </span>
        ) : null}
      </div>
    </div>
  );
}
