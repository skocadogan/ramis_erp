import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  kitchenNotificationsHubKey,
  posSyncHubKey,
  reconnectAllSharedWebSockets,
  subscribeSharedWebSocket,
  waiterCallsHubKey,
} from "./sharedWebSocketHub";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send() {}

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

const cleanups: Array<() => void> = [];

describe("SharedWebSocketHub", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
  });

  it("terminal değişse de POS branch/platform hub'ını tekilleştirir", () => {
    const key = posSyncHubKey("branch-1", "web");
    cleanups.push(
      subscribeSharedWebSocket(key, {
        getUrl: () => "ws://example/ws/pos/sync/?branch_id=branch-1&terminal_id=terminal-1",
      }),
    );
    cleanups.push(
      subscribeSharedWebSocket(key, {
        getUrl: () => "ws://example/ws/pos/sync/?branch_id=branch-1&terminal_id=terminal-2",
      }),
    );

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[0]?.readyState).toBe(FakeWebSocket.CLOSED);
    expect(FakeWebSocket.instances[1]?.url).toContain("terminal_id=terminal-2");
  });

  it("son abonenin getUrl factory'sini reconnect sırasında kullanır", () => {
    let url = "ws://example/first";
    const key = "latest-url";
    cleanups.push(subscribeSharedWebSocket(key, { getUrl: () => url }));

    url = "ws://example/refreshed-token";
    reconnectAllSharedWebSockets();

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1]?.url).toBe(url);
  });

  it("aynı resolved kitchen ve waiter-call kapsamını paylaşır", () => {
    const kitchenKey = kitchenNotificationsHubKey(" branch-1 ");
    expect(kitchenKey).toBe(kitchenNotificationsHubKey("branch-1"));

    const waiterKey = waiterCallsHubKey("branch-1");
    cleanups.push(
      subscribeSharedWebSocket(waiterKey, {
        getUrl: () => "ws://example/ws/waiter/calls/?branch_id=branch-1",
      }),
    );
    cleanups.push(
      subscribeSharedWebSocket(waiterKey, {
        getUrl: () => "ws://example/ws/waiter/calls/?branch_id=branch-1",
      }),
    );

    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
