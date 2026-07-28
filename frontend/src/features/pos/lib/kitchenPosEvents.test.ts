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

  it("order_status_changed + table_id yok → paket, fallback var", () => {
    expect(
      shouldHttpFallbackPosTables({
        type: "order_status_changed",
        data: { order_id: "o1", item_status: "READY" },
      }),
    ).toBe(true);
  });

  it("item_acknowledged + table_id yok → paket, HTTP yedek", () => {
    expect(
      shouldHttpFallbackPosTables({
        type: "orders_updated",
        data: { reason: "item_acknowledged", order_id: "o1" },
      }),
    ).toBe(true);
  });

  it("item_acknowledged + table_id → fizik masa, fallback yok", () => {
    expect(
      shouldHttpFallbackPosTables({
        type: "orders_updated",
        data: { reason: "item_acknowledged", table_id: "t1", order_id: "o1" },
      }),
    ).toBe(false);
  });

  it("item_status + table_id → fizik masa, fallback yok", () => {
    expect(
      shouldHttpFallbackPosTables({
        type: "orders_updated",
        data: { reason: "item_status", table_id: "t1" },
      }),
    ).toBe(false);
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
