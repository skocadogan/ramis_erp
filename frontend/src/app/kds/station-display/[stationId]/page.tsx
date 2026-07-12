"use client";

import { useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { getKitchenNotificationsWsUrl } from "@/lib/ws";
import { useAuthStore } from "@/store/useAuthStore";
import { adminApi } from "@/features/admin/services/adminApi";
import { prepApi } from "@/features/prep/services/prepApi";
import {
  StationDisplayScreen,
  type StationDisplayStationInfo,
} from "@/features/kds/station-display/StationDisplayScreen";

function readStationDisplayUrlParams() {
  if (typeof window === "undefined") return {};
  const sp = new URLSearchParams(window.location.search);
  return {
    branchId: sp.get("branch_id")?.trim() || undefined,
    stationName: sp.get("station_name")?.trim() || undefined,
    stationColor: sp.get("station_color")?.trim() || undefined,
    branchName: sp.get("branch_name")?.trim() || undefined,
  };
}

function stationInfoFromUrlParams(
  stationId: string,
  params: ReturnType<typeof readStationDisplayUrlParams>,
): StationDisplayStationInfo | null {
  if (!params.stationName) return null;
  return {
    id: stationId,
    name: params.stationName,
    color: params.stationColor || "#6366f1",
    branch: params.branchId,
    branch_name: params.branchName,
  };
}

function mapKitchenStation(station: {
  id: string;
  name: string;
  color: string;
  branch: string;
  branch_name: string;
}): StationDisplayStationInfo {
  return {
    id: station.id,
    name: station.name,
    color: station.color,
    branch: station.branch,
    branch_name: station.branch_name,
  };
}

function StationDisplayInner({ stationId }: { stationId: string }) {
  const token = useAuthStore((s) => s.token);
  const initialUrlParams = useMemo(() => readStationDisplayUrlParams(), []);
  const urlBranchId = initialUrlParams.branchId;

  const loadStation = useCallback(async () => {
    const stationData = await adminApi.getStation(stationId);
    return mapKitchenStation(stationData);
  }, [stationId]);

  const loadTasks = useCallback(async () => {
    return prepApi.getTasks({
      station_id: stationId,
      ...(urlBranchId ? { branch_id: urlBranchId } : {}),
    });
  }, [stationId, urlBranchId]);

  const getWsUrl = useCallback(
    () => getKitchenNotificationsWsUrl(urlBranchId),
    [urlBranchId],
  );

  return (
    <StationDisplayScreen
      stationId={stationId}
      branchId={urlBranchId}
      initialStation={stationInfoFromUrlParams(stationId, initialUrlParams)}
      wsEnabled={Boolean(token)}
      wsTag={`station-display-${stationId}`}
      getWsUrl={getWsUrl}
      loadStation={loadStation}
      loadTasks={loadTasks}
    />
  );
}

export default function StationDisplayPage() {
  const params = useParams();
  const stationId = typeof params.stationId === "string" ? params.stationId : "";

  return (
    <AuthGuard module="kds">
      <StationDisplayInner stationId={stationId} />
    </AuthGuard>
  );
}
