"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Flame,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ClipboardCheck,
  Utensils,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { KdsKitchenStockDrawer } from "./KdsKitchenStockDrawer";
import { KdsDeficiencyStatusDrawer } from "./KdsDeficiencyStatusDrawer";
import { KdsRecipeDrawer } from "./KdsRecipeDrawer";
import { KdsPrepDrawer } from "./KdsPrepDrawer";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Pulses briefly when a numeric value increases. */
function usePulseOnChange(value: number) {
  const [pulse, setPulse] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (value > 0 && value > prev.current) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 2200);
      prev.current = value;
      return () => clearTimeout(timer);
    }
    prev.current = value;
  }, [value]);

  return pulse;
}

interface KDSSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeStationId: string;
  branchId: string;
  onShowWaste: () => void;
  onShowDeficiency: () => void;
  onDeficiencyPrefill: (items: { stock_item_id: string; quantity: number; unit: string }[]) => void;
  canAddWaste?: boolean;
  canViewWarehouse?: boolean;
  canManageDeficiency?: boolean;
  canViewHistory?: boolean;
  onShowProductionStatus: () => void;
  onShowDailyMrp: () => void;
  recallOpen?: boolean;
  recallItemCount?: number;
  onToggleRecall?: () => void;
}

/** KDS hızlı aksiyonları — ekranın altında yatay araç çubuğu. */
export function KDSSidebar({
  collapsed,
  onToggle,
  activeStationId,
  branchId,
  onShowWaste,
  onShowDeficiency,
  onDeficiencyPrefill,
  canAddWaste = true,
  canViewWarehouse = true,
  canManageDeficiency = true,
  canViewHistory = true,
  onShowProductionStatus,
  onShowDailyMrp,
  recallOpen = false,
  recallItemCount = 0,
  onToggleRecall,
}: KDSSidebarProps) {
  const t = useTranslations("kds");
  const tRecall = useTranslations("kds.recall");

  const renderItem = (
    icon: ReactNode,
    label: string,
    onClick?: () => void,
    component?: ReactNode,
    variant: "default" | "warning" | "danger" | "info" = "default"
  ) => {
    const baseClasses = cn(
      "flex shrink-0 items-center rounded-xl transition-[colors,transform] duration-200 outline-none",
      collapsed ? "size-11 justify-center p-0" : "h-11 gap-2 px-3",
      variant === "default" && "text-muted-foreground hover:bg-muted hover:text-foreground",
      variant === "warning" &&
      "text-amber-600 hover:bg-amber-500/10 dark:text-amber-400",
      variant === "danger" && "text-destructive hover:bg-destructive/10",
      variant === "info" && "text-sky-600 hover:bg-sky-500/10 dark:text-sky-400"
    );

    if (collapsed && !component) {
      const trigger = (
        <button type="button" onClick={onClick} className={baseClasses}>
          <span className="flex shrink-0">{icon}</span>
        </button>
      );
      return (
        <Tooltip>
          <TooltipTrigger render={trigger} />
          <TooltipContent
            side="top"
            sideOffset={8}
            className="border-border bg-popover font-ui-semibold text-popover-foreground text-xs"
          >
            {label}
          </TooltipContent>
        </Tooltip>
      );
    }

    const inner = component ? (
      component
    ) : (
      <button type="button" onClick={onClick} className={baseClasses}>
        <span className="flex shrink-0">{icon}</span>
        {!collapsed ? (
          <span className="max-w-[11rem] truncate text-xs font-ui-semibold sm:text-sm">{label}</span>
        ) : null}
      </button>
    );

    return <span className="contents">{inner}</span>;
  };

  const recallPulse = usePulseOnChange(recallItemCount);

  return (
    <TooltipProvider delay={0}>
      <nav
        className="flex shrink-0 items-center gap-1 border-t border-border bg-background px-2 py-2 z-20"
        aria-label={t("sidebar.kitchenDisplay")}
      >
        <div className="flex shrink-0 items-center gap-3 border-r border-border/60 pr-4 ml-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Utensils size={18} />
          </div>
          <h1 className="truncate text-base font-ui-bold tracking-tight text-foreground sm:text-lg">
            RAMIS KDS
          </h1>
        </div>

        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden py-0.5 scrollbar-thin">
          {canAddWaste &&
            renderItem(<Flame size={28} />, t("sidebar.waste"), onShowWaste, undefined, "danger")}

          {canViewWarehouse ? (
            <KdsKitchenStockDrawer
              stationId={activeStationId}
              onAddToDeficiency={onDeficiencyPrefill}
              collapsed={collapsed}
            />
          ) : null}

          <KdsRecipeDrawer collapsed={collapsed} />

          <KdsPrepDrawer
            activeStationId={activeStationId}
            branchId={branchId}
            collapsed={collapsed}
          />

          {canViewHistory ? (
            <KdsDeficiencyStatusDrawer activeStationId={activeStationId} collapsed={collapsed} />
          ) : null}

          {renderItem(
            <ClipboardList size={28} />,
            t("sidebar.productionStatus"),
            onShowProductionStatus,
            undefined,
            "info"
          )}

          {renderItem(
            <ClipboardCheck size={28} />,
            t("sidebar.dailyMrp"),
            onShowDailyMrp,
            undefined,
            "default"
          )}

          
          {canManageDeficiency &&
            renderItem(
              <AlertCircle size={28} />,
              t("sidebar.deficiencyList"),
              onShowDeficiency,
              undefined,
              "warning"
            )}


           {onToggleRecall
            ? renderItem(
                <span className="relative flex shrink-0">
                  <RotateCcw size={28} />
                  {recallItemCount > 0 ? (
                    <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-amber-500 px-1 py-0.5 text-center text-[9px] font-ui-black tabular-nums text-white">
                      {recallPulse && (
                        <span className="absolute inset-0 rounded-full bg-amber-500 animate-ping" />
                      )}
                      <span className="relative z-10">{recallItemCount}</span>
                    </span>
                  ) : null}
                </span>,
                tRecall("toggle"),
                onToggleRecall,
                undefined,
                recallOpen ? "warning" : "default",
              )
            : null}


            
        </div>

        <div className="flex shrink-0 items-center border-l border-border/60 pl-2">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={onToggle}
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-expanded={false}
                  >
                    <ChevronRight size={28} />
                  </button>
                }
              />
              <TooltipContent
                side="top"
                sideOffset={8}
                className="border-border bg-popover font-ui-semibold text-popover-foreground text-xs"
              >
                {t("sidebar.expand")}
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={onToggle}
              className="flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-expanded={true}
            >
              <ChevronLeft size={28} />
              <span className="hidden max-w-[5rem] truncate text-xs font-ui-semibold sm:inline">
                {t("sidebar.collapse")}
              </span>
            </button>
          )}
        </div>
      </nav>
    </TooltipProvider>
  );
}
