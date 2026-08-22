/**
 * Oturum boyunca tek TCP bağlantısı — birden fazla abone (ref-count) paylaşır.
 */

import {
  runManagedWebSocket,
  type ManagedWebSocketOptions,
} from "./managedWebSocket";
import { resolveBranchIdForWs } from "./authWsUrl";

interface HubSubscriber {
  onMessage: (data: unknown) => void;
  onError?: (error: Event) => void;
}

type HubEntry = {
  cleanup: () => void;
  getUrl: () => string;
  connectedUrl: string | null;
  listeners: Set<(event: MessageEvent) => void>;
  onOpenHandlers: Set<() => void>;
  onCloseHandlers: Set<() => void>;
  subscribers: Set<HubSubscriber>;
  refCount: number;
  managedOptions: Omit<
    SharedWebSocketSubscribeOptions,
    "getUrl" | "onMessage" | "onOpen" | "onClose" | "onError"
  >;
};

const hubs = new Map<string, HubEntry>();
const noop = () => {};

export type SharedWebSocketSubscribeOptions = Omit<
  ManagedWebSocketOptions,
  "onMessage" | "onOpen" | "onClose" | "onError"
> & {
  onMessage?: (event: MessageEvent) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
};

function connectEntry(entry: HubEntry): void {
  entry.cleanup = runManagedWebSocket({
    ...entry.managedOptions,
    getUrl: () => {
      const url = entry.getUrl();
      entry.connectedUrl = url;
      return url;
    },
    onMessage: (event) => {
      for (const fn of entry.listeners) {
        fn(event);
      }
    },
    onOpen: () => {
      for (const fn of entry.onOpenHandlers) {
        fn();
      }
    },
    onClose: () => {
      for (const fn of entry.onCloseHandlers) {
        fn();
      }
    },
    onError: (event) => {
      for (const sub of entry.subscribers) {
        sub.onError?.(event);
      }
    },
  });
}

function reconnectEntry(entry: HubEntry): void {
  entry.cleanup();
  entry.cleanup = noop;
  entry.connectedUrl = null;
  connectEntry(entry);
}

/** JWT yenilendiğinde açık paylaşımlı bağlantıları güncel URL ile tek kez kurar. */
export function reconnectAllSharedWebSockets(): void {
  for (const entry of hubs.values()) {
    reconnectEntry(entry);
  }
}

/** @deprecated `reconnectAllSharedWebSockets` kullanın */
export const reconnectSharedWebSockets = reconnectAllSharedWebSockets;

export function subscribeSharedWebSocket(
  hubKey: string,
  options: SharedWebSocketSubscribeOptions
): () => void {
  let entry = hubs.get(hubKey);

  if (!entry) {
    const listeners = new Set<(event: MessageEvent) => void>();
    const onOpenHandlers = new Set<() => void>();
    const onCloseHandlers = new Set<() => void>();
    const subscribers = new Set<HubSubscriber>();

    entry = {
      cleanup: noop,
      getUrl: options.getUrl,
      connectedUrl: null,
      listeners,
      onOpenHandlers,
      onCloseHandlers,
      subscribers,
      refCount: 0,
      managedOptions: {
        tag: options.tag ?? hubKey,
        enabled: options.enabled,
        initialDelayMs: options.initialDelayMs,
        maxDelayMs: options.maxDelayMs,
        backoffFactor: options.backoffFactor,
        bindSocket: options.bindSocket,
        heartbeatIntervalMs: options.heartbeatIntervalMs,
        staleAfterMs: options.staleAfterMs,
      },
    };
    hubs.set(hubKey, entry);
    connectEntry(entry);
  } else {
    entry.getUrl = options.getUrl;
    let nextUrl: string | null = null;
    try {
      nextUrl = options.getUrl();
    } catch {
      // URL hatasını ManagedWebSocket'in backoff akışı yönetsin.
    }
    if (entry.connectedUrl !== nextUrl) {
      reconnectEntry(entry);
    }
  }

  entry.refCount += 1;
  if (options.onMessage) entry.listeners.add(options.onMessage);
  if (options.onOpen) entry.onOpenHandlers.add(options.onOpen);
  if (options.onClose) entry.onCloseHandlers.add(options.onClose);

  const subscriber: HubSubscriber = {
    onMessage: (options.onMessage ?? (() => {})) as (data: unknown) => void,
    onError: options.onError,
  };
  entry.subscribers.add(subscriber);

  return () => {
    const current = hubs.get(hubKey);
    if (!current) return;

    if (options.onMessage) current.listeners.delete(options.onMessage);
    if (options.onOpen) current.onOpenHandlers.delete(options.onOpen);
    if (options.onClose) current.onCloseHandlers.delete(options.onClose);
    current.subscribers.delete(subscriber);
    current.refCount -= 1;

    if (current.refCount <= 0) {
      current.cleanup();
      hubs.delete(hubKey);
    }
  };
}

/** POS masa + vardiya senkronu — aynı ``/ws/pos/sync/`` bağlantısı. */
export function posSyncHubKey(
  branchId: string | null | undefined,
  platform: "web" | "mobile" = "web"
): string {
  const resolved = resolveBranchIdForWs(branchId);
  return `pos-sync:${resolved ?? "global"}:${platform}`;
}

/** Mutfak bildirimleri — KDS, prep, POS bildirim çekmecesi paylaşır. */
export function kitchenNotificationsHubKey(branchId?: string | null): string {
  const resolved = resolveBranchIdForWs(branchId);
  return `kitchen:${resolved ?? "global"}`;
}

/** Personel bildirimleri. */
export function staffNotificationsHubKey(branchId: string | null | undefined): string {
  return `staff:${branchId ?? "global"}`;
}

/** Akıllı buton garson çağrıları. */
export function waiterCallsHubKey(branchId: string | null | undefined): string {
  return `waiter-calls:${branchId ?? "global"}`;
}

/** Depo bildirimleri — depo sayfası + sidebar rozeti paylaşır. */
export function warehouseNotificationsHubKey(branchId?: string | null): string {
  const resolved = resolveBranchIdForWs(branchId);
  return `warehouse:${resolved ?? "global"}`;
}

if (typeof module !== "undefined" && "hot" in module && module.hot) {
  const hot = module.hot as { dispose?: (cb: () => void) => void };
  hot.dispose?.(() => {
    hubs.forEach((hub) => hub.cleanup());
    hubs.clear();
  });
}
