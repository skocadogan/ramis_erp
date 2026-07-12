import { usePosStore } from "@/store/usePosStore";
import { playNotificationSound } from "@/lib/notificationSounds";

/** ``/ws/staff/notifications/`` — misafir geldi / rezervasyon saati (garson çağrısı ayrı kanal). */
export function handleStaffNotificationPayload(payload: {
  data?: Record<string, unknown>;
}) {
  const data = payload.data;
  if (!data || typeof data !== "object") return;
  const event = data.event;
  const st = usePosStore.getState();

  if (event === "guest_arrived" || event === "reservation_due") {
    if (!st.showWaiterCallNotifs) return;

    const source =
      event === "reservation_due" ? "reservation_due" : "reservation_arrived";
    const callId =
      data.call_id != null
        ? String(data.call_id)
        : `${Date.now()}-${Math.random()}`;

    st.addWaiterCallNotif({
      id: callId,
      message: String(data.message || ""),
      tableId: data.table_id != null ? String(data.table_id) : undefined,
      source,
      reservationId:
        data.reservation_id != null ? String(data.reservation_id) : undefined,
      customerName:
        data.customer_name != null ? String(data.customer_name) : undefined,
    });

    if (st.playNotifSound) {
      playNotificationSound("guest-arrival");
    }
  }
}
