"use client";

import { BrainCircuit, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/formatters";
import type { SmartSuggestion } from "../types";

export interface PrepSuggestionsTableProps {
  suggestions: SmartSuggestion[];
  isLoading: boolean;
  fetchMore: () => void;
  hasMore: boolean;
  isFetchingNextPage: boolean;
  onCreateTask: (suggestion: SmartSuggestion) => void;
}

export function PrepSuggestionsTable({
  suggestions,
  isLoading,
  fetchMore,
  hasMore,
  isFetchingNextPage,
  onCreateTask,
}: PrepSuggestionsTableProps) {
  const t = useTranslations("prep");

  return (
    <VirtualTable
      rows={suggestions}
      rowHeight={56}
      overscan={8}
      fetchMore={fetchMore}
      hasMore={hasMore}
      isFetchingNextPage={isFetchingNextPage}
      className="min-h-0 flex-1 bg-card"
      tableClassName="w-full text-sm"
      header={
        <thead className={virtualTableStickyHeadClass}>
          <tr className="text-xs font-ui-bold text-slate-500">
            <th className="px-4 py-2 text-left font-ui-bold">
              {t("management.columns.suggestions.materialBase")}
            </th>
            <th className="px-4 py-2 text-left font-ui-bold">
              {t("management.columns.suggestions.salesAnalysis")}
            </th>
            <th className="px-4 py-2 text-right font-ui-bold">
              {t("management.columns.suggestions.suggestion")}
            </th>
            <th className="px-4 py-2 text-right font-ui-bold w-[100px]">
              {t("management.columns.suggestions.action")}
            </th>
          </tr>
        </thead>
      }
      emptyState={
        isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-purple-500" />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <BrainCircuit size={48} className="opacity-10 mb-4" />
            <p className="text-sm font-ui-medium">{t("management.emptySuggestions")}</p>
            <p className="text-xs mt-1">{t("management.emptySuggestionsHint")}</p>
          </div>
        )
      }
      loadingMore={
        <tr>
          <td colSpan={4} className="text-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-purple-600 mx-auto" />
          </td>
        </tr>
      }
      renderRow={(sug) => (
        <>
          <td className="px-4 py-3 align-middle">
            <h4 className="text-sm font-ui-bold text-slate-800 dark:text-white leading-none">
              {sug.target_item}
            </h4>
            <p className="text-2xs font-ui-medium text-muted-foreground uppercase tracking-tighter mt-1">
              {t("management.salesBasedOn", { product: sug.base_product_name })}
            </p>
          </td>
          <td className="px-4 py-3 align-middle">
            <span className="text-2xs font-ui-bold text-purple-600 dark:text-purple-400 uppercase bg-purple-50 dark:bg-purple-900/30 px-2 py-0.5 rounded-full">
              {t("management.avgSales", { avg: sug.avg_sales })}
            </span>
          </td>
          <td className="px-4 py-3 text-right align-middle">
            <span className="text-xs font-ui-bold text-foreground">
              {formatNumber(sug.suggested_quantity, 0)}
            </span>
            <span className="text-2xs font-ui-bold text-muted-foreground ml-1">{sug.unit}</span>
          </td>
          <td className="px-4 py-3 text-right align-middle">
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-purple-200 dark:border-purple-900/50 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 font-ui-bold text-[11px]"
              onClick={() => onCreateTask(sug)}
            >
              {t("management.start")}
            </Button>
          </td>
        </>
      )}
    />
  );
}
