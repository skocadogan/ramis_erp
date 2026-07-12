"use client";

import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { prepApi } from "../services/prepApi";
import type { PrepTaskListMode } from "../types";
import { usePrepTaskMutations } from "./usePrepTaskMutations";

export function usePrepTasks(
  branchId?: string,
  stationId?: string,
  options?: { listMode?: PrepTaskListMode },
) {
  const user = useAuthStore((s) => s.user);
  const listMode: PrepTaskListMode = options?.listMode ?? "operational";
  const generatedForBranchRef = useRef<Set<string>>(new Set());
  const mutations = usePrepTaskMutations();

  const query = useQuery({
    queryKey: ["prep-tasks", branchId, stationId, listMode] as const,
    queryFn: async () => {
      const bid = (branchId || "").trim();
      const genKey = bid || (user?.is_superuser ? "__all__" : "");
      if (genKey && !generatedForBranchRef.current.has(genKey)) {
        try {
          await prepApi.generateFromTemplates();
        } catch {
          /* ağ/izin: list yine dene */
        }
        generatedForBranchRef.current.add(genKey);
      }
      return prepApi.getTasks({
        branch_id: branchId,
        station_id: stationId,
        listMode,
      });
    },
    enabled: !!branchId || !!user?.is_superuser,
  });

  return {
    tasks: query.data ?? [],
    isLoading: query.isLoading,
    refresh: query.refetch,
    ...mutations,
  };
}
