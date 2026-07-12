import { usePosStore } from "@/store/usePosStore";
import { playNotificationSound } from "@/lib/notificationSounds";

function soundForWaiterSource(source?: string): "table-calling" | "guest-arrival" {
  if (source === "reservation_due" || source === "reservation_arrived") {
    return "guest-arrival";
  }
  return "table-calling";
}

/** ``/ws/waiter/calls/`` — garson çağrısı ve rezervasyon uyarıları. */
export function handleWaiterCallPayload(payload: {
  data?: Record<string, unknown>;
}) {
  const data = payload.data;
  if (!data || typeof data !== "object") return;

  const st = usePosStore.getState();
  if (!st.showWaiterCallNotifs) return;

  const source = data.source != null ? String(data.source) : "smart_button";

  st.addWaiterCallNotif({
    id: String(data.call_id || `${Date.now()}-${Math.random()}`),
    message: String(data.message || ""),
    tableId: data.table_id != null ? String(data.table_id) : undefined,
    source,
    reservationId:
      data.reservation_id != null ? String(data.reservation_id) : undefined,
    customerName:
      data.customer_name != null ? String(data.customer_name) : undefined,
  });

  if (st.playNotifSound) {
    playNotificationSound(soundForWaiterSource(source));
  }
}
