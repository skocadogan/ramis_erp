import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { runManagedWebSocket } from "@/lib/ws/managedWebSocket"
import { getProductionStatusWsUrl } from "@/lib/ws/authWsUrl"

export function useProductionStatusSocket(branchId: string, isOpen: boolean) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!isOpen || !branchId) return

    const cleanup = runManagedWebSocket({
      getUrl: () => getProductionStatusWsUrl(branchId),
      onMessage: (event) => {
        try {
          const data = JSON.parse(event.data)
          console.debug("[ProductionStatus WS] Message received:", data)
          if (data.type === 'availability_update') {
            // Sadece availability sorgusunu geçersiz kıl
            queryClient.invalidateQueries({ 
              queryKey: ["product_availabilities"] 
            })
          }
        } catch (e) {
          console.error("WS parse error", e)
        }
      },
      tag: "production-status"
    })

    return cleanup
  }, [branchId, isOpen, queryClient])
}
