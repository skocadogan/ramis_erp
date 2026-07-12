// ============================================================
// Smart Table — Order Service
// Handles fetching active table orders and placing new orders
// with the RAMIS ERP backend API.
// ============================================================

import { api } from "./api";
import { resolveMediaUrl } from "@/utils/mediaUrl";
import {
  unwrapOrderCreateResponse,
  type IdempotentOrderCreateResponse,
} from "@/utils/idempotency";
import type { WaiterCallApiResponse } from "@/utils/waiterCallFeedback";
import type { Order, CartItem, OrderStatus, OrderItemStatus } from "@/types";
import type { ApiOrder, ApiOrderItem, ApiTable } from "@/types/api";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidTableUuid(value: string | null | undefined): boolean {
  if (!value) return false;
  return UUID_RE.test(value.trim());
}

// Paginated veya düz dizi yanıtından veri çıkarır
function extractArray<T>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (typeof data === "object" && data !== null && "results" in data) {
    const withResults = data as { results?: unknown };
    if (Array.isArray(withResults.results)) return withResults.results as T[];
  }
  return [];
}

function parseNumeric(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapApiOrderItem(
  item: ApiOrderItem,
  orderCreatedAt: string,
): Order["items"][number] {
  return {
    id: item.id,
    orderId: "", // sipariş mapApiOrder içinde doldurulur
    productId: item.product,
    productName: item.product_name || "",
    productNameEn: item.product_name || "",
    imageUrl: resolveMediaUrl(item.product_image),
    quantity: item.quantity,
    unitPrice: parseNumeric(item.unit_price),
    totalPrice: parseNumeric(item.total_price),
    status: (item.status || "PENDING").toUpperCase() as OrderItemStatus,
    modifiers: (item.modifiers || []).map((m) => ({
      groupId: "",
      groupName: "",
      modifierId: m.modifier || "",
      modifierName: m.modifier_name || "",
      price: parseNumeric(m.price),
    })),
    note: item.notes || undefined,
    unitName: item.unit_name || item.unit || "",
    unitNameEn: item.unit_name_en || item.unit_name || item.unit || "",
    parentItemId: item.parent_item || null,
    isCombinedProduct: !!item.is_combined_product,
    combinedParts: (item.combined_parts || []).map((part) => ({
      productName: part.product_name || "",
      quantityTotal: parseNumeric(part.quantity_total),
      unitName: part.unit_name || null,
    })),
    createdAt: orderCreatedAt,
    waiterAcknowledgedAt: item.waiter_acknowledged_at || undefined,
  };
}

/**
 * Maps the backend API Order response to the client Order structure.
 */
function mapApiOrder(apiOrder: ApiOrder): Order {
  const order: Order = {
    id: apiOrder.id,
    tableId: apiOrder.table,
    tableName: apiOrder.table_name || "Masa",
    orderType: (apiOrder.order_type || "TABLE") as Order["orderType"],
    status: (apiOrder.status || "PENDING").toUpperCase() as OrderStatus,
    totalAmount: parseNumeric(apiOrder.total_amount),
    note: apiOrder.notes || undefined,
    createdAt: apiOrder.created_at,
    updatedAt: apiOrder.updated_at || apiOrder.created_at,
    estimatedCompletionTime: apiOrder.estimated_completion_time || undefined,
    items: (apiOrder.items || []).map((item) => ({
      ...mapApiOrderItem(item, apiOrder.created_at),
      orderId: apiOrder.id,
    })),
  };
  return order;
}

/**
 * Resolves table name to the real Table UUID from the backend.
 */
export async function resolveTableUuid(
  branchId: string,
  tableName: string,
): Promise<string | null> {
  try {
    const response = await api.get<ApiTable[]>("/tables/", {
      branch_id: branchId,
    });
    if (response.error || !response.data) {
      console.warn(
        "[OrderService] Tables could not be loaded:",
        response.error,
      );
      return null;
    }

    const tables = extractArray<ApiTable>(response.data);
    const matchedTable = tables.find(
      (t) => t.name.toLowerCase() === tableName.toLowerCase(),
    );
    return matchedTable ? matchedTable.id : null;
  } catch (err) {
    console.warn("[OrderService] Error resolving table UUID:", err);
    return null;
  }
}

/**
 * Fetches all orders for a specific table UUID from the backend.
 */
export async function fetchOrdersForTable(tableId: string): Promise<Order[]> {
  const response = await api.get<ApiOrder[]>("/orders/main/", {
    table_id: tableId,
  });
  if (response.error || !response.data) {
    console.warn("[OrderService] Orders could not be loaded:", response.error);
    throw new Error(response.error || "Siparişler yüklenemedi");
  }
  return extractArray<ApiOrder>(response.data).map(mapApiOrder);
}

/**
 * Places a new order against the RAMIS backend.
 */
export async function submitOrder(
  branchId: string,
  tableId: string,
  items: CartItem[],
  note?: string,
  idempotencyKey?: string,
): Promise<Order | null> {
  const payload = {
    branch_id: branchId,
    table_id: tableId,
    order_type: "TABLE",
    notes: note || "",
    items: items.map((item) => ({
      product_id: item.productId,
      variant_id: item.variant?.id || null,
      quantity: item.quantity,
      unit_price: item.unitPrice.toFixed(4),
      unit_name: item.unit.name,
      notes: item.note || "",
      modifier_ids: item.modifiers.map((m) => m.modifierId),
    })),
  };

  const postOptions = idempotencyKey
    ? { headers: { "Idempotency-Key": idempotencyKey } }
    : undefined;

  const response = await api.post<IdempotentOrderCreateResponse>(
    "/orders/main/",
    payload,
    postOptions,
  );

  if (response.status === 409) {
    console.error("[OrderService] Idempotency conflict:", response.error);
    throw new Error(
      response.error ||
        "Sipariş zaten gönderilmiş veya çakışan bir istek var. Lütfen siparişlerinizi kontrol edin.",
    );
  }

  if (response.error || !response.data) {
    console.error("[OrderService] Order could not be placed:", response.error);
    throw new Error(response.error || "Sipariş oluşturulamadı");
  }

  const orderPayload = unwrapOrderCreateResponse(response.data);
  return mapApiOrder(orderPayload as ApiOrder);
}

/**
 * Triggers a waiter call for a given table UUID on the backend.
 */
export async function triggerWaiterCall(
  tableId: string,
  message?: string,
): Promise<WaiterCallApiResponse> {
  const id = tableId.trim();
  if (!isValidTableUuid(id)) {
    throw new Error("Geçersiz masa kimliği (table_id UUID olmalı)");
  }

  const trimmed = message?.trim();
  let path = `/call-waiter/?table_id=${encodeURIComponent(id)}`;
  if (trimmed) {
    path += `&message=${encodeURIComponent(trimmed)}`;
  }

  const response = await api.get<WaiterCallApiResponse>(path);
  if (response.error || !response.data) {
    console.error("[OrderService] Waiter call failed:", response.error);
    throw new Error(response.error || "Garson çağrılamadı");
  }
  return response.data;
}

export interface CancelOrderItemResult {
  success?: boolean;
  id?: string;
  status?: string;
}

/**
 * Cancels a specific order item.
 */
export async function cancelOrderItem(
  itemId: string,
  reasonCode?: string,
  reasonText?: string,
): Promise<CancelOrderItemResult> {
  const response = await api.post<CancelOrderItemResult>(
    `/orders/items/${itemId}/cancel/`,
    {
      reason_code: reasonCode || "CUSTOMER_CANCEL",
      reason_text: reasonText || "Müşteri Smart Table üzerinden iptal etti",
      cancel_source: "smart_table",
    },
  );

  if (response.error) {
    console.error("[OrderService] Order item cancel failed:", response.error);
    throw new Error(response.error || "Sipariş kalemi iptal edilemedi");
  }

  return response.data ?? { success: true };
}
