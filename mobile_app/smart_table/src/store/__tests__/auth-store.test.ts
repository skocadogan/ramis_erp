// ============================================================
// Smart Table — auth-store birim testleri
// ============================================================

import { act } from "react-test-renderer";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/services/api-tokens", () => ({
  setCachedToken: jest.fn(),
  setCachedRefreshToken: jest.fn(),
}));

jest.mock("@/services/api", () => ({}));

jest.mock("../table-store", () => {
  type TableStoreMock = {
    selectedTable: null;
    init: jest.Mock;
  };

  type MockZustandHook = jest.Mock & {
    getState: jest.Mock;
    setState: jest.Mock;
    subscribe: jest.Mock;
  };

  const mockState: TableStoreMock = {
    selectedTable: null,
    init: jest.fn().mockResolvedValue(undefined),
  };
  const hook = jest.fn((selector?: (s: TableStoreMock) => unknown) =>
    selector ? selector(mockState) : mockState,
  ) as unknown as MockZustandHook;
  hook.getState = jest.fn(() => mockState);
  hook.setState = jest.fn();
  hook.subscribe = jest.fn(() => () => {});
  return { useTableStore: hook };
});

import * as SecureStore from "expo-secure-store";
import { setCachedRefreshToken, setCachedToken } from "@/services/api-tokens";
import { useAuthStore } from "../auth-store";

const secureStoreMock = SecureStore as jest.Mocked<typeof SecureStore>;
const setCachedTokenMock = setCachedToken as jest.Mock;
const setCachedRefreshTokenMock = setCachedRefreshToken as jest.Mock;

const user = {
  id: "u1",
  username: "smart_table",
  email: "smart@example.com",
  first_name: "Smart",
  last_name: "Table",
};

describe("useAuthStore", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    useAuthStore.setState({
      serverUrl: null,
      token: null,
      refreshToken: null,
      persistSession: false,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      savedServers: [],
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("rememberMe=false oturumunda refresh sonrası tokenları diske yazmaz", async () => {
    await act(async () => {
      await useAuthStore
        .getState()
        .login("http://api.test", "access-1", "refresh-1", user, false);
    });

    expect(useAuthStore.getState().persistSession).toBe(false);
    expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledWith(
      "smart_table_auth_token",
    );
    expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledWith(
      "smart_table_refresh_token",
    );
    expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledWith(
      "smart_table_auth_user",
    );

    secureStoreMock.setItemAsync.mockClear();

    await act(async () => {
      await useAuthStore.getState().setTokens("access-2", "refresh-2");
    });

    expect(useAuthStore.getState().token).toBe("access-2");
    expect(useAuthStore.getState().refreshToken).toBe("refresh-2");
    expect(setCachedTokenMock).toHaveBeenLastCalledWith("access-2");
    expect(setCachedRefreshTokenMock).toHaveBeenLastCalledWith("refresh-2");
    expect(secureStoreMock.setItemAsync).not.toHaveBeenCalledWith(
      "smart_table_auth_token",
      "access-2",
    );
    expect(secureStoreMock.setItemAsync).not.toHaveBeenCalledWith(
      "smart_table_refresh_token",
      "refresh-2",
    );
  });

  it("persisted oturumda refresh sonrası tokenları diske yazar", async () => {
    await act(async () => {
      await useAuthStore
        .getState()
        .login("http://api.test", "access-1", "refresh-1", user, true);
    });

    secureStoreMock.setItemAsync.mockClear();

    await act(async () => {
      await useAuthStore.getState().setTokens("access-3", "refresh-3");
    });

    expect(useAuthStore.getState().persistSession).toBe(true);
    expect(secureStoreMock.setItemAsync).toHaveBeenCalledWith(
      "smart_table_auth_token",
      "access-3",
    );
    expect(secureStoreMock.setItemAsync).toHaveBeenCalledWith(
      "smart_table_refresh_token",
      "refresh-3",
    );
  });
});
