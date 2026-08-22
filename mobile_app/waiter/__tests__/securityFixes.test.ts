import { shouldAttemptTokenRefresh, shouldRetryTransientRequest } from "../src/api/httpRetry";
import { buildWsUrl } from "../src/api/wsUrl";
import { effectiveBranchId, tableMatchesBranch } from "../src/utils/branchScope";
import { isFlushableQueueOperation, resolveNonNetworkQueueStatus } from "../src/features/offline/queueStatus";
import { STALE_SYNCING_MS } from "../src/features/offline/config";
import type { QueuedOperation } from "../src/features/offline/types";

describe("shouldRetryTransientRequest", () => {
  it("retries GET on network error", () => {
    expect(
      shouldRetryTransientRequest({
        method: "get",
        hasResponse: false,
        url: "/tables/",
      })
    ).toBe(true);
  });

  it("does not retry POST without Idempotency-Key", () => {
    expect(
      shouldRetryTransientRequest({
        method: "post",
        hasResponse: false,
        url: "/orders/items/1/cancel/",
      })
    ).toBe(false);
  });

  it("retries POST with Idempotency-Key on 503", () => {
    expect(
      shouldRetryTransientRequest({
        method: "post",
        status: 503,
        hasResponse: true,
        url: "/orders/main/",
        headers: { "Idempotency-Key": "pos:create:abc" },
      })
    ).toBe(true);
  });

  it("skips health and aborted", () => {
    expect(
      shouldRetryTransientRequest({
        method: "get",
        hasResponse: false,
        url: "/health/",
      })
    ).toBe(false);
    expect(
      shouldRetryTransientRequest({
        method: "get",
        hasResponse: false,
        code: "ECONNABORTED",
        url: "/tables/",
      })
    ).toBe(false);
  });
});

describe("buildWsUrl", () => {
  it("uses ticket not jwt token query", () => {
    const url = buildWsUrl(
      "https://example.com/api/v1",
      "/ws/pos/sync/",
      { branch_id: "b1" },
      "ticket-abc"
    );
    expect(url).toContain("ticket=ticket-abc");
    expect(url).not.toContain("token=");
    expect(url.startsWith("wss://example.com/ws/pos/sync/")).toBe(true);
  });
});

describe("branchScope", () => {
  it("prefers activeBranchId", () => {
    expect(effectiveBranchId("u1", "a1")).toBe("a1");
    expect(effectiveBranchId("u1", null)).toBe("u1");
  });

  it("detects branch mismatch", () => {
    expect(tableMatchesBranch("b1", "b1")).toBe(true);
    expect(tableMatchesBranch("b2", "b1")).toBe(false);
    expect(tableMatchesBranch(null, "b1")).toBe(true);
  });
});

describe("resolveNonNetworkQueueStatus", () => {
  it("keeps 5xx pending until max retries", () => {
    expect(resolveNonNetworkQueueStatus(1, 503)).toBe("pending");
    expect(resolveNonNetworkQueueStatus(5, 503)).toBe("failed");
  });

  it("fails 4xx immediately for retry path", () => {
    expect(resolveNonNetworkQueueStatus(1, 400)).toBe("failed");
  });
});

describe("shouldAttemptTokenRefresh", () => {
  it("skips token and register endpoints", () => {
    expect(shouldAttemptTokenRefresh("/auth/token/")).toBe(false);
    expect(shouldAttemptTokenRefresh("/auth/token/refresh/")).toBe(false);
    expect(shouldAttemptTokenRefresh("/auth/register")).toBe(false);
  });

  it("allows refresh for regular API calls", () => {
    expect(shouldAttemptTokenRefresh("/orders/main/")).toBe(true);
    expect(shouldAttemptTokenRefresh("/tables/")).toBe(true);
  });
});

function queueOp(overrides: Partial<QueuedOperation>): QueuedOperation {
  return {
    id: "1",
    clientOpId: "c1",
    type: "CREATE_ORDER",
    idempotencyKey: "pos:create:c1",
    endpoint: "/orders/main/",
    payload: {},
    status: "pending",
    retryCount: 0,
    createdAt: 0,
    updatedAt: 0,
    branchId: "b1",
    label: "test",
    ...overrides,
  };
}

describe("isFlushableQueueOperation", () => {
  const now = 1_000_000;

  it("includes pending and failed", () => {
    expect(isFlushableQueueOperation(queueOp({ status: "pending" }), now)).toBe(true);
    expect(isFlushableQueueOperation(queueOp({ status: "failed" }), now)).toBe(true);
  });

  it("excludes fresh syncing and conflict", () => {
    expect(
      isFlushableQueueOperation(queueOp({ status: "syncing", updatedAt: now - 1_000 }), now)
    ).toBe(false);
    expect(isFlushableQueueOperation(queueOp({ status: "conflict" }), now)).toBe(false);
  });

  it("includes stale syncing after 120s", () => {
    expect(
      isFlushableQueueOperation(
        queueOp({ status: "syncing", updatedAt: now - STALE_SYNCING_MS }),
        now
      )
    ).toBe(true);
  });
});
