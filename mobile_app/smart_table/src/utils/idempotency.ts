// Sipariş oluşturma — backend POS idempotency sözleşmesi (pos:create:*)

export function randomUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function buildOrderCreateIdempotencyKey(clientOpId: string): string {
  return `pos:create:${clientOpId}`;
}

import type { ApiOrder } from "@/types/api";

export type IdempotentOrderCreateResponse = {
  status?: "created" | "already_processed";
  idempotency_key?: string;
  order?: ApiOrder;
  sale_id?: string | null;
  id?: string;
};

/** Idempotency-Key ile gelen zarf yanıtından sipariş gövdesini çıkarır. */
export function unwrapOrderCreateResponse(
  data: IdempotentOrderCreateResponse,
): ApiOrder {
  if (data.order && typeof data.order === "object") {
    return data.order;
  }
  return data as unknown as ApiOrder;
}
