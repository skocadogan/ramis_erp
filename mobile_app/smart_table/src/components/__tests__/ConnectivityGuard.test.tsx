// ============================================================
// Smart Table — ConnectivityGuard entegrasyon testleri
// ============================================================

import type { AuthUser } from "@/store/auth-store";

type MockZustandHook = jest.Mock & {
  getState: jest.Mock;
  setState: jest.Mock;
  subscribe: jest.Mock;
};

// ─── Ortak mock'lar (modül yüklenmeden ÖNCE) ─────────────────
// jest.mock factory'leri hoist edilir → fabrika içinde jest.fn
// yaratıp döndürmemiz, testlerde de require üzerinden erişmemiz
// gerekiyor (fabrika dışındaki const referanslar fabrika çalışırken
// henüz tanımsızdır).

jest.mock("expo-router", () => {
  const useSegments = jest.fn(() => []);
  const usePathname = jest.fn(() => "/");
  const replace = jest.fn();
  const push = jest.fn();
  // useRouter her çağrıda yeni obje döndüğü için testlerden erişmek
  // zor olurdu; sabit bir router nesnesine globalThis üzerinden bağla.
  const router = { replace, push };
  (
    globalThis as { __mockRouter?: { replace: jest.Mock; push: jest.Mock } }
  ).__mockRouter = router;
  return {
    useRouter: () => router,
    useSegments,
    usePathname,
  };
});

interface AuthMockState {
  isLoading: boolean;
  isAuthenticated: boolean;
  serverUrl: string | null;
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  logout: jest.Mock;
  setTokens: jest.Mock;
}

interface TableMockState {
  selectedTable: { id: string; name: string } | null;
}

jest.mock("@/store/auth-store", () => {
  // useAuthStore bir Zustand hook'u → fonksiyon + ekli metotlar.
  // Testlerde selector çağrılarını doğru cevaplayabilmesi için
  // minimal bir state tutarız. State'i globalThis'e koyuyoruz ki
  // testlerden doğrudan mutate edilebilsin.
  const state: AuthMockState = ((
    globalThis as { __mockAuthState?: AuthMockState }
  ).__mockAuthState = {
    serverUrl: "http://api.test",
    token: "tok",
    refreshToken: "ref",
    isAuthenticated: true,
    isLoading: false,
    user: null,
    logout: jest.fn().mockResolvedValue(undefined),
    setTokens: jest.fn(),
  });
  state.setTokens.mockImplementation(
    async (access: string, refresh: string) => {
      state.token = access;
      state.refreshToken = refresh;
    },
  );
  const hook = jest.fn((selector?: (s: AuthMockState) => unknown) =>
    selector ? selector(state) : state,
  ) as unknown as MockZustandHook;
  hook.getState = jest.fn(() => state);
  hook.setState = jest.fn(
    (
      partial:
        Partial<AuthMockState> | ((s: AuthMockState) => Partial<AuthMockState>),
    ) => {
      const next = typeof partial === "function" ? partial(state) : partial;
      Object.assign(state, next);
    },
  );
  hook.subscribe = jest.fn(() => () => {});
  return { useAuthStore: hook };
});

jest.mock("@/store/table-store", () => {
  const state: TableMockState = ((
    globalThis as { __mockTableState?: TableMockState }
  ).__mockTableState = {
    selectedTable: null,
  });
  const hook = jest.fn((selector?: (s: TableMockState) => unknown) =>
    selector ? selector(state) : state,
  ) as unknown as MockZustandHook;
  hook.getState = jest.fn(() => state);
  hook.setState = jest.fn(
    (
      partial:
        | Partial<TableMockState>
        | ((s: TableMockState) => Partial<TableMockState>),
    ) => {
      const next = typeof partial === "function" ? partial(state) : partial;
      Object.assign(state, next);
    },
  );
  hook.subscribe = jest.fn(() => () => {});
  return { useTableStore: hook };
});

jest.mock("@/store/useBackendHealthStore", () => {
  // Gerçek store'u kullan ki davranışı test edelim.
  return jest.requireActual("@/store/useBackendHealthStore");
});

jest.mock("@/store/order-store", () => {
  const fetchOrders = jest.fn().mockResolvedValue(undefined);
  const hook = jest.fn(() => ({
    fetchOrders,
  })) as unknown as MockZustandHook;
  hook.getState = jest.fn(() => ({ fetchOrders }));
  hook.setState = jest.fn();
  hook.subscribe = jest.fn(() => () => {});
  return { useOrderStore: hook };
});

// ─── Testler ─────────────────────────────────────────────────

import React from "react";
import { AppState } from "react-native";
import {
  render,
  waitFor,
  act,
  fireEvent,
  cleanup,
  screen,
} from "@testing-library/react-native";
import * as ExpoRouter from "expo-router";
import ConnectivityGuard from "@/components/ConnectivityGuard";
import { useBackendHealthStore } from "@/store/useBackendHealthStore";
import { useOrderStore } from "@/store/order-store";

const mockUseSegments = ExpoRouter.useSegments as unknown as jest.Mock;
const mockUsePathname = ExpoRouter.usePathname as unknown as jest.Mock;
// useRouter fabrika içinde sabit bir router nesnesi döndürüyor; onu
// globalThis üzerinden paylaşıyoruz ki testler replace/push'i
// gözlemleyebilsin.
const mockRouter = (
  globalThis as { __mockRouter?: { replace: jest.Mock; push: jest.Mock } }
).__mockRouter;
const mockReplace = mockRouter?.replace ?? jest.fn();

const mockOrderGetState = (useOrderStore as unknown as MockZustandHook)
  .getState;

const mockAuthState = (globalThis as { __mockAuthState?: AuthMockState })
  .__mockAuthState!;

const mockTableState = (globalThis as { __mockTableState?: TableMockState })
  .__mockTableState!;

const MODAL_TITLE = "Bağlantı Koptu";

describe("ConnectivityGuard", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Önceki testten kalan bileşen varsa temizle (abonelik sızıntısı)
    cleanup();
    jest.clearAllMocks();
    mockUseSegments.mockReturnValue([]);
    mockUsePathname.mockReturnValue("/");
    // Default: isLoading=true → useConnectivityMonitor'ın auto-login
    // dalı tetiklenmez, böylece periyodik health-check ve modal
    // davranışı izole biçimde test edilebilir.
    mockAuthState.isLoading = true;
    mockAuthState.isAuthenticated = true;
    mockAuthState.serverUrl = "http://api.test";
    mockAuthState.token = "tok";
    mockAuthState.refreshToken = "ref";
    mockAuthState.user = null;
    mockTableState.selectedTable = null;
    mockAuthState.logout = jest.fn().mockResolvedValue(undefined);
    mockAuthState.setTokens = jest.fn(
      async (access: string, refresh: string) => {
        mockAuthState.token = access;
        mockAuthState.refreshToken = refresh;
      },
    );
    // Testlerde fetch'i global olarak mock'la; ConnectivityGuard
    // /api/v1/health/'e doğrudan istek atabilir.
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    // AppState.addEventListener'ı spy'la ki 'change' listener'ını
    // yakalayabilelim. jest.clearAllMocks() otomatik olarak bunu da
    // sıfırlar, ama clear() daha açık.
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation(
        (
          _type: string,
          _handler: Parameters<typeof AppState.addEventListener>[1],
        ): ReturnType<typeof AppState.addEventListener> => ({
          remove: jest.fn(),
        }),
      );
    // Store reset — bağlı bileşen olmadığından act() gerektirmez.
    useBackendHealthStore.setState({
      status: "checking",
      failCount: 0,
      lastOkAt: null,
    });
  });

  afterEach(() => {
    // Bileşeni temizle ki useEffect cleanup'ları çalışsın — bu
    // setInterval'ları da iptal eder, böylece worker process'in
    // "did not exit" uyarısı gelmez. Kalan setTimeout'lar da
    // unmount sonrası no-op'a düşer.
    cleanup();
    jest.useRealTimers();
  });

  it("mount olur, crash etmez", () => {
    mockUseSegments.mockReturnValue(["(tabs)", "menu"]);
    mockOrderGetState.mockReturnValue({
      fetchOrders: jest.fn().mockResolvedValue(undefined),
    });

    // render çağrısı sync olarak bir test renderer oluşturur;
    // herhangi bir hata fırlatmaması yeterli — async act() sarmalına
    // gerek yok, çünkü useEffect'ler modal'ı göstermez (status=checking).
    const tree = render(<ConnectivityGuard />);
    expect(tree).toBeTruthy();
  });

  it("health=down + güvenli olmayan rotada modal gösterir", async () => {
    mockUseSegments.mockReturnValue(["(tabs)", "menu"]);
    mockOrderGetState.mockReturnValue({
      fetchOrders: jest.fn().mockResolvedValue(undefined),
    });

    const { queryByText } = render(<ConnectivityGuard />);

    await act(async () => {
      useBackendHealthStore.getState().setStatus("down");
    });

    await waitFor(() => {
      expect(queryByText(MODAL_TITLE)).toBeTruthy();
    });
  });

  it("health=down + login rotasında modal GÖSTERMEZ", async () => {
    mockUseSegments.mockReturnValue(["(auth)", "login"]);
    mockOrderGetState.mockReturnValue({
      fetchOrders: jest.fn().mockResolvedValue(undefined),
    });

    const { queryByText } = render(<ConnectivityGuard />);

    await act(async () => {
      useBackendHealthStore.getState().setStatus("down");
    });

    // Fake timer'larla: 50 ms real bekleme yerine mikro-tick flush.
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    expect(queryByText(MODAL_TITLE)).toBeNull();
  });

  it("health=down + kök index rotasında modal GÖSTERMEZ", async () => {
    mockUseSegments.mockReturnValue([]);
    mockOrderGetState.mockReturnValue({
      fetchOrders: jest.fn().mockResolvedValue(undefined),
    });

    const { queryByText } = render(<ConnectivityGuard />);

    await act(async () => {
      useBackendHealthStore.getState().setStatus("down");
    });

    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    expect(queryByText(MODAL_TITLE)).toBeNull();
  });

  it("down → ok geçişinde modal kapanır", async () => {
    mockUseSegments.mockReturnValue(["(tabs)", "menu"]);
    mockOrderGetState.mockReturnValue({
      fetchOrders: jest.fn().mockResolvedValue(undefined),
    });

    const { queryByText } = render(<ConnectivityGuard />);

    await act(async () => {
      useBackendHealthStore.getState().setStatus("down");
    });
    await waitFor(() => expect(queryByText(MODAL_TITLE)).toBeTruthy());

    await act(async () => {
      useBackendHealthStore.getState().recordSuccess();
    });

    await waitFor(() => expect(queryByText(MODAL_TITLE)).toBeNull());
  });

  it('logout butonu logout() çağırır ve router.replace("/(auth)/login") yapar', async () => {
    mockUseSegments.mockReturnValue(["(tabs)", "menu"]);
    const logoutMock = jest.fn().mockResolvedValue(undefined);
    mockAuthState.logout = logoutMock;
    mockOrderGetState.mockReturnValue({
      fetchOrders: jest.fn().mockResolvedValue(undefined),
    });

    const { getByText } = render(<ConnectivityGuard />);

    await act(async () => {
      useBackendHealthStore.getState().setStatus("down");
    });

    await waitFor(() => expect(getByText("Çıkış Yap")).toBeTruthy());

    // onLogout async bir fonksiyon; press'ten sonra promise'inin
    // tamamlanmasını bekleyebilmek için fireEvent.press'i çağırıp
    // event loop'a da zaman tanıyoruz.
    await act(async () => {
      fireEvent.press(getByText("Çıkış Yap"));
    });

    await waitFor(
      () => {
        expect(logoutMock).toHaveBeenCalled();
        expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
      },
      { timeout: 3000 },
    );
  });

  it("down + ana rotada, kullanıcı login rotasına giderse modal kapanır", async () => {
    mockUseSegments.mockReturnValue(["(tabs)", "menu"]);
    mockOrderGetState.mockReturnValue({
      fetchOrders: jest.fn().mockResolvedValue(undefined),
    });

    const { queryByText, rerender } = render(<ConnectivityGuard />);

    await act(async () => {
      useBackendHealthStore.getState().setStatus("down");
    });
    await waitFor(() => expect(queryByText(MODAL_TITLE)).toBeTruthy());

    // Kullanıcı login'e yönlendirildi (örn. logout sonrası)
    mockUseSegments.mockReturnValue(["(auth)", "login"]);
    await act(async () => {
      rerender(<ConnectivityGuard />);
    });

    await waitFor(() => expect(queryByText(MODAL_TITLE)).toBeNull());
  });

  it("down → ok geçişinde seçili masa varsa arka planda fetchOrders çağrılır", async () => {
    mockUseSegments.mockReturnValue(["(tabs)", "menu"]);
    const fetchOrdersMock = jest.fn().mockResolvedValue(undefined);
    mockOrderGetState.mockReturnValue({ fetchOrders: fetchOrdersMock });
    mockTableState.selectedTable = { id: "t-1", name: "Masa 1" };

    const { queryByText } = render(<ConnectivityGuard />);

    await act(async () => {
      useBackendHealthStore.getState().setStatus("down");
    });
    await waitFor(() => expect(queryByText(MODAL_TITLE)).toBeTruthy());
    expect(fetchOrdersMock).not.toHaveBeenCalled();

    await act(async () => {
      useBackendHealthStore.getState().recordSuccess();
    });

    await waitFor(() => {
      expect(fetchOrdersMock).toHaveBeenCalledWith("Masa 1", {
        background: true,
      });
    });
  });

  // ── MAJOR-3: AppState 'active' → checkHealth tetiklemesi ─────
  it("AppState active tetiklendiğinde checkHealth çağrılır", async () => {
    mockUseSegments.mockReturnValue(["(tabs)", "menu"]);
    mockOrderGetState.mockReturnValue({
      fetchOrders: jest.fn().mockResolvedValue(undefined),
    });
    // isLoading=false yap ki useConnectivityMonitor auto-login etkisi
    // gürültü oluşturmasın.
    mockAuthState.isLoading = false;

    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
      );

    render(<ConnectivityGuard />);

    // useConnectivityMonitor AppState 'change' listener'ı bağlar.
    const addSpy = AppState.addEventListener as unknown as jest.Mock;
    const addCalls = addSpy.mock.calls;
    const changeCall = addCalls.find((c) => c[0] === "change");
    expect(changeCall).toBeDefined();
    const listener = changeCall![1] as (state: string) => void;

    // İlk sağlık kontrolü için zamanlayıcıyı boşalt ki fetch çağrısı
    // olabildiğince az olsun; sonra foreground recheck tetikleyeceğiz.
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    fetchSpy.mockClear();

    await act(async () => {
      listener("active");
    });

    // Yeni çağrıda /api/v1/health/ endpoint'i kullanılmış olmalı.
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/health/"),
      expect.any(Object),
    );

    fetchSpy.mockRestore();
  });

  // ── MINOR-2: "Tekrar Dene" butonu davranışı ───────────────────
  it("Tekrar Dene: token geçerli ise modal kapanır, login'e yönlenmez", async () => {
    mockUseSegments.mockReturnValue(["(tabs)", "menu"]);
    mockAuthState.isLoading = false;
    mockAuthState.isAuthenticated = true;
    mockAuthState.serverUrl = "http://test.local";
    mockAuthState.token = "valid";
    mockOrderGetState.mockReturnValue({
      fetchOrders: jest.fn().mockResolvedValue(undefined),
    });

    // Force 'down' state — modal'ı aç.
    await act(async () => {
      useBackendHealthStore.setState({ status: "down" });
    });

    // /api/v1/auth/me/ 200 → validateStoredToken true.
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    render(<ConnectivityGuard />);
    await waitFor(() => expect(screen.getByText(MODAL_TITLE)).toBeTruthy());

    // İlk /api/v1/health/ 2s sonra tetiklenmesin diye 0 ilerlet.
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    fetchSpy.mockClear();

    await act(async () => {
      fireEvent.press(screen.getByText("Tekrar Dene"));
    });

    // Modal kapandı, login'e yönlenmedi.
    expect(useBackendHealthStore.getState().status).toBe("ok");
    expect(mockReplace).not.toHaveBeenCalledWith("/(auth)/login");

    fetchSpy.mockRestore();
  });

  it("Tekrar Dene: access token yenilenebiliyorsa logout yapmadan devam eder", async () => {
    mockUseSegments.mockReturnValue(["(tabs)", "menu"]);
    mockAuthState.isLoading = false;
    mockAuthState.isAuthenticated = true;
    mockAuthState.serverUrl = "http://test.local";
    mockAuthState.token = "expired-access";
    mockAuthState.refreshToken = "valid-refresh";
    const logoutMock = jest.fn().mockResolvedValue(undefined);
    mockAuthState.logout = logoutMock;
    mockOrderGetState.mockReturnValue({
      fetchOrders: jest.fn().mockResolvedValue(undefined),
    });

    await act(async () => {
      useBackendHealthStore.setState({ status: "down" });
    });

    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/v1/auth/me/")) {
          if (mockAuthState.token === "expired-access") {
            return new Response(JSON.stringify({ detail: "expired" }), {
              status: 401,
            });
          }
          return new Response(JSON.stringify({}), { status: 200 });
        }
        if (url.endsWith("/api/v1/auth/token/refresh/")) {
          return new Response(
            JSON.stringify({
              access: "renewed-access",
              refresh: "renewed-refresh",
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });

    render(<ConnectivityGuard />);
    await waitFor(() => expect(screen.getByText(MODAL_TITLE)).toBeTruthy());

    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    fetchSpy.mockClear();

    await act(async () => {
      fireEvent.press(screen.getByText("Tekrar Dene"));
    });

    await waitFor(() => {
      expect(useBackendHealthStore.getState().status).toBe("ok");
      expect(mockAuthState.setTokens).toHaveBeenCalledWith(
        "renewed-access",
        "renewed-refresh",
      );
      expect(logoutMock).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalledWith("/(auth)/login");
    });

    fetchSpy.mockRestore();
  });

  it("Tekrar Dene: token geçersiz ise login'e yönlendirir", async () => {
    mockUseSegments.mockReturnValue(["(tabs)", "menu"]);
    mockAuthState.isLoading = false;
    mockAuthState.isAuthenticated = true;
    mockAuthState.serverUrl = "http://test.local";
    mockAuthState.token = "invalid";
    const logoutMock = jest.fn().mockResolvedValue(undefined);
    mockAuthState.logout = logoutMock;
    mockOrderGetState.mockReturnValue({
      fetchOrders: jest.fn().mockResolvedValue(undefined),
    });

    await act(async () => {
      useBackendHealthStore.setState({ status: "down" });
    });

    // 401 → validateStoredToken false → logout + replace.
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "unauth" }), {
        status: 401,
      }),
    );

    render(<ConnectivityGuard />);
    await waitFor(() => expect(screen.getByText(MODAL_TITLE)).toBeTruthy());

    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    fetchSpy.mockClear();

    await act(async () => {
      fireEvent.press(screen.getByText("Tekrar Dene"));
    });

    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
    });

    fetchSpy.mockRestore();
  });

  // ── MINOR-3: Auto-login backoff tükenmesi ────────────────────
  it("Token 5 denemede doğrulanamazsa login'e yönlendirir", async () => {
    mockUseSegments.mockReturnValue(["(tabs)", "menu"]);
    mockAuthState.isLoading = false;
    mockAuthState.isAuthenticated = true;
    mockAuthState.serverUrl = "http://test.local";
    mockAuthState.token = "invalid";
    const logoutMock = jest.fn().mockResolvedValue(undefined);
    mockAuthState.logout = logoutMock;
    mockOrderGetState.mockReturnValue({
      fetchOrders: jest.fn().mockResolvedValue(undefined),
    });

    // Her fetch 401 → validateStoredToken false.
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "unauth" }), {
        status: 401,
      }),
    );

    render(<ConnectivityGuard />);

    // Auto-login akışı:
    //   1s ilk bekleme + 2s + 4s + 8s + 16s + 16s backoff = 47s.
    // attempt 1..4 başarısız → attempt 5 bütçe aşımı → logout + replace.
    //
    // `advanceTimersByTimeAsync` her timer callback'inden sonra
    // microtask queue'sunu boşaltır; bu sayede async `attempt()` çağrısı
    // tamamlanır ve bir sonraki setTimeout zamanlanabilir. Sync kardeşi
    // bunu yapmıyor → bu testte mikro-task sızıntısı olur.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50_000);
    });
    // Kalan microtask'ler için ek flush.
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(logoutMock).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");

    fetchSpy.mockRestore();
  });
});
