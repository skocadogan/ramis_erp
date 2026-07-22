import {
  applyTableUpdate,
  reconcilePendingCallIds,
} from "../src/hooks/unifiedSyncPolicy";
import type { Table } from "../src/types/models";

const table = (id: string, status = "FREE") =>
  ({ id, name: `Masa ${id}`, status } as unknown as Table);

describe("applyTableUpdate", () => {
  it("delete olayında masayı snapshot'tan kaldırır", () => {
    const result = applyTableUpdate(
      [table("1"), table("2")],
      { id: "1" },
      "delete"
    );

    expect(result.map((item) => item.id)).toEqual(["2"]);
  });

  it("bilinmeyen upsert masasını snapshot'a ekler", () => {
    const result = applyTableUpdate(
      [table("1")],
      { id: "2", name: "Masa 2", status: "OCCUPIED" },
      "upsert"
    );

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ id: "2", status: "OCCUPIED" });
  });

  it("bilinen upsert masasını yerinde günceller", () => {
    const result = applyTableUpdate(
      [table("1")],
      { id: "1", status: "CLEANING" },
      "upsert"
    );

    expect(result[0]).toMatchObject({ id: "1", status: "CLEANING" });
  });
});

describe("reconcilePendingCallIds", () => {
  it("reconnect snapshot'ında yeni ve kapatılmış çağrıları uzlaştırır", () => {
    const result = reconcilePendingCallIds(
      new Set(["still-pending", "dismissed-while-offline"]),
      [{ call_id: "still-pending" }, { call_id: "new-while-offline" }]
    );

    expect([...result.newIds]).toEqual(["new-while-offline"]);
    expect(result.staleIds).toEqual(["dismissed-while-offline"]);
    expect([...result.pendingIds]).toEqual(["still-pending", "new-while-offline"]);
  });
});
