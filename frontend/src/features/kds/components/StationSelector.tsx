"use client";

import { Building2, ChefHat, ChevronRight, Home, LayoutGrid, Loader2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type KitchenStation } from "@/features/admin/services/adminApi";
import { type AuthUser } from "@/types/user.types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

interface StationSelectorProps {
  user: AuthUser | null;
  stations: KitchenStation[];
  branches: { id: string; name: string }[];
  selectedBranchId: string;
  isStationLoading: boolean;
  canAccessPos: boolean;
  onBranchChange: (id: string) => void;
  onSelectStation: (s: KitchenStation) => void;
}

export function StationSelector({
  user,
  stations,
  branches,
  selectedBranchId,
  isStationLoading,
  canAccessPos,
  onBranchChange,
  onSelectStation
}: StationSelectorProps) {
  const t = useTranslations("kds");

  if (isStationLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-2xl bg-card border border-border rounded-3xl p-10 shadow-lg">
        <div className="text-center mb-10">
          <div className="h-20 w-20 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm shadow-primary/30">
            <ChefHat size={40} className="text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-ui-bold text-foreground mb-3">{t('selector.title')}</h1>
          <p className="text-muted-foreground">{t('selector.description')}</p>
        </div>

        {((user?.available_branches?.length || 0) > 1 || user?.is_superuser) && (
          <div className="mb-8 flex items-center gap-3 bg-muted/40 border border-border p-4 rounded-2xl">
            <Building2 size={24} className="text-primary" />
            <div className="flex-1">
              <label className="block text-2xs font-ui-bold text-muted-foreground uppercase tracking-widest mb-1 ml-1">{t('selector.changeBranch')}</label>
              <Select
                value={selectedBranchId || "none"}
                onValueChange={(val) => {
                  if (!val || val === "none") {
                    onBranchChange("");
                  } else {
                    onBranchChange(val);
                  }
                }}
              >
                <SelectTrigger className="w-full bg-muted border-none text-foreground font-ui-bold h-14 rounded-2xl focus:ring-2 focus:ring-primary/50 px-6 text-lg">
                  <div className="flex items-center gap-2">
                    <span className="truncate">
                      {selectedBranchId
                        ? branches.find((b) => b.id === selectedBranchId)?.name ||
                          user?.available_branches?.find(
                            (b) => b.id === selectedBranchId
                          )?.name ||
                          t('selector.selectBranch')
                        : t('selector.allBranches')}
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-popover border-border text-popover-foreground min-w-[300px] shadow-lg">
                  {user?.is_superuser && (
                    <SelectItem
                      value="none"
                      className="py-5 px-6 focus:bg-primary focus:text-primary-foreground transition-colors border-b border-border last:border-0"
                    >
                      <span className="font-ui-bold opacity-40 italic text-base uppercase tracking-widest">
                        {t('selector.allBranches')}
                      </span>
                    </SelectItem>
                  )}
                  {user?.is_superuser ? (
                    branches?.map((b) => (
                      <SelectItem
                        key={b.id}
                        value={b.id}
                        className="py-5 px-6 focus:bg-primary focus:text-primary-foreground transition-colors border-b border-border last:border-0"
                      >
                        <span className="font-ui-bold text-base uppercase tracking-wider">
                          {b.name}
                        </span>
                      </SelectItem>
                    ))
                  ) : (
                    user?.available_branches?.map((b) => (
                      <SelectItem
                        key={b.id}
                        value={b.id}
                        className="py-5 px-6 focus:bg-primary focus:text-primary-foreground transition-colors border-b border-border last:border-0"
                      >
                        <span className="font-ui-bold text-base uppercase tracking-wider">
                          {b.name}
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stations.length === 0 ? (
            <div className="col-span-2 py-10 text-center border-2 border-dashed border-border rounded-2xl">
              <LayoutGrid size={32} className="mx-auto text-muted mb-2" />
              <p className="text-muted-foreground">{t('selector.noStations')}</p>
              <Link href="/panel?tab=stations" className="text-primary text-sm font-ui-bold mt-2 inline-block hover:underline">
                {t('selector.addFromAdmin')}
              </Link>
            </div>
          ) : (
            stations.map((s: KitchenStation) => (
              <button
                key={s.id}
                onClick={() => onSelectStation(s)}
                className="group relative flex items-center p-5 bg-muted border-2 border-transparent rounded-2xl hover:border-primary hover:bg-muted/80 transition-[colors,background-color,border-color] text-left overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-1.5 h-full" style={{ backgroundColor: s.color }} />
                <div className="h-12 w-12 rounded-xl flex items-center justify-center mr-4" style={{ backgroundColor: `${s.color}20`, color: s.color }}>
                  <ChefHat size={24} />
                </div>
                <div className="flex-1">
                  <div className="font-ui-bold text-foreground group-hover:text-primary transition-colors uppercase tracking-wider">{s.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="text-2xs text-muted-foreground font-ui-bold uppercase tracking-tighter">{s.branch_name}</div>
                    <div className="h-1 w-1 rounded-full bg-border" />
                    <div className={`text-2xs font-ui-bold uppercase tracking-widest ${s.pending_orders_count > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                      {t('selector.pendingCount', { count: s.pending_orders_count })}
                    </div>
                  </div>
                </div>
                <ChevronRight size={20} className="text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))
          )}
        </div>

        <div className="mt-10 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8">
          <Link
            href="/panel?tab=overview"
            className="inline-flex items-center gap-2 text-sm font-ui-bold text-primary hover:opacity-80 transition-opacity"
          >
            <Home size={18} />
            {t('header.overview')}
          </Link>
          {canAccessPos && (
            <Link href="/pos" className="text-sm font-ui-bold text-muted-foreground hover:text-foreground transition-colors">
              {t('selector.backToPos')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
