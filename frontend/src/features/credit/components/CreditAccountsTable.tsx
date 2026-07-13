"use client";

import React, { memo, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Eye, Loader2, Pencil, Trash2 } from "lucide-react";
import { formatAmount } from "@/lib/formatters";
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts";
import type { CreditAccount } from "../types";

interface CreditAccountsTableProps {
  accounts: CreditAccount[];
  canManage: boolean;
  onView: (account: CreditAccount) => void;
  onEdit: (account: CreditAccount) => void;
  onDelete: (account: CreditAccount) => void;
  infiniteControls?: {
    fetchNextPage: () => void;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
  };
}

const CreditAccountRow = memo(function CreditAccountRow({
  account,
  index,
  canManage,
  canViewAmounts,
  onView,
  onEdit,
  onDelete,
  measureElement,
  viewLabel,
}: {
  account: CreditAccount;
  index: number;
  canManage: boolean;
  canViewAmounts: boolean;
  onView: (account: CreditAccount) => void;
  onEdit: (account: CreditAccount) => void;
  onDelete: (account: CreditAccount) => void;
  measureElement: (el: HTMLElement | null) => void;
  viewLabel: string;
}) {
  return (
    <tr
      data-index={index}
      ref={measureElement}
      className="border-t border-border hover:/80 border-border dark:hover:/40"
    >
      <td className="px-4 py-3 font-semibold">{account.full_name}</td>
      <td className="px-4 py-3 text-muted-foreground">{account.user_username ?? "—"}</td>
      <td className="px-4 py-3 text-muted-foreground">
        {account.is_global ? "Global" : account.branch_name ?? "—"}
      </td>
      <td className="px-4 py-3 text-right font-bold tabular-nums">
        {formatAmount(account.balance, canViewAmounts)}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{account.credit_policy_display}</td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={() => onView(account)}
            className="rounded-md p-2 text-muted-foreground hover: dark:hover:"
            aria-label={viewLabel}
          >
            <Eye size={16} />
          </button>
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => onEdit(account)}
                className="rounded-md p-2 text-muted-foreground hover: dark:hover:"
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(account)}
                className="rounded-md p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
});

export const CreditAccountsTable = memo(function CreditAccountsTable({
  accounts,
  canManage,
  onView,
  onEdit,
  onDelete,
  infiniteControls,
}: CreditAccountsTableProps) {
  const t = useTranslations("credit");
  const canViewAmounts = useCanViewAmounts();
  const containerRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: accounts.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 52,
    overscan: 8,
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
      lastItem.index >= accounts.length - 1 &&
      infiniteControls.hasNextPage &&
      !infiniteControls.isFetchingNextPage
    ) {
      infiniteControls.fetchNextPage();
    }
  }, [virtualItems, accounts.length, infiniteControls]);

  return (
    <div
      ref={containerRef}
      className="max-h-[min(70vh,640px)] overflow-auto rounded-xl border border-border border-border bg-card"
    >
      <table className="w-full min-w-[720px] text-sm">
        <thead className="sticky top-0 z-10 text-left text-xs font-bold uppercase text-muted-foreground bg-muted/95">
          <tr>
            <th className="px-4 py-3">{t("table.name")}</th>
            <th className="px-4 py-3">{t("table.user")}</th>
            <th className="px-4 py-3">{t("table.branch")}</th>
            <th className="px-4 py-3 text-right">{t("table.balance")}</th>
            <th className="px-4 py-3">{t("table.policy")}</th>
            <th className="px-4 py-3 text-right">{t("table.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden>
              <td colSpan={6} style={{ height: paddingTop, padding: 0, border: 0 }} />
            </tr>
          )}
          {virtualItems.map((virtualRow) => {
            const account = accounts[virtualRow.index];
            if (!account) return null;
            return (
              <CreditAccountRow
                key={account.id}
                account={account}
                index={virtualRow.index}
                canManage={canManage}
                canViewAmounts={canViewAmounts}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
                measureElement={rowVirtualizer.measureElement}
                viewLabel={t("detail.title")}
              />
            );
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden>
              <td colSpan={6} style={{ height: paddingBottom, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
      {infiniteControls?.isFetchingNextPage && (
        <div className="flex items-center justify-center gap-2 border-t border-border py-3 text-xs text-muted-foreground border-border">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("page.loadingMore")}
        </div>
      )}
    </div>
  );
});
