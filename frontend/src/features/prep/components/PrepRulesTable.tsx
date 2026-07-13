"use client";

import { BrainCircuit, Edit, Loader2, MoreVertical, Settings2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PrepSmartRule } from "../types";

type RuleDiscoveryItem = {
  product_id: string;
  product_name: string;
  total_sold_30d: number;
  reason: string;
};

export interface PrepRulesTableProps {
  rules: PrepSmartRule[];
  discovery: RuleDiscoveryItem[] | undefined;
  isLoading: boolean;
  fetchMore: () => void;
  hasMore: boolean;
  isFetchingNextPage: boolean;
  onEdit: (rule: PrepSmartRule) => void;
  onDelete: (ruleId: string) => void;
  onCreateManual: () => void;
  onDiscoveryAdd: (disc: RuleDiscoveryItem) => void;
}

export function PrepRulesTable({
  rules,
  discovery,
  isLoading,
  fetchMore,
  hasMore,
  isFetchingNextPage,
  onEdit,
  onDelete,
  onCreateManual,
  onDiscoveryAdd,
}: PrepRulesTableProps) {
  const t = useTranslations("prep");
  const discoveryList = discovery ?? [];
  const hasDiscovery = discoveryList.length > 0;
  const showEmpty = !isLoading && rules.length === 0 && !hasDiscovery;

  if (showEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground flex-1">
        <Settings2 size={48} className="opacity-10 mb-4" />
        <p className="text-sm font-medium">{t("management.emptyRulesAndDiscovery")}</p>
        <Button variant="link" size="sm" className="mt-2 text-purple-600" onClick={onCreateManual}>
          {t("management.createManualRule")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {rules.length > 0 && (
        <div className="bg-slate-50/50 bg-muted/50 p-2 border-b border-slate-100 border-border shrink-0">
          <h5 className="text-2xs font-bold uppercase text-muted-foreground px-2">
            {t("management.rulesSectionTitle", { count: rules.length })}
          </h5>
        </div>
      )}

      <VirtualTable
        rows={rules}
        rowHeight={56}
        overscan={8}
        fetchMore={fetchMore}
        hasMore={hasMore}
        isFetchingNextPage={isFetchingNextPage}
        className="min-h-0 flex-1 bg-card"
        tableClassName="w-full text-sm"
        header={
          rules.length > 0 ? (
            <thead className={virtualTableStickyHeadClass}>
              <tr className="text-xs font-bold text-slate-500">
                <th className="px-4 py-2 text-left font-bold">
                  {t("management.columns.rules.nameMatch")}
                </th>
                <th className="px-4 py-2 text-left font-bold">
                  {t("management.columns.rules.ratio")}
                </th>
                <th className="px-4 py-2 text-right font-bold">
                  {t("management.columns.rules.status")}
                </th>
                <th className="px-4 py-2 text-right font-bold w-[80px]">
                  {t("management.columns.rules.actions")}
                </th>
              </tr>
            </thead>
          ) : undefined
        }
        emptyState={
          isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-purple-500" />
            </div>
          ) : null
        }
        loadingMore={
          <tr>
            <td colSpan={4} className="text-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-purple-600 mx-auto" />
            </td>
          </tr>
        }
        renderRow={(rule) => (
          <>
            <td className="px-4 py-3 align-middle">
              <h4 className="text-sm font-bold text-slate-800 dark:text-white leading-none">
                {rule.title}
              </h4>
              <p className="text-2xs font-medium text-muted-foreground uppercase tracking-tighter mt-1">
                {rule.base_product_name} → {rule.target_item}
              </p>
            </td>
            <td className="px-4 py-3 align-middle">
              <span className="text-xs font-bold text-foreground">{rule.ratio}</span>
              <span className="text-2xs font-bold text-muted-foreground ml-1">{rule.unit}</span>
            </td>
            <td className="px-4 py-3 text-right align-middle">
              <div
                className={cn(
                  "px-2 py-0.5 rounded-full inline-flex items-center gap-1.5",
                  rule.is_active
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                    : "bg-slate-50 text-muted-foreground bg-muted/50 dark:text-muted-foreground",
                )}
              >
                <div
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    rule.is_active ? "bg-emerald-500" : "bg-slate-300 bg-accent",
                  )}
                />
                <span className="text-2xs font-bold">
                  {rule.is_active
                    ? t("management.ruleState.active")
                    : t("management.ruleState.inactive")}
                </span>
              </div>
            </td>
            <td className="px-4 py-3 text-right align-middle">
              <DropdownMenu>
                <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-slate-100 transition-colors outline-none">
                  <MoreVertical size={14} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(rule)}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t("management.edit")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDelete(rule.id)} className="text-rose-600">
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("management.delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </td>
          </>
        )}
      />

      {hasDiscovery && (
        <div className="shrink-0 border-t border-purple-100 dark:border-purple-900/30 overflow-auto max-h-[40%]">
          <div className="bg-purple-50/50 dark:bg-purple-900/10 p-2 border-b border-purple-100 dark:border-purple-900/30 flex items-center gap-2 sticky top-0">
            <BrainCircuit size={14} className="text-purple-500" />
            <h5 className="text-2xs font-bold uppercase text-purple-700 dark:text-purple-400">
              {t("management.systemSuggestedRules", { count: discoveryList.length })}
            </h5>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {discoveryList.map((disc) => (
                <tr
                  key={disc.product_id}
                  className="hover:bg-purple-50/30 dark:hover:bg-purple-900/10 transition-colors"
                >
                  <td className="px-4 py-3 align-middle w-[42%]">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-white">
                      {t("management.prepForProduct", { product: disc.product_name })}
                    </h4>
                    <p className="text-2xs font-medium text-purple-500 uppercase tracking-tighter mt-1">
                      {t("management.soldIn30Days", { count: disc.total_sold_30d })}
                    </p>
                  </td>
                  <td className="px-4 py-3 align-middle text-muted-foreground text-2xs w-[42%]">
                    {t("management.discoveryCta", { reason: disc.reason })}
                  </td>
                  <td className="px-4 py-3 text-right align-middle w-[16%]">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-3xs font-bold uppercase border-purple-200 dark:border-purple-900/50 text-purple-600 dark:text-purple-400"
                      onClick={() => onDiscoveryAdd(disc)}
                    >
                      {t("management.addRule")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
