"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/store/useAuthStore";
import type { Branch } from "@/types/user.types";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, Delete } from "lucide-react";
import { useCashierPins } from "../../hooks/useCashierPins";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function CashierPinsTab({ branches }: { branches: Branch[] }) {
  const t = useTranslations("admin");
  const user = useAuthStore((s) => s.user);
  
  const [branchId, setBranchId] = useState("");
  const [userId, setUserId] = useState("");
  const [posIds, setPosIds] = useState<string[]>([]);
  const [pin, setPin] = useState("");

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
    posTerminals,
    cashierUsers,
    assignment,
    isLoading,
    isAssignmentLoading,
    isSaving,
    saveAssignment,
  } = useCashierPins(branchId, userId);

  // Sync state with assignment data
  useEffect(() => {
    if (assignment) {
      setPosIds(assignment.pos_terminal_ids || []);
      setPin(assignment.pin || "");
    } else {
      setPosIds([]);
      setPin("");
    }
  }, [assignment]);

  const togglePos = (id: string) => {
    setPosIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleNumpadPress = (val: string) => {
    if (val === "C") {
      setPin("");
    } else if (val === "back") {
      setPin((prev) => prev.slice(0, -1));
    } else {
      if (pin.length < 4 && /^\d$/.test(val)) {
        setPin((prev) => prev + val);
      }
    }
  };

  const handleSave = () => {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return;
    }
    saveAssignment({
      pos_terminals: posIds,
      pin: pin,
    });
  };

  if (branches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("assignments.common.emptyBranches")}
      </p>
    );
  }

  const isPinValid = pin.length === 4 && /^\d{4}$/.test(pin);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {t("assignments.cashierPin.title")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("assignments.cashierPin.description")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("assignments.common.branch")}
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
            
            {t("assignments.cashierPin.staffLabel")}
          </span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className={selectClass}
          >
            <option value="">{t("assignments.cashierPin.staffSelect")}</option>
            {cashierUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(isLoading || (isAssignmentLoading && userId)) && (
        <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm border-border bg-muted/80 text-muted-foreground">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
          {t("common.loading")}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* POS Terminals Checkbox List */}
        <section className="overflow-hidden rounded-lg border border-border border-border bg-card">
          <div className="flex flex-col gap-2 border-b border-border px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between border-border bg-muted/80">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
             
              {t("assignments.cashierPin.posTitle")}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={posTerminals.length === 0}
                onClick={() => setPosIds(posTerminals.map((p) => p.id))}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  posTerminals.length === 0
                    ? "cursor-not-allowed text-muted-foreground"
                    : "text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                )}
              >
                {t("assignments.common.selectAll")}
              </button>
              <span className="text-muted-foreground">|</span>
              <button
                type="button"
                disabled={posTerminals.length === 0 || posIds.length === 0}
                onClick={() => setPosIds([])}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  posTerminals.length === 0 || posIds.length === 0
                    ? "cursor-not-allowed text-muted-foreground"
                    : " hover: dark:text-muted-foreground dark:hover:"
                )}
              >
                {t("assignments.common.deselectAll")}
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto p-3">
            {posTerminals.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground dark:text-muted-foreground">
                {t("assignments.cashierPin.noPos")}
              </p>
            ) : (
              <ul className="space-y-1">
                {posTerminals.map((p) => (
                  <li key={p.id}>
                    <Label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover: dark:hover:/60">
                      <Checkbox
                        checked={posIds.includes(p.id)}
                        onCheckedChange={() => togglePos(p.id)}
                      />
                      <span className="text-sm font-medium text-foreground text-foreground">
                        {p.name} ({p.code})
                      </span>
                    </Label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-border /80 px-4 py-2 text-xs text-muted-foreground border-border bg-muted/50 dark:text-muted-foreground">
            {t("assignments.cashierPin.posSelected", { count: posIds.length, total: posTerminals.length })}
          </div>
        </section>

        {/* PIN Configuration Section */}
        <section className="overflow-hidden rounded-lg border border-border border-border bg-card">
          <div className="flex flex-col gap-2 border-b border-border px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between border-border bg-muted/80">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
             
              {t("assignments.cashierPin.pinTitle")}
            </h3>
          </div>

          <div className="p-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cashier-pin-input" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("assignments.cashierPin.pinLabel")}
              </Label>
              <div className="relative">
                <Input
                  id="cashier-pin-input"
                  type="password"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    if (val.length <= 4) {
                      setPin(val);
                    }
                  }}
                  disabled={!userId}
                  placeholder={t("assignments.cashierPin.pinPlaceholder")}
                  className="tracking-widest text-center text-lg font-bold select-none h-11"
                />
              </div>
            </div>

            {/* Premium Numpad */}
            <div className="grid grid-cols-3 gap-2 max-w-[280px] mx-auto pt-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  disabled={!userId}
                  onClick={() => handleNumpadPress(num.toString())}
                  className="flex h-12 items-center justify-center rounded-lg border border-border hover:bg-secondary dark:hover: font-semibold text-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                disabled={!userId}
                onClick={() => handleNumpadPress("C")}
                className="flex h-12 items-center justify-center rounded-lg border border-border bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 font-semibold text-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                C
              </button>
              <button
                type="button"
                disabled={!userId}
                onClick={() => handleNumpadPress("0")}
                className="flex h-12 items-center justify-center rounded-lg border border-border hover:bg-secondary dark:hover: font-semibold text-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                0
              </button>
              <button
                type="button"
                disabled={!userId || !pin}
                onClick={() => handleNumpadPress("back")}
                className="flex h-12 items-center justify-center rounded-lg border border-border hover:bg-secondary dark:hover: font-semibold text-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Delete size={18} className="text-muted-foreground" />
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4 border-border">
        <Button
          type="button"
          disabled={isSaving || !userId || !isPinValid}
          onClick={handleSave}
        >
          {isSaving && <Loader2 size={14} className="animate-spin" />}
          {isSaving ? t("assignments.common.saving") : t("assignments.common.save")}
        </Button>
        {!userId || !isPinValid ? (
          <span className="text-xs text-muted-foreground">
            {t("assignments.cashierPin.saveWarning")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
