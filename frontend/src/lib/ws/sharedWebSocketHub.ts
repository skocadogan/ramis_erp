/**
 * Oturum boyunca tek TCP bağlantısı — birden fazla abone (ref-count) paylaşır.
 */

import {
  runManagedWebSocket,
  type ManagedWebSocketOptions,
} from "./managedWebSocket";

interface HubSubscriber {
  onMessage: (data: unknown) => void;
  onError?: (error: Event) => void;
}

type HubEntry = {
  cleanup: () => void;
  listeners: Set<(event: MessageEvent) => void>;
  onOpenHandlers: Set<() => void>;
  onCloseHandlers: Set<() => void>;
  subscribers: Set<HubSubscriber>;
  refCount: number;
};

const hubs = new Map<string, HubEntry>();

export type SharedWebSocketSubscribeOptions = Omit<
  ManagedWebSocketOptions,
  "onMessage" | "onOpen" | "onClose" | "onError"
> & {
  onMessage?: (event: MessageEvent) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
};

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

    const cleanup = runManagedWebSocket({
      tag: options.tag ?? hubKey,
      getUrl: options.getUrl,
      enabled: options.enabled,
      initialDelayMs: options.initialDelayMs,
      maxDelayMs: options.maxDelayMs,
      backoffFactor: options.backoffFactor,
      bindSocket: options.bindSocket,
      heartbeatIntervalMs: options.heartbeatIntervalMs,
      staleAfterMs: options.staleAfterMs,
      onMessage: (event) => {
        for (const fn of listeners) {
          fn(event);
        }
      },
      onOpen: () => {
        for (const fn of onOpenHandlers) {
          fn();
        }
      },
      onClose: () => {
        for (const fn of onCloseHandlers) {
          fn();
        }
      },
      onError: (event) => {
        for (const sub of subscribers) {
          sub.onError?.(event);
        }
      },
    });

    entry = {
      cleanup,
      listeners,
      onOpenHandlers,
      onCloseHandlers,
      subscribers,
      refCount: 0,
    };
    hubs.set(hubKey, entry);
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
  terminalId: string | null | undefined,
  platform: "web" | "mobile" = "web"
): string {
  return `pos-sync:${branchId ?? ""}:${terminalId ?? ""}:${platform}`;
}

/** Mutfak bildirimleri — KDS, prep, POS bildirim çekmecesi paylaşır. */
export function kitchenNotificationsHubKey(branchId: string | null | undefined): string {
  return `kitchen:${branchId ?? "global"}`;
}

/** Personel bildirimleri. */
export function staffNotificationsHubKey(branchId: string | null | undefined): string {
  return `staff:${branchId ?? "global"}`;
}

if (typeof module !== "undefined" && "hot" in module && module.hot) {
  const hot = module.hot as { dispose?: (cb: () => void) => void };
  hot.dispose?.(() => {
    hubs.forEach((hub) => hub.cleanup());
    hubs.clear();
  });
}
