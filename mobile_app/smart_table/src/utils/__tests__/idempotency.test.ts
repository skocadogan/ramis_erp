import {
  buildOrderCreateIdempotencyKey,
  unwrapOrderCreateResponse,
} from "@/utils/idempotency";
import type { ApiOrder } from "@/types/api";
import type { IdempotentOrderCreateResponse } from "@/utils/idempotency";

describe("buildOrderCreateIdempotencyKey", () => {
  it("uses pos:create prefix compatible with backend", () => {
    expect(buildOrderCreateIdempotencyKey("abc-123")).toBe(
      "pos:create:abc-123",
    );
  });
});

describe("unwrapOrderCreateResponse", () => {
  it("extracts order from idempotent envelope", () => {
    const order: ApiOrder = {
      id: "order-1",
      status: "PENDING",
      table: "table-1",
      created_at: "2024-01-01T00:00:00Z",
    };
    expect(
      unwrapOrderCreateResponse({
        status: "created",
        idempotency_key: "pos:create:xyz",
        order,
      }),
    ).toEqual(order);
  });

  it("returns raw payload when envelope is absent", () => {
    const raw: ApiOrder = {
      id: "order-2",
      status: "PENDING",
      table: "table-2",
      created_at: "2024-01-01T00:00:00Z",
    };
    expect(
      unwrapOrderCreateResponse(
        raw as unknown as IdempotentOrderCreateResponse,
      ),
    ).toEqual(raw);
  });
});
