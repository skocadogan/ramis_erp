"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/store/useAuthStore";
import type { Branch } from "@/types/user.types";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useWaiterAssignments } from "../../hooks/useWaiterAssignments";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function WaiterAssignmentsTab({ branches }: { branches: Branch[] }) {
  const t = useTranslations("admin")
  const user = useAuthStore((s) => s.user);
  const [branchId, setBranchId] = useState("");
  const [userId, setUserId] = useState("");
  const [zoneIds, setZoneIds] = useState<string[]>([]);
  const [tableIds, setTableIds] = useState<string[]>([]);

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
    zones,
    tables,
    users,
    assignments,
    isLoading,
    isAssignmentsLoading,
    isUpdating,
    updateAssignments,
  } = useWaiterAssignments(branchId, userId);

  // Sync state with assignments data
  useEffect(() => {
    if (assignments) {
      setZoneIds(assignments.zone_ids || []);
      setTableIds(assignments.table_ids || []);
    } else {
      setZoneIds([]);
      setTableIds([]);
    }
  }, [assignments]);

  const zoneNameById = useMemo(() => {
    const m = new Map<string, string>();
    zones.forEach((z) => m.set(z.id, z.name));
    return m;
  }, [zones]);

  const toggleZone = (id: string) => {
    setZoneIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleTable = (id: string) => {
    setTableIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    updateAssignments({
      zone_ids: zoneIds,
      table_ids: tableIds,
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
            {t('assignments.waiter.title')}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('assignments.waiter.description')}
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
           
            {t('assignments.waiter.staffLabel')}
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
        <div className="flex items-center gap-2 rounded-md border border-border bg-slate-50 px-3 py-2 text-sm text-slate-600 border-border bg-muted/80 text-muted-foreground">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
          {t('common.loading')}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-lg border border-border border-border bg-card">
          <div className="flex flex-col gap-2 border-b border-border bg-slate-50 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between border-border bg-muted/80">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            
              {t('assignments.waiter.zonesTitle')}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={zones.length === 0}
                onClick={() => setZoneIds(zones.map((z) => z.id))}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  zones.length === 0
                    ? "cursor-not-allowed text-muted-foreground"
                    : "text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                )}
              >
                {t('assignments.common.selectAll')}
              </button>
              <span className="text-muted-foreground">|</span>
              <button
                type="button"
                disabled={zones.length === 0 || zoneIds.length === 0}
                onClick={() => setZoneIds([])}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  zones.length === 0 || zoneIds.length === 0
                    ? "cursor-not-allowed text-muted-foreground"
                    : "text-slate-600 hover:bg-slate-100 dark:text-muted-foreground dark:hover:bg-slate-800"
                )}
              >
                {t('assignments.common.deselectAll')}
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-3">
            {zones.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground dark:text-muted-foreground">
                {t('assignments.waiter.noZones')}
              </p>
            ) : (
              <ul className="space-y-1">
                {zones.map((z) => (
                  <li key={z.id}>
                    <Label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <Checkbox
                        checked={zoneIds.includes(z.id)}
                        onCheckedChange={() => toggleZone(z.id)}
                      />
                      <span className="text-sm font-medium text-foreground text-foreground">
                        {z.name}
                      </span>
                    </Label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-border bg-slate-50/80 px-4 py-2 text-xs text-muted-foreground border-border bg-muted/50 dark:text-muted-foreground">
            {t('assignments.waiter.zonesSelected', { count: zoneIds.length, total: zones.length })}
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-border border-border bg-card">
          <div className="flex flex-col gap-2 border-b border-border bg-slate-50 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between border-border bg-muted/80">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
             
              {t('assignments.waiter.tablesTitle')}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={tables.length === 0}
                onClick={() => setTableIds(tables.map((t) => t.id))}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  tables.length === 0
                    ? "cursor-not-allowed text-muted-foreground"
                    : "text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                )}
              >
                {t('assignments.common.selectAll')}
              </button>
              <span className="text-muted-foreground">|</span>
              <button
                type="button"
                disabled={tables.length === 0 || tableIds.length === 0}
                onClick={() => setTableIds([])}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  tables.length === 0 || tableIds.length === 0
                    ? "cursor-not-allowed text-muted-foreground"
                    : "text-slate-600 hover:bg-slate-100 dark:text-muted-foreground dark:hover:bg-slate-800"
                )}
              >
                {t('assignments.common.deselectAll')}
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-3">
            {tables.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground dark:text-muted-foreground">
                {t('assignments.waiter.noTables')}
              </p>
            ) : (
              <ul className="space-y-1">
                {tables.map((table_item) => (
                  <li key={table_item.id}>
                    <Label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <Checkbox
                        checked={tableIds.includes(table_item.id)}
                        onCheckedChange={() => toggleTable(table_item.id)}
                      />
                      <span className="text-sm font-medium text-foreground text-foreground">
                        {table_item.name}
                      </span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {zoneNameById.get(table_item.zone) ?? "—"}
                      </span>
                    </Label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-border bg-slate-50/80 px-4 py-2 text-xs text-muted-foreground border-border bg-muted/50 dark:text-muted-foreground">
            {t('assignments.waiter.tablesSelected', { count: tableIds.length, total: tables.length })}
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
            {t('assignments.waiter.saveWarning')}
          </span>
        ) : null}
      </div>
    </div>
  );
}
