import { usePosStore } from "@/store/usePosStore";

/** ``/ws/waiter/calls/`` — görüldü senkronu (tüm istemciler). */
export function handleWaiterCallDismissedPayload(payload: {
  data?: Record<string, unknown>;
}) {
  const data = payload.data;
  if (!data || typeof data !== "object") return;

  const dismissAll = Boolean(data.dismiss_all);
  const callIds = Array.isArray(data.call_ids)
    ? data.call_ids.map((id) => String(id))
    : [];

  usePosStore.getState().applyWaiterCallDismissed({ dismissAll, callIds });
}
