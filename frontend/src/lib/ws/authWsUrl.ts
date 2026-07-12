import { useAuthStore } from "@/store/useAuthStore";
import { getBackendWsHost, getWsProtocol } from "@/lib/wsBackendHost";
import type { AuthUser } from "@/types/user.types";

/**
 * Kullanıcı modelinde `branch` (istemci: `branch_id`) boş olsa da RBAC'te tek şube varsa
 * bu şubeyi döndürür. `/auth/me/branch` + `available_branches` hizası WebSocket
 * `resolveBranchIdFromAuthStore` ile aynı olmalıdır.
 */
export function getPrimaryBranchIdForSession(
  user: AuthUser | null | undefined
): string {
  if (!user) return "";
  const bid = user.branch_id?.trim();
  if (bid) return bid;
  if (user.is_superuser) return "";
  const ab = user.available_branches;
  if (ab && ab.length === 1) return ab[0]!.id;
  return "";
}

function resolveBranchIdFromAuthStore(): string | undefined {
  const user = useAuthStore.getState().user;
  if (!user) return undefined;
  if (user.is_superuser) return undefined;
  const p = getPrimaryBranchIdForSession(user);
  return p || undefined;
}

/**
 * WebSocket `branch_id` sorgu parametresi: önce açıkça verilen, yoksa oturumdaki şube / tek erişilebilir şube.
 * Süper kullanıcıda `undefined` döner (backend tüm şubeler için global kanal).
 */
export function resolveBranchIdForWs(explicit?: string | null): string | undefined {
  const e = explicit?.trim();
  if (e) return e;
  return resolveBranchIdFromAuthStore();
}

interface BuildWsUrlOptions {
  basePath: string;
  branchId?: string | null;
  terminalId?: string | null;
  platform?: string | null;
}

function buildWsUrl(options: BuildWsUrlOptions): string {
  const { basePath, branchId, terminalId, platform } = options;

  const host = getBackendWsHost();
  const protocol = getWsProtocol();
  const baseUrl = `${protocol}//${host}${basePath}`;

  try {
    const url = new URL(baseUrl);

    const token = useAuthStore.getState().token;
    if (token) {
      url.searchParams.set("token", token);
    }

    const resolved = resolveBranchIdForWs(branchId);
    if (resolved) {
      url.searchParams.set("branch_id", resolved);
    }
    if (terminalId) {
      url.searchParams.set("terminal_id", terminalId);
    }
    if (platform) {
      url.searchParams.set("platform", platform);
    }

    return url.toString();
  } catch {
    return baseUrl;
  }
}

export function getKitchenNotificationsWsUrl(branchId?: string): string {
  return buildWsUrl({ basePath: "/ws/kitchen/notifications/", branchId });
}

/** Login gerektirmeyen hazırlık kiosk ekranı WebSocket. */
export function getPrepDisplayKitchenNotificationsWsUrl(
  branchId: string,
  displayToken: string,
): string {
  const host = getBackendWsHost();
  const protocol = getWsProtocol();
  const url = new URL(`${protocol}//${host}/ws/kitchen/notifications/`);
  url.searchParams.set("branch_id", branchId);
  url.searchParams.set("prep_display_token", displayToken);
  return url.toString();
}

/** Misafir geldi vb. — KDS, pos/sync ve akıllı buton garson çağrısı kanallarından ayrı. */
export function getStaffNotificationsWsUrl(branchId?: string): string {
  return buildWsUrl({ basePath: "/ws/staff/notifications/", branchId });
}

/** Akıllı buton garson çağrısı — personel bildirim / yazıcı API'sinden bağımsız. */
export function getWaiterCallsWsUrl(branchId?: string): string {
  return buildWsUrl({ basePath: "/ws/waiter/calls/", branchId });
}

export function getMenuCatalogWsUrl(): string {
  return buildWsUrl({ basePath: "/ws/menu/catalog/" });
}

export function getPosSyncWsUrl(branchId?: string, terminalId?: string, platform?: "web" | "mobile"): string {
  return buildWsUrl({ basePath: "/ws/pos/sync/", branchId, terminalId, platform });
}

export function getWarehouseNotificationsWsUrl(branchId?: string): string {
  return buildWsUrl({ basePath: "/ws/warehouse/notifications/", branchId });
}

export type PosDisplayWsMode = "publisher" | "subscriber";

/**
 * Kasa → müşteri ekranı kanalı.
 * - publisher: JWT query (pos.view_pos) — sepet güncellemesi gönderebilir.
 * - subscriber: imzalı display_token — yalnızca dinler.
 */
export function getPosDisplayWsUrl(
  terminalId: string,
  options?: { mode?: PosDisplayWsMode; displayToken?: string | null }
): string {
  const seg = encodeURIComponent(String(terminalId));
  const host = getBackendWsHost();
  const protocol = getWsProtocol();
  const base = `${protocol}//${host}/ws/pos/display/${seg}/`;
  const mode = options?.mode ?? "subscriber";
  if (mode === "publisher") {
    const token = useAuthStore.getState().token;
    if (!token) return base;
    return `${base}?token=${encodeURIComponent(token)}`;
  }
  const dt = options?.displayToken?.trim();
  if (!dt) {
    return base;
  }
  return `${base}?display_token=${encodeURIComponent(dt)}`;
}

export function getProductionStatusWsUrl(branchId: string): string {
  return buildWsUrl({ basePath: `/ws/production-status/${encodeURIComponent(branchId)}/` });
}
