// ============================================================
// Smart Table — useBackendHealthStore birim testleri
// ============================================================

import { act } from "react-test-renderer";

// Store modülünü her testten ÖNCE import ediyoruz; auth-store
// mock'lanmalı çünkü store ondan serverUrl/token okuyor.
jest.mock("@/store/auth-store", () => {
  type MockZustandHook = jest.Mock & {
    getState: jest.Mock;
    setState: jest.Mock;
    subscribe: jest.Mock;
  };

  const hook = jest.fn() as unknown as MockZustandHook;
  hook.getState = jest.fn();
  hook.setState = jest.fn();
  hook.subscribe = jest.fn(() => () => {});
  return { useAuthStore: hook };
});

import { useBackendHealthStore } from "@/store/useBackendHealthStore";
import { useAuthStore } from "@/store/auth-store";

const mockAuth = useAuthStore as unknown as { getState: jest.Mock };

const okResponse = (ok = true, status = 200): Response =>
  ({
    ok,
    status,
  }) as Response;

describe("useBackendHealthStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // fetch'in sahte uyarlaması — testler kendileri mock'larlar.
    global.fetch = jest.fn();
    mockAuth.getState.mockReturnValue({
      serverUrl: "http://api.test",
      token: "tok",
    });
    // Store'u sıfırla
    useBackendHealthStore.setState({
      status: "checking",
      failCount: 0,
      lastOkAt: null,
    });
  });

  // ─── recordSuccess ─────────────────────────────────────────

  describe("recordSuccess()", () => {
    it("status=ok, failCount=0, lastOkAt set eder", () => {
      useBackendHealthStore.setState({
        status: "down",
        failCount: 3,
        lastOkAt: null,
      });

      act(() => {
        useBackendHealthStore.getState().recordSuccess();
      });

      const s = useBackendHealthStore.getState();
      expect(s.status).toBe("ok");
      expect(s.failCount).toBe(0);
      expect(typeof s.lastOkAt).toBe("number");
      expect(s.lastOkAt).toBeGreaterThan(0);
    });

    it("zaten ok ise no-op (abonelikleri gereksiz tetiklemez)", () => {
      useBackendHealthStore.setState({
        status: "ok",
        failCount: 0,
        lastOkAt: 12345,
      });
      const before = useBackendHealthStore.getState();

      act(() => {
        useBackendHealthStore.getState().recordSuccess();
      });

      const after = useBackendHealthStore.getState();
      expect(after.status).toBe("ok");
      expect(after.lastOkAt).toBe(12345);
      // Aynı referans olmalı — store set edilmedi
      expect(after).toBe(before);
    });
  });

  // ─── setStatus ─────────────────────────────────────────────

  describe("setStatus()", () => {
    it("status'u değiştirir, failCount'i sıfırlar", () => {
      useBackendHealthStore.setState({ status: "down", failCount: 2 });

      act(() => {
        useBackendHealthStore.getState().setStatus("checking");
      });

      const s = useBackendHealthStore.getState();
      expect(s.status).toBe("checking");
      expect(s.failCount).toBe(0);
    });

    it("lastOkAt'a dokunmaz", () => {
      useBackendHealthStore.setState({
        status: "ok",
        failCount: 0,
        lastOkAt: 999,
      });

      act(() => {
        useBackendHealthStore.getState().setStatus("down");
      });

      expect(useBackendHealthStore.getState().lastOkAt).toBe(999);
    });
  });

  // ─── checkHealth — başarılı yol ────────────────────────────

  describe("checkHealth() — başarı", () => {
    it("ok yanıtta recordSuccess çağırır", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(okResponse(true));

      let result: boolean | undefined;
      await act(async () => {
        result = await useBackendHealthStore.getState().checkHealth();
      });

      expect(result).toBe(true);
      const s = useBackendHealthStore.getState();
      expect(s.status).toBe("ok");
      expect(s.failCount).toBe(0);
      expect(s.lastOkAt).not.toBeNull();
    });

    it("doğru endpoint ve method kullanır", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(okResponse(true));

      await act(async () => {
        await useBackendHealthStore.getState().checkHealth();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "http://api.test/api/v1/health/",
        expect.objectContaining({ method: "GET" }),
      );
    });
  });

  // ─── checkHealth — başarısız yol ───────────────────────────

  describe("checkHealth() — hata", () => {
    it("network error → failCount artar", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error("network"));

      await act(async () => {
        await useBackendHealthStore.getState().checkHealth();
      });

      const s = useBackendHealthStore.getState();
      expect(s.failCount).toBe(1);
    });

    it("checking → 1 hata yeterli: status=down olur", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error("network"));
      useBackendHealthStore.setState({ status: "checking", failCount: 0 });

      await act(async () => {
        await useBackendHealthStore.getState().checkHealth();
      });

      expect(useBackendHealthStore.getState().status).toBe("down");
    });

    it("ok → 1 hata yeterli değil: status=ok kalır (eşik=2)", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error("network"));
      useBackendHealthStore.setState({ status: "ok", failCount: 0 });

      await act(async () => {
        await useBackendHealthStore.getState().checkHealth();
      });

      expect(useBackendHealthStore.getState().status).toBe("ok");
      expect(useBackendHealthStore.getState().failCount).toBe(1);
    });

    it("ok → 2 hata → down olur", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error("network"));
      useBackendHealthStore.setState({ status: "ok", failCount: 0 });

      await act(async () => {
        await useBackendHealthStore.getState().checkHealth();
        await useBackendHealthStore.getState().checkHealth();
      });

      expect(useBackendHealthStore.getState().status).toBe("down");
      expect(useBackendHealthStore.getState().failCount).toBe(2);
    });

    it("HTTP 500 → hata olarak işlenir", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(okResponse(false, 500));
      useBackendHealthStore.setState({ status: "checking", failCount: 0 });

      await act(async () => {
        await useBackendHealthStore.getState().checkHealth();
      });

      expect(useBackendHealthStore.getState().status).toBe("down");
    });
  });

  // ─── checkHealth — kimlik bilgisi eksik ─────────────────────

  describe("checkHealth() — kimlik bilgisi yok", () => {
    it("serverUrl yoksa status=down olur", async () => {
      mockAuth.getState.mockReturnValue({ serverUrl: null, token: "tok" });

      await act(async () => {
        await useBackendHealthStore.getState().checkHealth();
      });

      expect(useBackendHealthStore.getState().status).toBe("down");
    });

    it("token yoksa status=down olur", async () => {
      mockAuth.getState.mockReturnValue({
        serverUrl: "http://api.test",
        token: null,
      });

      await act(async () => {
        await useBackendHealthStore.getState().checkHealth();
      });

      expect(useBackendHealthStore.getState().status).toBe("down");
    });
  });

  // ─── in-flight dedup ───────────────────────────────────────

  describe("in-flight dedup", () => {
    it("eşzamanlı çağrılar aynı fetch promiseini paylaşır", async () => {
      let resolveFn: (v: Response) => void = () => {};
      const pending = new Promise<Response>((r) => {
        resolveFn = r;
      });
      (global.fetch as jest.Mock).mockReturnValue(pending);

      let p1: Promise<boolean>;
      let p2: Promise<boolean>;
      act(() => {
        p1 = useBackendHealthStore.getState().checkHealth();
        p2 = useBackendHealthStore.getState().checkHealth();
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveFn(okResponse(true));
        await p1!;
        await p2!;
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
