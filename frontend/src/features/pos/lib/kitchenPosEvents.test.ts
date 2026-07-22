import { describe, expect, it } from "vitest";
import {
  shouldHttpFallbackPosTables,
  shouldRefreshReadyList,
} from "./kitchenPosEvents";

describe("shouldHttpFallbackPosTables", () => {
  it("order_created → HTTP yedek (paket sanal kart eklenir)", () => {
    expect(
      shouldHttpFallbackPosTables({
        type: "orders_updated",
        data: { reason: "order_created", order_id: "o1" },
      }),
    ).toBe(true);
  });

  it("complete_table → HTTP yedek (paket kart silinir)", () => {
    expect(
      shouldHttpFallbackPosTables({
        type: "orders_updated",
        data: { reason: "complete_table", table_id: "tw-ord__x" },
      }),
    ).toBe(true);
  });

  it("birleşik reasons içinde order_created varsa tetikler", () => {
    expect(
      shouldHttpFallbackPosTables({
        type: "orders_updated",
        data: {
          reason: "firing_force_now",
          reasons: ["order_created", "firing_force_now"],
        },
      }),
    ).toBe(true);
  });

  it("order_status_changed + table_id → fizik masa, fallback yok", () => {
    expect(
      shouldHttpFallbackPosTables({
        type: "order_status_changed",
        data: { table_id: "t1", item_status: "READY" },
      }),
    ).toBe(false);
  });

  it("item_acknowledged → HTTP yedek (paket kartı KITCHEN→SETTLE)", () => {
    expect(
      shouldHttpFallbackPosTables({
        type: "orders_updated",
        data: { reason: "item_acknowledged", order_id: "o1" },
      }),
    ).toBe(true);
  });
});

describe("shouldRefreshReadyList", () => {
  it("READY kalem → mutfak bildirimi yenilenir", () => {
    expect(
      shouldRefreshReadyList({
        type: "order_status_changed",
        data: { item_status: "READY" },
      }),
    ).toBe(true);
  });

  it("PREPARING → ready list yenilenmez", () => {
    expect(
      shouldRefreshReadyList({
        type: "order_status_changed",
        data: { item_status: "PREPARING" },
      }),
    ).toBe(false);
  });
});
