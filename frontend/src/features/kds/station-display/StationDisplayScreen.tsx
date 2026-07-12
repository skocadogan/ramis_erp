"use client";

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  subscribeSharedWebSocket,
  kitchenNotificationsHubKey,
} from "@/lib/ws";
import { type PrepTask } from "@/features/prep/types";
import { ChefHat, Loader2 } from "lucide-react";
import { StatsBar } from "@/features/kds/station-display/components/StatsBar";
import { WsIndicator } from "@/features/kds/station-display/components/WsIndicator";
import { LiveDateClock } from "@/features/kds/station-display/components/LiveDateClock";
import { EmptyState } from "@/features/kds/station-display/components/EmptyState";
import { UserTaskCard } from "@/features/kds/station-display/components/UserTaskCard";
import { UnassignedTaskCard } from "@/features/kds/station-display/components/UnassignedTaskCard";
import { CompletedTaskStrip } from "@/features/kds/station-display/components/CompletedTaskStrip";
import { groupTasksByUser } from "@/features/kds/station-display/utils/groupTasksByUser";

export interface StationDisplayStationInfo {
  id: string;
  name: string;
  color: string;
  branch?: string;
  branch_name?: string;
}

export interface StationDisplayScreenProps {
  stationId: string;
  branchId?: string;
  initialStation?: StationDisplayStationInfo | null;
  wsEnabled: boolean;
  wsTag: string;
  getWsUrl: () => string;
  loadStation: () => Promise<StationDisplayStationInfo | null>;
  loadTasks: () => Promise<PrepTask[]>;
  headerActions?: ReactNode;
}

export function StationDisplayScreen({
  stationId,
  branchId,
  initialStation = null,
  wsEnabled,
  wsTag,
  getWsUrl,
  loadStation,
  loadTasks,
  headerActions,
}: StationDisplayScreenProps) {
  const [tasks, setTasks] = useState<PrepTask[]>([]);
  const [station, setStation] = useState<StationDisplayStationInfo | null>(initialStation);
  const [isLoading, setIsLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [stationBranch, setStationBranch] = useState<string | undefined>(branchId);
  const fetchTasksRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (branchId) {
      setStationBranch(branchId);
    } else if (station?.branch) {
      setStationBranch(station.branch);
    }
  }, [branchId, station?.branch]);

  const fetchTasks = useCallback(async () => {
    try {
      const data = await loadTasks();
      setTasks(data);
    } catch {
      /* sessiz hata */
    }
  }, [loadTasks]);

  useLayoutEffect(() => {
    fetchTasksRef.current = fetchTasks;
  }, [fetchTasks]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    Promise.all([loadStation().catch(() => null), loadTasks().catch(() => [] as PrepTask[])])
      .then(([stationData, data]) => {
        if (cancelled) return;
        if (stationData) setStation(stationData);
        setTasks(data);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [stationId, loadStation, loadTasks]);

  useEffect(() => {
    if (!wsEnabled || !stationBranch) return;

    const hubKey = kitchenNotificationsHubKey(stationBranch);
    const cleanup = subscribeSharedWebSocket(hubKey, {
      tag: wsTag,
      getUrl: getWsUrl,
      enabled: true,
      onOpen: () => {
        setWsConnected(true);
        void fetchTasksRef.current?.();
      },
      onClose: () => setWsConnected(false),
      onMessage: (event) => {
        try {
          const data = JSON.parse(event.data) as {
            type?: string;
            data?: { sub_type?: string; reason?: string; refresh_all?: boolean; task?: PrepTask };
          };

          const isPrepEvent =
            data.type === "prep_updated" ||
            (data.type === "kds_refresh" &&
              (data.data?.sub_type === "prep_update" || data.data?.reason === "prep_update"));

          if (!isPrepEvent) return;

          const payload = data.data ?? {};
          if (payload.refresh_all || !payload.task) {
            void fetchTasksRef.current?.();
            return;
          }

          const updatedTask = payload.task;
          const normalizeId = (v: string | null | undefined) =>
            String(v ?? "").toLowerCase().trim();
          if (normalizeId(updatedTask.station) !== normalizeId(stationId)) return;

          setTasks((prev) => {
            const idx = prev.findIndex((t) => t.id === updatedTask.id);
            if (idx === -1) {
              return [...prev, updatedTask].sort((a, b) => b.priority - a.priority);
            }
            const next = [...prev];
            next[idx] = updatedTask;
            return next;
          });
        } catch {
          /* geçersiz mesaj */
        }
      },
    });

    return cleanup;
  }, [wsEnabled, stationId, stationBranch, wsTag, getWsUrl]);

  const grouped = useMemo(() => groupTasksByUser(tasks), [tasks]);
  const stationColor = station?.color || "#6366f1";

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
          <p className="text-slate-400 font-medium">İstasyon yükleniyor…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      <header
        className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-8 py-4"
        style={{ borderTopWidth: 4, borderTopColor: stationColor }}
      >
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${stationColor}25`, color: stationColor }}
          >
            <ChefHat size={24} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Mutfak İstasyon Ekranı
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: stationColor }}
              />
              <span className="text-xl font-bold text-white">{station?.name ?? "İstasyon"}</span>
              {station?.branch_name && (
                <span className="ml-1 text-sm text-slate-500">— {station.branch_name}</span>
              )}
            </div>
          </div>
        </div>

        <StatsBar tasks={tasks} />

        <div className="flex items-center gap-4">
          {headerActions}
          <WsIndicator connected={wsConnected} />
          <div className="h-8 w-px bg-slate-700" />
          <LiveDateClock />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8">
        {tasks.length === 0 ? (
          <EmptyState stationColor={stationColor} />
        ) : (
          <div className="space-y-8">
            {grouped.activeGroups.length > 0 && (
              <section>
                <div className="mb-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-800" />
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    Aktif ({grouped.stats.totalActive})
                  </span>
                  <div className="h-px flex-1 bg-slate-800" />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {grouped.activeGroups.map((group) =>
                    group.userId === null ? (
                      <UnassignedTaskCard
                        key="__unassigned__"
                        tasks={group.tasks}
                        stationColor={stationColor}
                      />
                    ) : (
                      <UserTaskCard
                        key={group.userId}
                        userName={group.userName}
                        userId={group.userId}
                        tasks={group.tasks}
                        stationColor={stationColor}
                      />
                    ),
                  )}
                </div>
              </section>
            )}

            <CompletedTaskStrip tasks={grouped.completedTasks} />
          </div>
        )}
      </main>
    </div>
  );
}
