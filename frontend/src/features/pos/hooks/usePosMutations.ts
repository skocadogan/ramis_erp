"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { tablesApi } from "@/features/tables/services/tablesApi";
import { toast } from "sonner";
import type { Table } from "@/types/pos";
import type { TableReservePayload } from "@/features/tables/types/table.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TableAction =
  | "open"
  | "close"
  | "forceClose"
  | "reserve"
  | "cancelReservation"
  | "setOutOfService";

interface TableMutationVars {
  action: TableAction;
  tableId: string;
  payload?: TableReservePayload;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Aksiyona göre masanın alacağı yeni statü. */
function getNewStatus(action: TableAction): Table["status"] | null {
  switch (action) {
    case "open":
      return "OCCUPIED";
    case "close":
    case "forceClose":
      return "FREE";
    case "reserve":
      return "RESERVED";
    case "cancelReservation":
      return "FREE";
    case "setOutOfService":
      return "OUT_OF_SERVICE";
    default:
      return null;
  }
}

/**
 * PosQueries snapshot'ından ilk branch ID'yi çıkarır.
 * format: ["pos-tables", branchId, variant]
 */
function extractBranchId(queries: readonly unknown[]): string {
  if (queries.length > 0) {
    const firstKey = (queries[0] as readonly unknown[])[0];
    if (Array.isArray(firstKey) && firstKey.length > 1) {
      return String(firstKey[1]);
    }
  }
  return "ALL";
}

/** POS tablo dizisini optimistic güncelle. */
function optimisticUpdatePosTables(
  data: unknown,
  tableId: string,
  newStatus: Table["status"],
): unknown {
  if (!Array.isArray(data)) return data;
  return data.map((t: Table) =>
    t.id === tableId ? { ...t, status: newStatus } : t,
  );
}

/** Genel tablo cache'ini (dizi veya paginated) optimistic güncelle. */
function optimisticUpdateTables(
  data: unknown,
  tableId: string,
  newStatus: Table["status"],
): unknown {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map((t: Table) =>
      t.id === tableId ? { ...t, status: newStatus } : t,
    );
  }
  // Paginated response: { results: Table[], count, ... }
  const paginated = data as { results?: Table[] };
  if (paginated.results) {
    return {
      ...paginated,
      results: paginated.results.map((t: Table) =>
        t.id === tableId ? { ...t, status: newStatus } : t,
      ),
    };
  }
  return data;
}

// ---------------------------------------------------------------------------
// useTableMutation
// ---------------------------------------------------------------------------

/**
 * Masa açma, kapama, rezerve ve diğer aksiyonlar için
 * optimistic update'li useMutation hook'u.
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = useTableMutation();
 * mutate({ action: 'open', tableId: '123' });
 * ```
 */
export function useTableMutation() {
  const queryClient = useQueryClient();
  // Translasyonu hook içinde alıyoruz; hata mesajları için.
  // NOT: next-intl’in useTranslations’ı bir React hook’udur,
  // bu nedenle useMutation callback'leri yerine doğrudan
  // mutationFn veya onError içinde kullanılamaz.
  // onError'da toast.error ile sabit bir key kullanıyoruz;
  // isteğe bağlı olarak callback parametresi de eklenebilir.

  return useMutation({
    mutationFn: async ({ action, tableId, payload }: TableMutationVars) => {
      switch (action) {
        case "open":
          return tablesApi.open(tableId);
        case "close":
          return tablesApi.close(tableId);
        case "forceClose":
          return tablesApi.forceClose(tableId);
        case "reserve":
          return tablesApi.reserve(tableId, payload!);
        case "cancelReservation":
          return tablesApi.cancelReservation(tableId);
        case "setOutOfService":
          return tablesApi.setOutOfService(tableId);
        default:
          throw new Error(`Unknown table action: ${action}`);
      }
    },

    onMutate: async ({ action, tableId }) => {
      // 1. In-flight istekleri iptal et (çakışma önleme)
      await queryClient.cancelQueries({ queryKey: queryKeys.posTablesBase });
      await queryClient.cancelQueries({ queryKey: queryKeys.tablesBase });

      // 2. Tüm POS tablo cache'lerini snapshotla
      const prevPosQueries = queryClient.getQueriesData<unknown>({
        queryKey: queryKeys.posTablesBase,
      });
      const prevTableQueries = queryClient.getQueriesData<unknown>({
        queryKey: queryKeys.tablesBase,
      });

      // 3. Belirli branch'in POS tablo cache snapshot'ı (rollback için ilk eşleşme)
      const storeBranchId = extractBranchId(prevPosQueries);
      const prevStoreTables =
        (prevPosQueries.find(([key]) => {
          const k = key as unknown[];
          return Array.isArray(k) && k[1] === storeBranchId;
        })?.[1] as Table[] | undefined) ?? [];

      // 4. Yeni status
      const newStatus = getNewStatus(action);
      if (!newStatus) {
        return { prevPosQueries, prevTableQueries, prevStoreTables };
      }

      // 5. Optimistic: Query cache – tüm pos-tables* (variant dahil)
      for (const [key] of prevPosQueries) {
        queryClient.setQueryData(key, (prev: unknown) =>
          optimisticUpdatePosTables(prev, tableId, newStatus),
        );
      }

      // 6. Optimistic: Query cache – Genel tablolar
      for (const [key] of prevTableQueries) {
        queryClient.setQueryData(key, (prev: unknown) =>
          optimisticUpdateTables(prev, tableId, newStatus),
        );
      }

      return { prevPosQueries, prevTableQueries, prevStoreTables };
    },

    onError: (_err, { action }, context) => {
      // Rollback: Query cache'lerini eski haline döndür
      if (context?.prevPosQueries) {
        for (const q of context.prevPosQueries) {
          queryClient.setQueryData(q[0] as import("@tanstack/react-query").QueryKey, q[1]);
        }
      }
      if (context?.prevTableQueries) {
        for (const q of context.prevTableQueries) {
          queryClient.setQueryData(q[0] as import("@tanstack/react-query").QueryKey, q[1]);
        }
      }

      toast.error(`tables.actions.${action}Error`);
    },

    onSettled: () => {
      // POS cache'i zaten onMutate/onError ile güncellendi.
      // Sadece POS dışı tüketiciler (tables modülü) için invalidate et.
      queryClient.invalidateQueries({ queryKey: queryKeys.tablesBase });
    },
  });
}

// ---------------------------------------------------------------------------
// useOptimisticOrderCreate
// ---------------------------------------------------------------------------

/**
 * Sipariş oluşturma sırasında **masa durumunu** optimistic güncellemek için
 * kullanılan yardımcı hook.
 *
 * ```tsx
 * const { applyOptimistic, rollbackOptimistic } = useOptimisticOrderCreate();
 * ```
 *
 * - `applyOptimistic(tableId)`: API çağrısından önce çağrılır.
 * - `rollbackOptimistic()`: Hata durumunda çağrılır (döndürülen context ile).
 * - `onSettled()`: Her durumda cache'i tazeler.
 */
type OptimisticKeyData = readonly [unknown, unknown];
type OptimisticSnapshot = {
  prevPosQueries: readonly OptimisticKeyData[];
  prevTableQueries: readonly OptimisticKeyData[];
  prevStoreTables: Table[];
};

export function useOptimisticOrderCreate() {
  const queryClient = useQueryClient();

  /** Cache snapshot’ı alır, optimistic günceller ve rollback context’ini döndürür. */
  const applyOptimistic = async (tableId: string): Promise<OptimisticSnapshot> => {
    // In-flight iptal
    await queryClient.cancelQueries({ queryKey: queryKeys.posTablesBase });
    await queryClient.cancelQueries({ queryKey: queryKeys.tablesBase });

    // Snapshot
    const prevPosQueries = queryClient.getQueriesData<unknown>({
      queryKey: queryKeys.posTablesBase,
    });
    const prevTableQueries = queryClient.getQueriesData<unknown>({
      queryKey: queryKeys.tablesBase,
    });
    const storeBranchId = extractBranchId(prevPosQueries);
    const prevStoreTables =
      (prevPosQueries.find(([key]) => {
        const k = key as unknown[];
        return Array.isArray(k) && k[1] === storeBranchId;
      })?.[1] as Table[] | undefined) ?? [];

    // Optimistic: tüm pos-tables* (variant dahil)
    for (const [key] of prevPosQueries) {
      queryClient.setQueryData(key, (prev: unknown) =>
        optimisticUpdatePosTables(prev, tableId, "OCCUPIED"),
      );
    }
    // Optimistic: Genel query cache
    for (const [key] of prevTableQueries) {
      queryClient.setQueryData(key, (prev: unknown) =>
        optimisticUpdateTables(prev, tableId, "OCCUPIED"),
      );
    }

    return { prevPosQueries, prevTableQueries, prevStoreTables };
  };

  /** Snapshot’a geri döner (rollback). */
  const rollbackOptimistic = (context: OptimisticSnapshot | null) => {
    if (!context) return;
    for (const q of context.prevPosQueries) {
      queryClient.setQueryData(q[0] as import("@tanstack/react-query").QueryKey, q[1]);
    }
    for (const q of context.prevTableQueries) {
      queryClient.setQueryData(q[0] as import("@tanstack/react-query").QueryKey, q[1]);
    }
  };

  /** Cache'i tazeler. POS cache'i zaten applyOptimistic/rollbackOptimistic ile güncellendi. */
  const onSettled = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tablesBase });
  };

  return { applyOptimistic, rollbackOptimistic, onSettled };
}
