interface OrderItemModifierLine {
  id: string;
  modifier_name: string;
  price: number;
}

export interface OrderItem {
  id: string;
  product_name: string;
  category_name: string | null;
  product_image: string | null;
  quantity: number;
  status: "PENDING" | "PREPARING" | "READY" | "DELIVERED" | "COMPLETED" | "CANCELLED";
  unit_name: string | null;
  notes: string | null;
  modifiers?: OrderItemModifierLine[];
  updated_at: string;
  updated_at_ts: number;
  scheduled_start_time: string | null;
  order_created_at_ts?: number;
  firing_state?: "scheduled" | "due" | "late" | "forced_start" | null;
  queue_hint?: {
    station_active_items: number;
    station_id: string;
    computed_at?: string;
  } | null;
  /** Birleşik ürün ana satırı (API) */
  is_combined_product?: boolean;
  combined_parts?: {
    product_name: string;
    quantity_total: number;
    unit_name: string | null;
  }[];
  /** Genişletilmiş alt kalemlerde ana satır ID */
  parent_item?: string | null;
  /** Bu istasyondaki alt bileşen — ana birleşik ürün bilgisi (KDS API) */
  is_combined_component?: boolean;
  combined_parent_name?: string | null;
  combined_parent_quantity?: number | null;
  combined_parent_category_name?: string | null;
}

export interface Order {
  id: string;
  table_name: string;
  order_number: string | null;
  order_type: "TABLE" | "TAKEAWAY";
  user_name: string | null;
  status: string;
  items: OrderItem[];
  created_at: string;
  created_at_ts: number;
  updated_at: string;
  updated_at_ts: number;
  kitchen_queue_notice?: {
    show: boolean;
    extra_minutes: number;
    message_key?: string;
  } | null;
}

/** KDS satır miktar geçmişi (OrderCard / useKdsData). */
export type KdsItemHistoryEntry = {
  initialQty: number
  lastChangeType: "PLUS" | "MINUS" | null
  changeTimestamp: number
  prevQty?: number
}

export interface GroupedOrder {
  order_id: string;
  order_number: string | null;
  table_name: string;
  order_type: "TABLE" | "TAKEAWAY";
  user_name: string | null;
  items: (OrderItem & { order_id: string; order_type: "TABLE" | "TAKEAWAY" })[];
  oldest_created_at_ts: number;
  all_cancelled: boolean;
  max_updated_at_ts: number;
  notes?: string[];
}

/** İptal uyarı balonu (useKdsData → CancellationAnnouncement). */
export type KdsCancellationAnnouncement = {
  id: string;
  order_id: string;
  table_name: string;
  items: string[];
  type: "CANCELLED";
};

/** Aynı masada, bu KDS dışındaki istasyonda hâlâ PENDING / PREPARING kalan satırlar. */
export type KdsPeerPendingLine = {
  table_name: string;
  station_name: string;
  quantity: number;
  product_name: string;
  unit_name: string | null;
};
