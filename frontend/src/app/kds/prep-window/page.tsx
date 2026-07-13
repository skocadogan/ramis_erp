"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, ChefHat, ChevronRight, Loader2, Settings2 } from "lucide-react";
import {
  prepDisplayApi,
  type PrepDisplayBranch,
  type PrepDisplayStation,
} from "@/features/kds/prep-display/services/prepDisplayApi";
import {
  StationDisplayScreen,
  type StationDisplayStationInfo,
} from "@/features/kds/station-display/StationDisplayScreen";
import { getPrepDisplayKitchenNotificationsWsUrl } from "@/lib/ws";
import {
  applyClientRuntimeConfig,
  createRuntimeConfig,
  getRuntimeConfig,
  loadClientRuntimeConfig,
} from "@/lib/runtimeConfig";
import axios from "axios";

const STORAGE_KEY = "prep-window-session";

export interface PrepWindowStoredSession {
  displayToken: string;
  branchId: string;
  stationId: string;
  station: PrepDisplayStation;
}

interface PrepWindowElectronAPI {
  getApiBaseUrl?: () => string | null;
  getPrepWindowConfig?: () => Promise<PrepWindowStoredSession | null>;
  savePrepWindowConfig?: (cfg: PrepWindowStoredSession) => Promise<void>;
  resetPrepWindowConfig?: () => Promise<void>;
}

function getPrepWindowElectronAPI(): PrepWindowElectronAPI | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return (window as unknown as { electronAPI?: PrepWindowElectronAPI }).electronAPI;
}

async function ensurePrepWindowRuntimeConfig(): Promise<void> {
  const electronApiBaseUrl = getPrepWindowElectronAPI()?.getApiBaseUrl?.();
  if (electronApiBaseUrl) {
    const cfg = createRuntimeConfig(
      window.location.origin,
      {
        apiBaseUrl: electronApiBaseUrl,
        posOfflineQueue: true,
        apiInterceptorToasts: false,
      },
      { allowBuildTimeEnv: false },
    );
    applyClientRuntimeConfig(cfg);
    return;
  }
  await loadClientRuntimeConfig();
}

function formatBranchesLoadError(err: unknown): string {
  const apiBase = getRuntimeConfig().apiBaseUrl;
  if (axios.isAxiosError(err)) {
    if (err.response?.status === 404) {
      return `prep-display API bulunamadı (404). Backend güncel mi? Sunucuyu yeniden başlatın. (${apiBase})`;
    }
    if (err.code === "ERR_NETWORK" || !err.response) {
      return `Sunucuya ulaşılamıyor. Adres: ${apiBase}`;
    }
    return `Şube listesi alınamadı (${err.response.status}). Adres: ${apiBase}`;
  }
  return `Şube listesi alınamadı. Sunucu adresini kontrol edin. (${apiBase})`;
}

function toStationInfo(station: PrepDisplayStation): StationDisplayStationInfo {
  return {
    id: station.id,
    name: station.name,
    color: station.color,
    branch: station.branch,
    branch_name: station.branch_name,
  };
}

function readStoredSession(): PrepWindowStoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PrepWindowStoredSession;
  } catch {
    return null;
  }
}

function writeStoredSession(session: PrepWindowStoredSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearStoredSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function PrepWindowSetup({
  onComplete,
}: {
  onComplete: (session: PrepWindowStoredSession) => void;
}) {
  const [branches, setBranches] = useState<PrepDisplayBranch[]>([]);
  const [stations, setStations] = useState<PrepDisplayStation[]>([]);
  const [branchId, setBranchId] = useState("");
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);
  const [isLoadingStations, setIsLoadingStations] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void ensurePrepWindowRuntimeConfig().then(() => {
      prepDisplayApi
        .getBranches()
        .then((data) => {
          if (!cancelled) {
            setBranches(data);
            if (data.length === 1) setBranchId(data[0]!.id);
          }
        })
        .catch((err) => {
          if (!cancelled) setError(formatBranchesLoadError(err));
        })
        .finally(() => {
          if (!cancelled) setIsLoadingBranches(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!branchId) {
      setStations([]);
      return;
    }
    let cancelled = false;
    setIsLoadingStations(true);
    prepDisplayApi
      .getStations(branchId)
      .then((data) => {
        if (!cancelled) setStations(data);
      })
      .catch(() => {
        if (!cancelled) setError("İstasyon listesi alınamadı.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingStations(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const handleSelectStation = async (station: PrepDisplayStation) => {
    setIsSubmitting(true);
    setError("");
    try {
      const session = await prepDisplayApi.createSession(branchId, station.id);
      onComplete({
        displayToken: session.display_token,
        branchId: session.branch_id,
        stationId: session.station_id,
        station: session.station,
      });
    } catch {
      setError("Oturum oluşturulamadı. Bağlantıyı kontrol edin.");
      setIsSubmitting(false);
    }
  };

  if (isLoadingBranches) {
    return (
      <div className="flex h-screen items-center justify-center text-white">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-white">
      <div className="w-full max-w-2xl rounded-3xl border /80 p-10 shadow-2xl">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-900/40">
            <ChefHat size={40} />
          </div>
          <h1 className="text-3xl font-bold">İstasyon Hazırlık Ekranı</h1>
          <p className="mt-2">Şube ve mutfak istasyonu seçin</p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mb-8">
          <label className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
            <Building2 size={16} />
            Şube
          </label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="w-full rounded-2xl border px-4 py-4 text-lg font-semibold text-white outline-none focus:border-indigo-500"
          >
            <option value="">Şube seçin…</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="mb-4 text-xs font-bold uppercase tracking-widest">
            Mutfak İstasyonu
          </div>
          {isLoadingStations ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : !branchId ? (
            <p className="py-8 text-center">Önce şube seçin.</p>
          ) : stations.length === 0 ? (
            <p className="py-8 text-center">Bu şubede istasyon bulunamadı.</p>
          ) : (
            <div className="grid gap-3">
              {stations.map((station) => (
                <button
                  key={station.id}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void handleSelectStation(station)}
                  className="group flex items-center justify-between rounded-2xl border px-5 py-4 text-left transition hover:border-indigo-500 hover: disabled:opacity-60"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: station.color }}
                    />
                    <div>
                      <div className="text-lg font-bold">{station.name}</div>
                      <div className="text-sm">{station.branch_name}</div>
                    </div>
                  </div>
                  <ChevronRight className="transition group-hover:text-white" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PrepWindowDisplay({
  session,
  onChangeSetup,
}: {
  session: PrepWindowStoredSession;
  onChangeSetup: () => void;
}) {
  const loadStation = useCallback(async () => {
    const station = await prepDisplayApi.getStation(session.displayToken);
    return toStationInfo(station);
  }, [session.displayToken]);

  const loadTasks = useCallback(async () => {
    return prepDisplayApi.getTasks(session.displayToken, session.stationId);
  }, [session.displayToken, session.stationId]);

  const getWsUrl = useCallback(
    () => getPrepDisplayKitchenNotificationsWsUrl(session.branchId, session.displayToken),
    [session.branchId, session.displayToken],
  );

  return (
    <StationDisplayScreen
      stationId={session.stationId}
      branchId={session.branchId}
      initialStation={toStationInfo(session.station)}
      wsEnabled
      wsTag={`prep-window-${session.stationId}`}
      getWsUrl={getWsUrl}
      loadStation={loadStation}
      loadTasks={loadTasks}
      headerActions={
        <button
          type="button"
          onClick={onChangeSetup}
          className="flex h-9 w-9 items-center justify-center rounded-lg border transition hover: hover:text-white"
          title="Şube / istasyon değiştir"
        >
          <Settings2 size={16} />
        </button>
      }
    />
  );
}

export default function PrepWindowPage() {
  const [phase, setPhase] = useState<"loading" | "setup" | "display">("loading");
  const [session, setSession] = useState<PrepWindowStoredSession | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      await ensurePrepWindowRuntimeConfig();

      const electronAPI = getPrepWindowElectronAPI();
      const electronCfg = electronAPI?.getPrepWindowConfig
        ? await electronAPI.getPrepWindowConfig()
        : null;

      const stored = electronCfg ?? readStoredSession();
      if (!stored?.displayToken) {
        if (!cancelled) setPhase("setup");
        return;
      }

      const verified = await prepDisplayApi.verifySession(stored.displayToken);
      if (cancelled) return;

      if (!verified) {
        clearStoredSession();
        setPhase("setup");
        return;
      }

      const nextSession: PrepWindowStoredSession = {
        displayToken: verified.display_token,
        branchId: verified.branch_id,
        stationId: verified.station_id,
        station: verified.station,
      };
      writeStoredSession(nextSession);
      setSession(nextSession);
      setPhase("display");
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleComplete = (next: PrepWindowStoredSession) => {
    writeStoredSession(next);
    void getPrepWindowElectronAPI()?.savePrepWindowConfig?.(next);
    setSession(next);
    setPhase("display");
  };

  const handleChangeSetup = () => {
    clearStoredSession();
    void getPrepWindowElectronAPI()?.resetPrepWindowConfig?.();
    setSession(null);
    setPhase("setup");
  };

  if (phase === "loading") {
    return (
      <div className="flex h-screen items-center justify-center text-white">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
      </div>
    );
  }

  if (phase === "setup") {
    return <PrepWindowSetup onComplete={handleComplete} />;
  }

  if (!session) {
    return <PrepWindowSetup onComplete={handleComplete} />;
  }

  return <PrepWindowDisplay session={session} onChangeSetup={handleChangeSetup} />;
}
