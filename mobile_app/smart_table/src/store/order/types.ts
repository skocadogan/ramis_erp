// ============================================================
// Smart Table — Order Store Shared Types
// ============================================================

export type WsOrderStatusPayload = {
  event?: string;
  order_id?: string;
  item_id?: string;
  item_status?: string;
  table_id?: string;
};

export type FetchOrdersOptions = {
  /** WS / arka plan yenilemesi: listeyi silme, isLoading açma */
  background?: boolean;
};
