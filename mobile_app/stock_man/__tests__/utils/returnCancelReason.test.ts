import {
  movementLineTotal,
  parseMovementMoney,
  summarizeReturnCancelRows,
} from "@/utils/returnCancelReason";

describe("returnCancelReason money helpers", () => {
  it("parseMovementMoney coerces API decimal strings", () => {
    expect(parseMovementMoney("18.50")).toBe(18.5);
    expect(parseMovementMoney("2.000000")).toBe(2);
    expect(parseMovementMoney(undefined)).toBe(0);
  });

  it("movementLineTotal multiplies parsed quantity and unit price", () => {
    expect(
      movementLineTotal({ quantity: "2.000000", unit_price: "18.50" })
    ).toBe(37);
  });

  it("summarizeReturnCancelRows aggregates parsed rows", () => {
    const summary = summarizeReturnCancelRows([
      { quantity: "1.5", unit_price: "10" },
      { quantity: 2, unit_price: "5.25" },
    ]);
    expect(summary.totalQty).toBe(3.5);
    expect(summary.totalAmount).toBe(25.5);
  });
});
