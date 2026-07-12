"use client";

import { useTranslations } from "next-intl";
import { Loader2, Utensils } from "lucide-react";
import { OrderCard } from "./OrderCard";
import type {
  GroupedOrder,
  Order,
  KdsItemHistoryEntry,
  KdsPeerPendingLine,
} from "../types";
import { useKdsClock } from "../hooks/useKdsClock";

interface OrderGridProps {
  isLoading: boolean;
  orders: Order[];
  groupedOrders: GroupedOrder[];
  peerPendingLines: KdsPeerPendingLine[];
  itemHistory: Record<string, KdsItemHistoryEntry>;
  onUpdateStatus: (itemId: string, newStatus: string) => void;
  /** Smart Firing v2 overflow (şimdi zamanla / ertele): `orders.manage_smart_firing` veya tam sipariş yönetimi */
  canUseSmartFiringActions?: boolean;
}

/**
 * Ekran zamanı `nowMs` ortak KDS saatinden gelir — render içinde `Date.now()` yok (React derleyicisi
 * / purity kuralı). İptal yığını varken 5 sn'lik grace period uygulanır.
 */
export function OrderGrid({
  isLoading,
  orders,
  groupedOrders,
  peerPendingLines,
  itemHistory,
  onUpdateStatus,
  canUseSmartFiringActions = false,
}: OrderGridProps) {
  const t = useTranslations("kds");
  const nowMs = useKdsClock();

  const visibleGroups = groupedOrders.filter((group) => {
    if (!group.all_cancelled) return true;
    return nowMs - group.max_updated_at_ts < 15_000;
  });

  if (isLoading && orders.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-zinc-100 dark:bg-zinc-950 transition-colors duration-300">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
        <span className="font-ui-medium italic text-zinc-600">{t('fetching')}</span>
      </div>
    );
  }

  return (
    <main className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden bg-zinc-100 dark:bg-zinc-950 p-2 scrollbar-thin transition-colors duration-300">
      {visibleGroups.length === 0 ? (
        <div className="flex h-full min-h-[40vh] w-full flex-col items-center justify-center text-zinc-500">
          <Utensils size={64} className="mb-6 text-zinc-400" />
          <h2 className="text-2xl font-ui-bold">{t('empty')}</h2>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-row items-stretch gap-2">
          {visibleGroups.map((group) => (
            <div key={group.order_id} className="min-w-[280px] max-w-[360px] flex-1 self-stretch min-h-0">
              <OrderCard
                group={group}
                peerPendingLines={peerPendingLines}
                itemHistory={itemHistory}
                onUpdateStatus={onUpdateStatus}
                nowMs={nowMs}
                canUseSmartFiringActions={canUseSmartFiringActions}
              />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
