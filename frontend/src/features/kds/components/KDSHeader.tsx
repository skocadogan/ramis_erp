"use client";

import { useMemo } from "react";
import { Building2, Home, Menu, Clock as ClockIcon, Monitor, Volume2, VolumeOff } from "lucide-react";
import Link from "next/link";
import { type KitchenStation } from "@/features/admin/services/adminApi";
import { type AuthUser } from "@/types/user.types";
import { BackendHealthIndicator } from "@/components/shell/BackendHealthProvider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ThemeMenu } from "@/components/shell/ThemeMenu";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useKdsClock } from "../hooks/useKdsClock";

function KdsHeaderClock() {
  const nowMs = useKdsClock();
  const label = useMemo(
    () => new Date(nowMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    [nowMs]
  );

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-4 py-2 text-sm font-bold tabular-nums text-foreground shadow-inner">
      <ClockIcon size={16} className="text-primary" />
      <span>{label}</span>
    </div>
  );
}

interface KDSHeaderProps {
  user: AuthUser | null;
  branches: { id: string; name: string }[];
  stations: KitchenStation[];
  activeStation: KitchenStation;
  selectedBranchId: string;
  canAccessPos: boolean;
  onShowSelector: () => void;
  onBranchChange: (id: string) => void;
  onSelectStation: (s: KitchenStation) => void;
  canChangeStation?: boolean;
  isTotalsCollapsed?: boolean;
  onToggleTotals?: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
}

export function KDSHeader({
  user,
  branches,
  stations,
  activeStation,
  selectedBranchId,
  onShowSelector,
  onBranchChange,
  onSelectStation,
  canChangeStation = true,
  isTotalsCollapsed = false,
  onToggleTotals,
  soundEnabled,
  onToggleSound,
}: KDSHeaderProps) {
  const t = useTranslations("kds");

  const soundToggle = (
    <button
      onClick={onToggleSound}
      className="flex size-11 items-center justify-center rounded-xl border border-border bg-muted/50 text-muted-foreground shadow-sm transition-colors duration-200 hover:bg-muted hover:text-foreground"
      title={t(soundEnabled ? "settings.soundOn" : "settings.soundOff")}
    >
      {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeOff className="h-5 w-5 text-muted-foreground/50" />}
    </button>
  );

  const branchSelector = (
    ((user?.available_branches?.length || 0) > 1 || user?.is_superuser) && (
      (() => {
        const branchList = user?.is_superuser ? branches : (user?.available_branches || []);
        const selId = selectedBranchId || user?.branch_id || "";
        const selName = branchList.find(b => b.id === selId)?.name || "\u015Eube Se\u00E7in";
        return (
      <Select
        value={selId}
        onValueChange={(val) => {
          if (val) {
            onBranchChange(val);
            if (canChangeStation) onShowSelector();
          }
        }}
      >
          <SelectTrigger className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-1.5 shadow-sm">
          <Building2 size={16} className="text-primary" />
          <span className="truncate text-sm">{selName}</span>
        </SelectTrigger>
        <SelectContent>
          {branchList.map(b => (
            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
        );
      })()
    )
  );

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-4 text-foreground z-40 transition-colors duration-300">
      <div className="flex items-center gap-6">
        {onToggleTotals && (
          <button
            onClick={onToggleTotals}
            className={cn(
              "flex size-11 items-center justify-center rounded-xl transition-colors duration-200",
              "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border shadow-sm",
              !isTotalsCollapsed && "bg-muted text-foreground"
            )}
            aria-label="Toggle Totals"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        <div className="flex items-center gap-4">
          <KdsHeaderClock />
          <div className="h-6 w-px bg-border" />
          <div className="flex flex-col gap-0.5">
            <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">
              {t("header.currentStation")}
            </span>
            <div className="flex items-center gap-2">
              {canChangeStation && stations.length > 1 ? (
                <Select
                  value={activeStation.id}
                  onValueChange={(val) => {
                    const found = stations.find((s) => s.id === val);
                    if (found) onSelectStation(found);
                  }}
                >
                  <SelectTrigger className="h-auto p-0 border-none bg-transparent text-sm font-bold text-foreground shadow-none hover:opacity-80 transition-opacity">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{activeStation.name}</span>
                      <div
                        className="h-1.5 w-1.5 rounded-full shadow-[0_0_8px_currentColor]"
                        style={{ backgroundColor: activeStation.color, color: activeStation.color }}
                      />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="min-w-[220px] border-border bg-card text-foreground shadow-sm">
                    {stations.map((s) => (
                      <SelectItem
                        key={s.id}
                        value={s.id}
                        className="cursor-pointer py-3 transition-colors focus:bg-muted"
                      >
                        <div className="flex items-center gap-3 w-full">
                          <div
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: s.color }}
                          />
                          <span className="font-semibold text-sm">
                            {s.name}
                          </span>
                          {s.pending_orders_count > 0 && (
                            <span className="ml-auto rounded-full bg-kds-warning/20 px-2 py-0.5 text-2xs font-bold text-kds-warning border border-kds-warning/20">
                              {s.pending_orders_count}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">
                    {activeStation.name}
                  </span>
                  <div
                    className="h-1.5 w-1.5 rounded-full shadow-[0_0_8px_currentColor]"
                    style={{ backgroundColor: activeStation.color, color: activeStation.color }}
                  />
                </div>
              )}

              {/* İstasyon Hazırlık Ekranı butonu — branch_id parametresi ile aç */}
              <button
                onClick={() => {
                  const params = new URLSearchParams();
                  if (activeStation.branch) params.set("branch_id", activeStation.branch);
                  params.set("station_name", activeStation.name);
                  params.set("station_color", activeStation.color);
                  if (activeStation.branch_name) params.set("branch_name", activeStation.branch_name);
                  const qs = params.toString();
                  window.open(`/kds/station-display/${activeStation.id}${qs ? `?${qs}` : ""}`, "_blank");
                }}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-200",
                  "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground border border-border shadow-sm"
                )}
                title={t("header.stationDisplay")}
                aria-label={t("header.stationDisplay")}
              >
                <Monitor className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {branchSelector}
        <div className="h-8 w-px bg-border" />

        <div className="flex items-center gap-2.5 px-2">
          <Link
            href="/panel"
            className="flex size-11 items-center shadow-sm justify-center rounded-xl border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-200"
            title={t("header.home")}
          >
            <Home className="h-5 w-5" />
          </Link>
          <ThemeMenu className="size-11 shadow-sm rounded-xl border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground" />

          {soundToggle}

          <BackendHealthIndicator className="size-11 shadow-sm rounded-xl border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-200" />


        </div>
      </div>
    </header>
  );
}
