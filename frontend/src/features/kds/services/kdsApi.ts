import api from "@/lib/api";

export type RecordKdsWastePayload = {
  stock_item_id: string;
  quantity: number | string;
  unit?: string;
  notes?: string;
};

/** KDS fire/zayi — bağlı depoda WASTE hareketi + stok düşümü */
export async function recordKdsWaste(stationId: string, payload: RecordKdsWastePayload) {
  const res = await api.post(`/stations/${stationId}/record-waste/`, payload);
  return res.data as Record<string, unknown>;
}

export type RecordKdsReturnCancelPayload = RecordKdsWastePayload & {
  movement_type: "RETURN" | "CANCEL";
  reason_code?: string;
  supplier_id?: string;
};

/** KDS iade/iptal — bağlı depoda RETURN veya CANCEL hareketi */
export async function recordKdsReturnCancel(stationId: string, payload: RecordKdsReturnCancelPayload) {
  const res = await api.post(`/stations/${stationId}/record-return-cancel/`, payload);
  return res.data as Record<string, unknown>;
}

/** Smart Firing v2 — sunucu tarafında zamanı şimdiye çeker, PREPARING başlatır. */
export async function postKdsFiringForceNow(orderItemId: string) {
  const res = await api.post(`/orders/items/${orderItemId}/firing/force-now/`, {});
  return res.data as Record<string, unknown>;
}

/** Smart Firing v2 — planlı başlangıcı ileri alır. */
export async function postKdsFiringSnooze(orderItemId: string, minutes: number) {
  const res = await api.post(`/orders/items/${orderItemId}/firing/snooze/`, { minutes });
  return res.data as Record<string, unknown>;
}

type KdsRecallItem = {
  id: string;
  product_name: string;
  quantity: number;
  status: string;
  unit_name: string | null;
  notes: string | null;
  updated_at: string;
};

export type KdsRecallGroup = {
  order_id: string;
  order_number: string | null;
  table_name: string;
  order_type: "TABLE" | "TAKEAWAY";
  sent_at: string;
  items: KdsRecallItem[];
};

export type KdsRecallResponse = {
  recall_window_minutes: number;
  groups: KdsRecallGroup[];
};

/** KDS geri çağır drawer — servise gönderilmiş kalemler. */
export async function fetchKdsRecallList(stationId: string, branchId: string) {
  const res = await api.get<KdsRecallResponse>(
    `/orders/main/kds-recall/?station_id=${encodeURIComponent(stationId)}&branch_id=${encodeURIComponent(branchId)}`,
  );
  return res.data;
}

/** Kalemi mutfağa geri çağır (PENDING). */
export async function postKdsRecallItem(itemId: string) {
  const res = await api.post(`/orders/items/${itemId}/recall/`, {});
  return res.data;
}

/** Kalem iptali (KDS / POS ortak). */
export async function postKdsCancelItem(
  itemId: string,
  payload: { reason_code: string; reason_text?: string },
) {
  const res = await api.post(`/orders/items/${itemId}/cancel/`, payload);
  return res.data;
}

/** Sipariş iptali (KDS geri çağır drawer). */
export async function postKdsCancelOrder(
  orderId: string,
  payload: { reason_code: string; reason_text?: string },
) {
  const res = await api.post(`/orders/main/${orderId}/cancel/`, payload);
  return res.data;
}
