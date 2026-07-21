import { stableIdempotencyKey } from "@/lib/offline/useOfflineMutation";

describe("stableIdempotencyKey", () => {
  it("is stable for identical inputs", () => {
    const a = stableIdempotencyKey({
      feature: "transfer",
      method: "POST",
      endpoint: "/warehouse/transfers/1/complete/",
      payload: undefined,
    });
    const b = stableIdempotencyKey({
      feature: "transfer",
      method: "POST",
      endpoint: "/warehouse/transfers/1/complete/",
      payload: undefined,
    });
    expect(a).toBe(b);
  });

  it("changes when endpoint changes", () => {
    const a = stableIdempotencyKey({
      feature: "transfer",
      method: "POST",
      endpoint: "/warehouse/transfers/1/complete/",
      payload: null,
    });
    const b = stableIdempotencyKey({
      feature: "transfer",
      method: "POST",
      endpoint: "/warehouse/transfers/2/complete/",
      payload: null,
    });
    expect(a).not.toBe(b);
  });
});

describe("SavedServer shape (no password)", () => {
  it("sanitizes password out of legacy saved server objects", () => {
    const sanitize = (raw: unknown) => {
      if (!Array.isArray(raw)) return [];
      return raw
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const o = item as Record<string, unknown>;
          const url = typeof o.url === "string" ? o.url.trim() : "";
          const username = typeof o.username === "string" ? o.username.trim() : "";
          if (!url) return null;
          return { url, username };
        })
        .filter(Boolean);
    };
    const out = sanitize([
      { url: "https://x/api/v1", username: "a", password: "secret" },
    ]);
    expect(out).toEqual([{ url: "https://x/api/v1", username: "a" }]);
    expect((out[0] as Record<string, unknown>).password).toBeUndefined();
  });
});

describe("buildWsUrl ticket preference", () => {
  function buildWsUrl(serverUrl: string, branchId: string | null, ticket: string): string {
    const rootUrl = serverUrl.trim().replace(/\/api\/v1\/?$/i, "");
    const base = rootUrl.replace(/\/$/, "").replace(/^http/, "ws");
    const params = new URLSearchParams();
    if (branchId) params.set("branch_id", branchId);
    params.set("ticket", ticket);
    params.set("platform", "mobile");
    return `${base}/ws/warehouse/notifications/?${params.toString()}`;
  }

  it("uses ticket not jwt token", () => {
    const url = buildWsUrl("https://example.com/api/v1", "b1", "ticket-xyz");
    expect(url).toContain("ticket=ticket-xyz");
    expect(url).not.toContain("token=");
  });
});
