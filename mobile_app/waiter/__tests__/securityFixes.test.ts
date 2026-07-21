import { shouldRetryTransientRequest } from "../src/api/httpRetry";
import { buildWsUrl } from "../src/api/wsUrl";
import { effectiveBranchId, tableMatchesBranch } from "../src/utils/branchScope";
import { resolveNonNetworkQueueStatus } from "../src/features/offline/queueStatus";

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
