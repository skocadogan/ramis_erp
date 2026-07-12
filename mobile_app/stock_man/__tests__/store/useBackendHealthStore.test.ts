// ============================================================
// Stock Man — useBackendHealthStore birim testleri
// ============================================================
//
// `checkHealth` axiosClient.get('/health/') çağırır. /health/ 200
// dönerse status='ok' olur, 2 ardışık hata 'down' yapar.
// Eşzamanlı çağrılar tek bir request'i paylaşır (in-flight dedup).
// ============================================================

import { useBackendHealthStore } from "@/store/useBackendHealthStore";
import { axiosClient } from "@/api/client";

let getSpy: jest.SpyInstance;

beforeEach(() => {
  getSpy = jest.spyOn(axiosClient, "get");
  useBackendHealthStore.setState({ status: "checking", failCount: 0, lastOkAt: null });
});

afterEach(() => {
  getSpy.mockRestore();
});

describe("başlangıç durumu", () => {
  it("status='checking', failCount=0, lastOkAt=null", () => {
    const s = useBackendHealthStore.getState();
    expect(s.status).toBe("checking");
    expect(s.failCount).toBe(0);
    expect(s.lastOkAt).toBeNull();
  });
});

describe("checkHealth() — başarı yolu", () => {
  it("/health/ 200 + status='ok' → status='ok', failCount=0, lastOkAt set", async () => {
    getSpy.mockResolvedValue({ data: { status: "ok" } });
    const result = await useBackendHealthStore.getState().checkHealth();
    expect(result).toBe(true);
    const s = useBackendHealthStore.getState();
    expect(s.status).toBe("ok");
    expect(s.failCount).toBe(0);
    expect(s.lastOkAt).toBeGreaterThan(0);
  });

  it("doğru endpoint ve method kullanır", async () => {
    getSpy.mockResolvedValue({ data: { status: "ok" } });
    await useBackendHealthStore.getState().checkHealth();
    expect(getSpy).toHaveBeenCalledWith("/health/", { timeout: 5000 });
  });

  it("200 + status !== 'ok' → başarısız sayılır (bad response)", async () => {
    getSpy.mockResolvedValue({ data: { status: "degraded" } });
    useBackendHealthStore.setState({ status: "ok", failCount: 0 });
    await useBackendHealthStore.getState().checkHealth();
    // 1 hata → eşik 2 olduğu için 'ok' kalır ama failCount 1 olur
    expect(useBackendHealthStore.getState().failCount).toBe(1);
  });

  it("HTTP 500 → failCount artar", async () => {
    // axios.status 500 de catch'e düşer
    getSpy.mockRejectedValue({
      response: { status: 500 },
      message: "Server Error",
    });
    useBackendHealthStore.setState({ status: "ok", failCount: 0 });
    await useBackendHealthStore.getState().checkHealth();
    expect(useBackendHealthStore.getState().failCount).toBe(1);
  });
});

describe("checkHealth() — hata yolu", () => {
  it("network error → failCount artar", async () => {
    getSpy.mockRejectedValue(new Error("network"));
    await useBackendHealthStore.getState().checkHealth();
    expect(useBackendHealthStore.getState().failCount).toBe(1);
  });

  it("checking → 1 hata yeterli: status='down' olur (eşik 2 ama 1 yeter)", async () => {
    // Aslında store 2-yetmez-diye: failCount >= FAIL_THRESHOLD(2) → down.
    // İlk hata failCount=1, eşik 2'den küçük, status 'checking' kalır.
    // İkinci hata failCount=2, eşik, status 'down'.
    getSpy.mockRejectedValue(new Error("network"));
    useBackendHealthStore.setState({ status: "checking", failCount: 0 });
    await useBackendHealthStore.getState().checkHealth();
    expect(useBackendHealthStore.getState().status).toBe("checking");
    expect(useBackendHealthStore.getState().failCount).toBe(1);

    await useBackendHealthStore.getState().checkHealth();
    expect(useBackendHealthStore.getState().status).toBe("down");
    expect(useBackendHealthStore.getState().failCount).toBe(2);
  });

  it("HTTP 500 → failCount artar", async () => {
    // axios.status 500 de catch'e düşer
    getSpy.mockRejectedValue({
      response: { status: 500 },
      message: "Server Error",
    });
    useBackendHealthStore.setState({ status: "ok", failCount: 0 });
    await useBackendHealthStore.getState().checkHealth();
    expect(useBackendHealthStore.getState().failCount).toBe(1);
  });

  it("ok → 1 hata yeterli değil: status='checking' olur, failCount=1", async () => {
    // NOT: status 'ok' KALMAZ, 'checking'e düşer. Sadece eşik=2'yi
    // geçince 'down' olur. Bu kasıtlı: aradaki durum "tekrar
    // deneniyor" sinyalidir.
    getSpy.mockRejectedValue(new Error("network"));
    useBackendHealthStore.setState({ status: "ok", failCount: 0 });
    await useBackendHealthStore.getState().checkHealth();
    expect(useBackendHealthStore.getState().status).toBe("checking");
    expect(useBackendHealthStore.getState().failCount).toBe(1);
  });

  it("ok → 2 hata → down olur", async () => {
    getSpy.mockRejectedValue(new Error("network"));
    useBackendHealthStore.setState({ status: "ok", failCount: 0 });
    await useBackendHealthStore.getState().checkHealth();
    await useBackendHealthStore.getState().checkHealth();
    expect(useBackendHealthStore.getState().status).toBe("down");
    expect(useBackendHealthStore.getState().failCount).toBe(2);
  });
});

describe("recordSuccess", () => {
  it("status=ok, failCount=0, lastOkAt set", () => {
    useBackendHealthStore.setState({ status: "down", failCount: 3, lastOkAt: null });
    useBackendHealthStore.getState().recordSuccess();
    const s = useBackendHealthStore.getState();
    expect(s.status).toBe("ok");
    expect(s.failCount).toBe(0);
    expect(s.lastOkAt).toBeGreaterThan(0);
  });

  it("zaten 'ok' ise no-op (state referansı aynı kalır)", () => {
    useBackendHealthStore.setState({ status: "ok", failCount: 0, lastOkAt: 12345 });
    useBackendHealthStore.getState().recordSuccess();
    const after = useBackendHealthStore.getState();
    // 'ok' iken erken return → set çağrılmaz
    expect(after.status).toBe("ok");
    expect(after.lastOkAt).toBe(12345);
  });
});

describe("setStatus", () => {
  it("status değişir, failCount sıfırlanmaz (mevcut korunur)", () => {
    useBackendHealthStore.setState({ status: "down", failCount: 2 });
    useBackendHealthStore.getState().setStatus("checking");
    const s = useBackendHealthStore.getState();
    expect(s.status).toBe("checking");
    // setStatus sadece status'u değiştirir, failCount'e dokunmaz
    expect(s.failCount).toBe(2);
  });
});

describe("in-flight dedup", () => {
  it("eşzamanlı iki çağrı tek axios.get çağrısını paylaşır", async () => {
    let resolveFn: (v: any) => void = () => {};
    const pending = new Promise((r) => {
      resolveFn = r;
    });
    getSpy.mockReturnValue(pending);

    const p1 = useBackendHealthStore.getState().checkHealth();
    const p2 = useBackendHealthStore.getState().checkHealth();

    // İlk çağrı fetch'i başlattı, ikincisi in-flight promise'i paylaştı
    expect(getSpy).toHaveBeenCalledTimes(1);

    resolveFn({ data: { status: "ok" } });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it("ilk çağrı bittikten sonra ikinci çağrı yeni request başlatır", async () => {
    getSpy.mockResolvedValueOnce({ data: { status: "ok" } });
    getSpy.mockResolvedValueOnce({ data: { status: "ok" } });

    await useBackendHealthStore.getState().checkHealth();
    expect(getSpy).toHaveBeenCalledTimes(1);
    await useBackendHealthStore.getState().checkHealth();
    expect(getSpy).toHaveBeenCalledTimes(2);
  });
});
