"use client";

import React, { memo, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslations } from "next-intl";
import {
  Loader2,
  FileBarChart,
  Lock,
  PlusCircle,
  ArrowUpCircle,
  Edit2,
  FileText,
} from "lucide-react";
import { AMOUNT_DISPLAY_MASK, formatCurrency, formatDate, formatAmount } from "@/lib/formatters";
import type { ShiftDto } from "../types";

interface ShiftsTableProps {
  shifts: ShiftDto[];
  canViewAmounts: boolean;
  canManageShift: boolean;
  canEditClosedShift: boolean;
  canClose: boolean;
  onLoadZ: (id: string) => void;
  onLoadCash: (id: string) => void;
  onExpense: (id: string) => void;
  onCashMovement: (id: string) => void;
  onEdit: (shift: ShiftDto) => void;
  onClose: (shift: ShiftDto) => void;
  infiniteControls?: {
    fetchNextPage: () => void;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
  };
}

const ShiftRow = memo(function ShiftRow({
  shift,
  index,
  measureElement,
  canViewAmounts,
  canManageShift,
  canEditClosedShift,
  canClose,
  onLoadZ,
  onLoadCash,
  onExpense,
  onCashMovement,
  onEdit,
  onClose,
}: {
  shift: ShiftDto;
  index: number;
  measureElement: (el: HTMLElement | null) => void;
  canViewAmounts: boolean;
  canManageShift: boolean;
  canEditClosedShift: boolean;
  canClose: boolean;
  onLoadZ: (id: string) => void;
  onLoadCash: (id: string) => void;
  onExpense: (id: string) => void;
  onCashMovement: (id: string) => void;
  onEdit: (shift: ShiftDto) => void;
  onClose: (shift: ShiftDto) => void;
}) {
  const t = useTranslations("shifts");
  const isClosed = shift.status === "CLOSED";
  const diffNum =
    shift.difference != null && shift.difference !== "" ? Number(shift.difference) : null;
  const hasDiff = diffNum != null && !Number.isNaN(diffNum) && diffNum !== 0;

  return (
    <tr
      data-index={index}
      ref={measureElement}
      className="border-b transition-colors hover:/50 border-border dark:hover:/50"
    >
      <td className="px-3 py-2">
        {shift.status === "OPEN" ? (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            {t("table.badgeOpen")}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-accent text-muted-foreground">
            {t("table.badgeClosed")}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {shift.opened_at_terminal_name || t("page.dash")}
      </td>
      <td className="px-3 py-2 font-medium text-foreground">{formatDate(shift.opened_at)}</td>
      <td className="px-3 py-2 text-foreground">
        {shift.closed_at ? formatDate(shift.closed_at) : t("page.dash")}
      </td>
      <td className="px-3 py-2 text-right font-medium tabular-nums text-foreground">
        {formatAmount(Number(shift.expected_cash ?? 0), canViewAmounts)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-foreground">
        {isClosed && shift.actual_cash != null && shift.actual_cash !== ""
          ? formatAmount(Number(shift.actual_cash), canViewAmounts)
          : t("page.dash")}
      </td>
      <td
        className={`px-3 py-2 text-right tabular-nums ${hasDiff ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
      >
        {isClosed && diffNum != null && !Number.isNaN(diffNum)
          ? hasDiff
            ? canViewAmounts
              ? `${diffNum > 0 ? "+" : "−"}${formatCurrency(Math.abs(diffNum))} (${diffNum > 0 ? t("table.diffOver") : t("table.diffShort")})`
              : AMOUNT_DISPLAY_MASK
            : formatAmount(0, canViewAmounts)
          : t("page.dash")}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex flex-wrap justify-end gap-1">
          <button
            type="button"
            onClick={() => onLoadZ(shift.id)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium  transition-colors hover: border-input bg-muted text-foreground dark:hover:"
          >
            <FileBarChart size={14} /> {t("actions.zReport")}
          </button>
          <button
            type="button"
            onClick={() => onLoadCash(shift.id)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium  transition-colors hover: border-input bg-muted text-foreground dark:hover:"
          >
            <FileText size={14} className="text-indigo-600 dark:text-indigo-400" />{" "}
            {t("actions.cashReport")}
          </button>
          {shift.status === "OPEN" && canManageShift && (
            <>
              <button
                type="button"
                onClick={() => onExpense(shift.id)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium  transition-colors hover: border-input bg-muted text-foreground dark:hover:"
              >
                <PlusCircle size={14} /> {t("actions.expense")}
              </button>
              <button
                type="button"
                onClick={() => onCashMovement(shift.id)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium  transition-colors hover: border-input bg-muted text-foreground dark:hover:"
              >
                <ArrowUpCircle size={14} className="text-emerald-500" /> {t("actions.cashMovement")}
              </button>
            </>
          )}
          {shift.status === "CLOSED" && canEditClosedShift && (
            <button
              type="button"
              onClick={() => onEdit(shift)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium  transition-colors hover: border-input bg-muted text-foreground dark:hover:"
            >
              <Edit2 size={14} /> {t("actions.edit")}
            </button>
          )}
          {shift.status === "OPEN" && canClose && (
            <button
              type="button"
              onClick={() => onClose(shift)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium  transition-colors hover: border-input bg-destructive text-white text-foreground dark:hover:"
            >
              <Lock size={14} /> {t("actions.closeShift")}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

export const ShiftsTable = memo(function ShiftsTable({
  shifts,
  canViewAmounts,
  canManageShift,
  canEditClosedShift,
  canClose,
  onLoadZ,
  onLoadCash,
  onExpense,
  onCashMovement,
  onEdit,
  onClose,
  infiniteControls,
}: ShiftsTableProps) {
  const t = useTranslations("shifts");
  const containerRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: shifts.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 56,
    overscan: 8,
    getItemKey: (index) => shifts[index]?.id ?? index,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0;

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem || !infiniteControls) return;
    if (
      lastItem.index >= shifts.length - 1 &&
      infiniteControls.hasNextPage &&
      !infiniteControls.isFetchingNextPage
    ) {
      infiniteControls.fetchNextPage();
    }
  }, [virtualItems, shifts.length, infiniteControls]);

  useEffect(() => {
    if (!infiniteControls?.hasNextPage || infiniteControls.isFetchingNextPage) return;
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 80) {
      infiniteControls.fetchNextPage();
    }
  }, [shifts.length, infiniteControls]);

  return (
    <div ref={containerRef} className="max-h-[min(70vh,720px)] overflow-auto bg-card">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 border-b border-border border-border bg-muted">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold tracking-widertext-muted-foreground">
              {t("table.status")}
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold tracking-widertext-muted-foreground">
              {t("table.terminal")}
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold tracking-widertext-muted-foreground">
              {t("table.openedAt")}
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold tracking-widertext-muted-foreground">
              {t("table.closedAt")}
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold tracking-widertext-muted-foreground">
              {t("table.expectedCash")}
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold tracking-widertext-muted-foreground">
              {t("table.countedCash")}
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold tracking-widertext-muted-foreground">
              {t("table.difference")}
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold tracking-widertext-muted-foreground">
              {t("table.actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden>
              <td colSpan={8} style={{ height: paddingTop, padding: 0, border: 0 }} />
            </tr>
          )}
          {virtualItems.map((virtualRow) => {
            const shift = shifts[virtualRow.index];
            if (!shift) return null;
            return (
              <ShiftRow
                key={shift.id}
                shift={shift}
                index={virtualRow.index}
                measureElement={rowVirtualizer.measureElement}
                canViewAmounts={canViewAmounts}
                canManageShift={canManageShift}
                canEditClosedShift={canEditClosedShift}
                canClose={canClose}
                onLoadZ={onLoadZ}
                onLoadCash={onLoadCash}
                onExpense={onExpense}
                onCashMovement={onCashMovement}
                onEdit={onEdit}
                onClose={onClose}
              />
            );
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden>
              <td colSpan={8} style={{ height: paddingBottom, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
      {infiniteControls?.isFetchingNextPage && (
        <div className="flex items-center justify-center gap-2 border-t border-border py-2 text-xs text-muted-foreground border-border">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("table.loadingMore")}
        </div>
      )}
    </div>
  );
});
