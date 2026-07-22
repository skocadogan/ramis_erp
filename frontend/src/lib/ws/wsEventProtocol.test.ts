import { afterEach, describe, expect, it } from "vitest";
import {
  acceptWsEvent,
  dedupByEventId,
  parseWsMessage,
  resetWsEventProtocolState,
  shouldApplySequence,
} from "./wsEventProtocol";

afterEach(() => {
  resetWsEventProtocolState();
});

describe("wsEventProtocol", () => {
  it("v2 zarfını normalize eder", () => {
    const parsed = parseWsMessage(
      JSON.stringify({
        type: "order_status_changed",
        version: 2,
        event_id: "evt-1",
        sequence: 5,
        branch_id: "b1",
        item_id: "i1",
        data: { item_status: "READY" },
      }),
    );
    expect(parsed?.type).toBe("order_status_changed");
    expect(parsed?.eventId).toBe("evt-1");
    expect(parsed?.sequence).toBe(5);
    expect(parsed?.branchId).toBe("b1");
    expect(parsed?.itemId).toBe("i1");
  });

  it("table_update action alanını taşır", () => {
    const parsed = parseWsMessage(
      JSON.stringify({
        type: "table_update",
        action: "delete",
        data: { id: "t1" },
      }),
    );
    expect(parsed?.action).toBe("delete");
  });

  it("event_id dedup tekrarları reddeder", () => {
    expect(dedupByEventId("dup-1")).toBe(true);
    expect(dedupByEventId("dup-1")).toBe(false);
    expect(dedupByEventId(undefined)).toBe(true);
  });

  it("eski sequence değerlerini reddeder", () => {
    const key = "branch:1";
    expect(shouldApplySequence(key, 10)).toBe(true);
    expect(shouldApplySequence(key, 10)).toBe(false);
    expect(shouldApplySequence(key, 9)).toBe(false);
    expect(shouldApplySequence(key, 11)).toBe(true);
  });

  it("acceptWsEvent dedup ve sequence birleştirir", () => {
    const raw = {
      type: "orders_updated",
      event_id: "e-99",
      sequence: 1,
      data: { reason: "item_status" },
    };
    expect(acceptWsEvent(raw, "pos:1")).not.toBeNull();
    expect(acceptWsEvent(raw, "pos:1")).toBeNull();
  });
});
