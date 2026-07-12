import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getKitchenNotificationsWsUrl, kitchenNotificationsHubKey, subscribeSharedWebSocket } from "@/lib/ws"
import { useAuthStore } from "@/store/useAuthStore"
import {
  applyPrepKitchenWsPayload,
  type PrepWsMessagePayload,
} from "../utils/mergePrepWsCache"

function isPrepPayload(payload: PrepWsMessagePayload & { reason?: string; sub_type?: string }) {
  return payload.sub_type === "prep_update" || payload.reason === "prep_update"
}

/**
 * Mutfak kanalı: KDS / hazırlık yönetimi paylaşımlı kitchen WebSocket hub kullanır.
 */
export function usePrepSocket(branchId?: string) {
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    const explicitBranch =
      typeof branchId === "string" ? branchId.trim() || undefined : undefined

    const cleanup = subscribeSharedWebSocket(kitchenNotificationsHubKey(explicitBranch), {
      tag: "prep-kitchen",
      getUrl: () => getKitchenNotificationsWsUrl(explicitBranch),
      enabled: !!token,
      onOpen: () => {
        void queryClient.invalidateQueries({ queryKey: ["prep-tasks"] })
        void queryClient.invalidateQueries({ queryKey: ["prep-tasks-infinite"] })
        void queryClient.invalidateQueries({ queryKey: ["prep-task-count"] })
      },
      onMessage: (event) => {
        try {
          const data = JSON.parse(event.data) as {
            type?: string
            data?: PrepWsMessagePayload & { reason?: string; sub_type?: string }
          }
          if (data.type !== "prep_updated" && data.type !== "kds_refresh") return

          const payload = data.data ?? {}
          if (data.type === "kds_refresh" && !isPrepPayload(payload)) return

          applyPrepKitchenWsPayload(queryClient, {
            refresh_all: payload.refresh_all,
            removed_task_id: payload.removed_task_id ?? null,
            task: payload.task ?? null,
          })
        } catch {
          /* geçersiz mesaj */
        }
      },
    })

    return cleanup
  }, [branchId, queryClient, token])
}
