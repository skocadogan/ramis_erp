// Sipariş oluşturma — backend POS idempotency sözleşmesi (pos:create:*)

export function randomUUID(): string {
  const cryptoObj = globalThis.crypto as
    | { getRandomValues?: (arr: Uint8Array) => Uint8Array; randomUUID?: () => string }
    | undefined;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
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
