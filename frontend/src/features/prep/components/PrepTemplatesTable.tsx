"use client";

import { CalendarClock, Edit, Loader2, MoreVertical, Trash2 } from "lucide-react";
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
import { formatNumber } from "@/lib/formatters";
import type { PrepTemplate } from "../types";

export interface PrepTemplatesTableProps {
  templates: PrepTemplate[];
  isLoading: boolean;
  fetchMore: () => void;
  hasMore: boolean;
  isFetchingNextPage: boolean;
  onEdit: (template: PrepTemplate) => void;
  onDelete: (templateId: string) => void;
  onCreateFirst: () => void;
}

export function PrepTemplatesTable({
  templates,
  isLoading,
  fetchMore,
  hasMore,
  isFetchingNextPage,
  onEdit,
  onDelete,
  onCreateFirst,
}: PrepTemplatesTableProps) {
  const t = useTranslations("prep");

  return (
    <VirtualTable
      rows={templates}
      rowHeight={56}
      overscan={8}
      fetchMore={fetchMore}
      hasMore={hasMore}
      isFetchingNextPage={isFetchingNextPage}
      className="min-h-0 flex-1 bg-card"
      tableClassName="w-full text-sm"
      header={
        <thead className={virtualTableStickyHeadClass}>
          <tr className="text-xs font-bold">
            <th className="px-4 py-2 text-left font-bold">
              {t("management.columns.templates.nameSchedule")}
            </th>
            <th className="px-4 py-2 text-left font-bold w-[160px]">
              {t("management.columns.templates.station")}
            </th>
            <th className="px-4 py-2 text-right font-bold">
              {t("management.columns.templates.target")}
            </th>
            <th className="px-4 py-2 text-right font-bold w-[80px]">
              {t("management.columns.templates.actions")}
            </th>
          </tr>
        </thead>
      }
      emptyState={
        isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <CalendarClock size={48} className="opacity-10 mb-4" />
            <p className="text-sm font-medium">{t("management.emptyTemplates")}</p>
            <Button
              variant="link"
              size="sm"
              className="mt-2 text-blue-600"
              onClick={onCreateFirst}
            >
              {t("management.createFirstTemplate")}
            </Button>
          </div>
        )
      }
      loadingMore={
        <tr>
          <td colSpan={4} className="text-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600 mx-auto" />
          </td>
        </tr>
      }
      renderRow={(template) => (
        <>
          <td className="px-4 py-3 align-middle">
            <h4 className="text-sm font-bold dark:text-white leading-none">
              {template.title}
            </h4>
            <p className="text-2xs font-medium text-muted-foreground mt-1">
              {t("management.dailyAtTime", { time: template.activation_time })}
            </p>
          </td>
          <td className="px-4 py-3 align-middle">
            <span className="text-sub font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
              {template.station_name || t("management.defaultStation")}
            </span>
          </td>
          <td className="px-4 py-3 text-right align-middle">
            <span className="text-xs font-bold text-foreground">
              {formatNumber(template.target_quantity, 0)}
            </span>
            <span className="text-2xs font-bold text-muted-foreground ml-1">
              {template.unit}
            </span>
            <div
              className={cn(
                "inline-block w-1.5 h-1.5 rounded-full ml-2",
                template.is_enabled ? "bg-emerald-500" : "",
              )}
            />
          </td>
          <td className="px-4 py-3 text-right align-middle">
            <DropdownMenu>
              <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover: transition-colors outline-none">
                <MoreVertical size={14} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(template)}>
                  <Edit className="mr-2 h-4 w-4" />
                  {t("management.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(template.id)}
                  className="text-rose-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("management.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </td>
        </>
      )}
    />
  );
}
