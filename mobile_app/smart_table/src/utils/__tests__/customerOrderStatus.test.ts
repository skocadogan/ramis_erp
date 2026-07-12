import {
  countActiveItems,
  countDeliveredItems,
  deriveCustomerOrderDisplayStatus,
  getDisplayOrderItems,
} from "@/utils/customerOrderStatus";
import type { Order, OrderItem } from "@/types";

function makeOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "item-1",
    orderId: "order-1",
    productId: "product-1",
    productName: "Karma Menü",
    productNameEn: "Combo Menu",
    imageUrl: "",
    quantity: 1,
    unitPrice: 0,
    totalPrice: 0,
    status: "PENDING",
    modifiers: [],
    unitName: "Porsiyon",
    unitNameEn: "Portion",
    combinedParts: [],
    createdAt: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

function makeOrder(items: OrderItem[]): Order {
  return {
    id: "order-1",
    tableId: "table-1",
    tableName: "Masa 1",
    orderType: "TABLE",
    status: "PENDING",
    items,
    totalAmount: 100,
    createdAt: "2026-01-01T10:00:00Z",
    updatedAt: "2026-01-01T10:00:00Z",
  };
}

describe("customerOrderStatus combined item handling", () => {
  it("filters child component rows from display items", () => {
    const parent = makeOrderItem({ id: "parent-1", isCombinedProduct: true });
    const child = makeOrderItem({
      id: "child-1",
      parentItemId: "parent-1",
      productName: "Köfte",
      totalPrice: 0,
    });

    expect(getDisplayOrderItems([parent, child])).toEqual([parent]);
  });

  it("counts only top-level items for progress summaries", () => {
    const topLevelDelivered = makeOrderItem({
      id: "parent-1",
      status: "DELIVERED",
      isCombinedProduct: true,
    });
    const childPreparing = makeOrderItem({
      id: "child-1",
      parentItemId: "parent-1",
      status: "PREPARING",
      productName: "İçecek",
    });
    const regularPending = makeOrderItem({
      id: "item-2",
      status: "PENDING",
      unitPrice: 50,
      totalPrice: 50,
    });

    expect(
      countActiveItems([topLevelDelivered, childPreparing, regularPending]),
    ).toBe(2);
    expect(
      countDeliveredItems([topLevelDelivered, childPreparing, regularPending]),
    ).toBe(1);
  });

  it("derives order status from top-level items only", () => {
    const combinedParent = makeOrderItem({
      id: "parent-1",
      status: "READY",
      waiterAcknowledgedAt: "2026-01-01T10:05:00Z",
      isCombinedProduct: true,
    });
    const childPreparing = makeOrderItem({
      id: "child-1",
      parentItemId: "parent-1",
      status: "PREPARING",
      productName: "Patates",
    });

    const order = makeOrder([combinedParent, childPreparing]);

    expect(deriveCustomerOrderDisplayStatus(order)).toBe("ON_THE_WAY");
  });
});
