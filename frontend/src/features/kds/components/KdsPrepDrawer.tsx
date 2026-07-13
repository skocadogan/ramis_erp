"use client";

import { useState } from "react";
import { ListChecks, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PrepListDrawer } from "@/features/prep/components/PrepListDrawer";

interface Props {
  activeStationId: string;
  branchId: string;
  collapsed?: boolean;
}

export function KdsPrepDrawer({
  activeStationId,
  branchId,
  collapsed = false,
}: Props) {
  const t = useTranslations("kds");
  const tPrep = useTranslations("prep");
  const [isOpen, setIsOpen] = useState(false);

  const buttonContent = (
    <button
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      className={cn(
        "flex shrink-0 items-center rounded-xl transition-colors",
        isOpen ? "bg-primary text-primary-foreground" : "text-primary hover:bg-primary/10",
        collapsed ? "size-11 justify-center p-0" : "h-11 gap-2 px-3"
      )}
      title={tPrep('drawer.tooltip')}
    >
      <ListChecks size={28} className="shrink-0" />
      {!collapsed && (
        <span className="max-w-[10rem] truncate text-xs font-semibold sm:text-sm">{tPrep('drawer.sidebarLabel')}</span>
      )}
    </button>
  );

  return (
    <div className="relative shrink-0">
      {collapsed ? (
        <TooltipProvider delay={0}>
          <Tooltip>
            <TooltipTrigger render={buttonContent} />
            <TooltipContent side="top" sideOffset={8} className="bg-popover text-popover-foreground border-border font-semibold text-xs">
              {tPrep('drawer.sidebarLabel')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        buttonContent
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label={t('inventory.close')}
            onClick={() => setIsOpen(false)}
          />
          <aside
            className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-background"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted px-4 py-3">
              <div className="flex items-center gap-2">
                <ListChecks size={18} className="text-primary" />
                <h3 className="font-bold text-sm text-foreground">{tPrep('drawer.title')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t('inventory.close')}
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-hidden bg-background">
              <PrepListDrawer
                activeStationId={activeStationId}
                branchId={branchId}
              />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
