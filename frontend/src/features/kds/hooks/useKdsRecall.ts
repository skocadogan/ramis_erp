"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchKdsRecallList,
  postKdsCancelItem,
  postKdsCancelOrder,
  postKdsRecallItem,
  type KdsRecallGroup,
} from "../services/kdsApi";

type CancelTarget =
  | { type: "ITEM"; id: string; name: string }
  | { type: "ORDER"; id: string; name: string }
  | null;

export function useKdsRecall(
  stationId: string | undefined,
  branchId: string | undefined,
) {
  const [groups, setGroups] = useState<KdsRecallGroup[]>([]);
  const [recallWindowMinutes, setRecallWindowMinutes] = useState(15);
  const [isLoading, setIsLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<CancelTarget>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fetchSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (!stationId || !branchId) {
      setGroups([]);
      return;
    }
    const seq = ++fetchSeq.current;
    setIsLoading(true);
    try {
      const data = await fetchKdsRecallList(stationId, branchId);
      if (seq !== fetchSeq.current) return;
      setGroups(data.groups ?? []);
      setRecallWindowMinutes(data.recall_window_minutes ?? 15);
    } catch {
      if (seq === fetchSeq.current) setGroups([]);
    } finally {
      if (seq === fetchSeq.current) setIsLoading(false);
    }
  }, [stationId, branchId]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const recallItem = useCallback(
    async (itemId: string) => {
      setBusyId(itemId);
      try {
        await postKdsRecallItem(itemId);
        await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const submitCancel = useCallback(
    async (reasonCode: string, reasonText: string) => {
      if (!cancelTarget) return;
      setBusyId(cancelTarget.id);
      try {
        if (cancelTarget.type === "ITEM") {
          await postKdsCancelItem(cancelTarget.id, {
            reason_code: reasonCode,
            reason_text: reasonText,
          });
        } else {
          await postKdsCancelOrder(cancelTarget.id, {
            reason_code: reasonCode,
            reason_text: reasonText,
          });
        }
        setCancelTarget(null);
        await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [cancelTarget, refresh],
  );

  const itemCount = groups.reduce((n, g) => n + g.items.length, 0);

  return {
    groups,
    itemCount,
    recallWindowMinutes,
    isLoading,
    busyId,
    cancelTarget,
    setCancelTarget,
    refresh,
    recallItem,
    submitCancel,
  };
}
