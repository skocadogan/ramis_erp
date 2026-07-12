"use client";

import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { pageFromDrfNext } from "@/lib/pagination";
import { prepApi } from "../services/prepApi";
import type { PrepTaskListMode } from "../types";

function usePrepListInfinite<T>(
  queryKey: readonly unknown[],
  fetchPage: (page: number) => Promise<{ results: T[]; count: number; next: string | null }>,
  options?: { enabled?: boolean; onFirstFetch?: () => Promise<void> },
) {
  const onFirstFetchRef = useRef(options?.onFirstFetch);
  useEffect(() => {
    onFirstFetchRef.current = options?.onFirstFetch;
  });
  const didFirstRef = useRef(false);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam = 1 }) => {
      if (pageParam === 1 && onFirstFetchRef.current && !didFirstRef.current) {
        didFirstRef.current = true;
        try {
          await onFirstFetchRef.current();
        } catch {
          /* şablon üretimi başarısız olsa da listeyi dene */
        }
      }
      return fetchPage(pageParam as number);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => pageFromDrfNext(lastPage.next),
    enabled: options?.enabled ?? true,
    refetchOnMount: "always",
  });

  const rows = useMemo(
    () => query.data?.pages.flatMap((p) => p.results) ?? [],
    [query.data?.pages],
  );
  const totalCount = query.data?.pages[0]?.count ?? 0;

  return { ...query, rows, totalCount };
}

function listModeToHistoric(listMode: PrepTaskListMode): boolean | null {
  if (listMode === "full") return true;
  if (listMode === "operational") return false;
  return null;
}

function useGenerateFromTemplatesOnce(branchId?: string) {
  const user = useAuthStore((s) => s.user);
  const generatedRef = useRef<Set<string>>(new Set());

  return async () => {
    const bid = (branchId || "").trim();
    const genKey = bid || (user?.is_superuser ? "__all__" : "");
    if (!genKey || generatedRef.current.has(genKey)) return;
    await prepApi.generateFromTemplates();
    generatedRef.current.add(genKey);
  };
}

export function usePrepTasksInfinite(options: {
  branchId?: string;
  stationId?: string;
  statusGroup?: "all" | "active" | "completed";
  listMode?: PrepTaskListMode;
}) {
  const user = useAuthStore((s) => s.user);
  const { branchId, stationId, statusGroup = "all", listMode = "branch_default" } = options;
  const generateOnce = useGenerateFromTemplatesOnce(branchId);

  return usePrepListInfinite(
    ["prep-tasks-infinite", branchId, stationId, statusGroup, listMode] as const,
    (page) =>
      prepApi.getTasksPage({
        branch_id: branchId,
        station_id: stationId,
        include_historic_completed: listModeToHistoric(listMode),
        status_group: statusGroup === "all" ? undefined : statusGroup,
        page,
      }),
    {
      enabled: !!branchId || !!user?.is_superuser,
      onFirstFetch: generateOnce,
    },
  );
}

export function usePrepTaskCounts(options: {
  branchId?: string;
  listMode?: PrepTaskListMode;
}) {
  const user = useAuthStore((s) => s.user);
  const { branchId, listMode = "branch_default" } = options;
  const historic = listModeToHistoric(listMode);
  const enabled = !!branchId || !!user?.is_superuser;

  const activeQuery = useQuery({
    queryKey: ["prep-task-count", "active", branchId, listMode] as const,
    queryFn: () =>
      prepApi.getTasksPage({
        branch_id: branchId,
        include_historic_completed: historic,
        status_group: "active",
        page: 1,
        page_size: 1,
      }),
    enabled,
    staleTime: 30_000,
  });

  const completedQuery = useQuery({
    queryKey: ["prep-task-count", "completed", branchId, listMode] as const,
    queryFn: () =>
      prepApi.getTasksPage({
        branch_id: branchId,
        include_historic_completed: historic,
        status_group: "completed",
        page: 1,
        page_size: 1,
      }),
    enabled,
    staleTime: 30_000,
  });

  return {
    activeCount: activeQuery.data?.count ?? 0,
    completedCount: completedQuery.data?.count ?? 0,
    isLoading: activeQuery.isLoading || completedQuery.isLoading,
  };
}

export function usePrepTemplatesInfinite(branchId?: string) {
  const user = useAuthStore((s) => s.user);

  return usePrepListInfinite(
    ["prep-templates-infinite", branchId] as const,
    (page) => prepApi.getTemplatesPage({ branch_id: branchId, page }),
    { enabled: !!branchId || !!user?.is_superuser },
  );
}

export function usePrepSmartRulesInfinite(branchId?: string) {
  return usePrepListInfinite(
    ["prep-smart-rules-infinite", branchId] as const,
    (page) => prepApi.getSmartRulesPage({ branch_id: branchId, page }),
    { enabled: !!branchId },
  );
}

export function usePrepSmartSuggestionsInfinite(branchId?: string) {
  return usePrepListInfinite(
    ["prep-smart-suggestions-infinite", branchId] as const,
    (page) => prepApi.getSmartSuggestionsPage({ branch_id: branchId, page }),
    { enabled: !!branchId },
  );
}
