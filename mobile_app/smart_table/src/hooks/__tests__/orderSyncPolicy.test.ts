import { payloadTargetsAnotherTable } from "../orderSyncPolicy";

describe("payloadTargetsAnotherTable", () => {
  it("table_id eksik legacy invalidasyonu güvenli kabul eder", () => {
    expect(
      payloadTargetsAnotherTable({ reason: "orders_changed" }, "table-1"),
    ).toBe(false);
  });

  it("başka masaya ait kapsamlı olayı reddeder", () => {
    expect(
      payloadTargetsAnotherTable({ table_id: "table-2" }, "table-1"),
    ).toBe(true);
  });

  it("mevcut masaya ait kapsamlı olayı kabul eder", () => {
    expect(
      payloadTargetsAnotherTable({ tableId: "table-1" }, "table-1"),
    ).toBe(false);
  });
});
