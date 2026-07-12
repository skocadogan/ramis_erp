// ============================================================
// Stock Man — usePermissionStore birim testleri
// ============================================================
//
// Saf türetilmiş state: useAuthStore.user.permissions'tan
// boolean üretir. Store mock'lanmaz, gerçek auth store'a
// setState ile farklı user profilleri enjekte edilir.
// ============================================================

import { useAuthStore, type AuthUser } from "@/store/useAuthStore";
import { usePermissionStore } from "@/store/usePermissionStore";

function setUser(perms: string[] | undefined): void {
  const user: AuthUser = {
    id: "u-1",
    username: "tester",
    permissions: perms,
  };
  useAuthStore.setState({ user });
}

beforeEach(() => {
  setUser([]);
});

describe("has(code)", () => {
  it("kullanıcı yoksa false", () => {
    useAuthStore.setState({ user: null });
    expect(usePermissionStore.getState().has("inventory.manage_stock_item")).toBe(false);
  });

  it("izin listesinde yoksa false", () => {
    setUser(["warehouse.view_purchase_order"]);
    expect(usePermissionStore.getState().has("inventory.manage_stock_item")).toBe(false);
  });

  it("izin listesinde varsa true", () => {
    setUser(["inventory.manage_stock_item"]);
    expect(usePermissionStore.getState().has("inventory.manage_stock_item")).toBe(true);
  });

  it("superuser wildcard her şeyi verir", () => {
    setUser(["superuser"]);
    expect(usePermissionStore.getState().has("inventory.manage_stock_item")).toBe(true);
    expect(usePermissionStore.getState().has("warehouse.approve_purchase_order")).toBe(true);
    expect(usePermissionStore.getState().has("any.arbitrary.code")).toBe(true);
  });

  it("user.permissions undefined ise boş kabul edilir", () => {
    setUser(undefined);
    expect(usePermissionStore.getState().has("x.y")).toBe(false);
  });
});

describe("canViewAmounts()", () => {
  it("financial.view_amount yoksa false", () => {
    setUser(["inventory.manage_stock_item"]);
    expect(usePermissionStore.getState().canViewAmounts()).toBe(false);
  });

  it("financial.view_amount varsa true", () => {
    setUser(["financial.view_amount"]);
    expect(usePermissionStore.getState().canViewAmounts()).toBe(true);
  });

  it("superuser true", () => {
    setUser(["superuser"]);
    expect(usePermissionStore.getState().canViewAmounts()).toBe(true);
  });
});

describe("canManage(module)", () => {
  it("'warehouse' + warehouse.manage varsa true", () => {
    setUser(["warehouse.manage"]);
    expect(usePermissionStore.getState().canManage("warehouse")).toBe(true);
  });

  it("'inventory' + inventory.manage yoksa false", () => {
    setUser(["warehouse.manage"]);
    expect(usePermissionStore.getState().canManage("inventory")).toBe(false);
  });

  it("superuser her modülü yönetir", () => {
    setUser(["superuser"]);
    expect(usePermissionStore.getState().canManage("warehouse")).toBe(true);
    expect(usePermissionStore.getState().canManage("inventory")).toBe(true);
    expect(usePermissionStore.getState().canManage("random_module")).toBe(true);
  });

  it("user yoksa false", () => {
    useAuthStore.setState({ user: null });
    expect(usePermissionStore.getState().canManage("warehouse")).toBe(false);
  });
});

describe("hasAny(codes)", () => {
  it("hiçbir kod eşleşmiyorsa false", () => {
    setUser(["warehouse.view_warehouse"]);
    expect(usePermissionStore.getState().hasAny(["inventory.manage", "financial.view_amount"])).toBe(false);
  });

  it("en az bir kod eşleşiyorsa true", () => {
    setUser(["financial.view_amount"]);
    expect(usePermissionStore.getState().hasAny(["inventory.manage", "financial.view_amount"])).toBe(true);
  });

  it("boş array → false", () => {
    setUser(["anything"]);
    expect(usePermissionStore.getState().hasAny([])).toBe(false);
  });

  it("superuser → true", () => {
    setUser(["superuser"]);
    expect(usePermissionStore.getState().hasAny(["a", "b", "c"])).toBe(true);
  });

  it("user.permissions undefined ise false", () => {
    setUser(undefined);
    expect(usePermissionStore.getState().hasAny(["a", "b"])).toBe(false);
  });
});
