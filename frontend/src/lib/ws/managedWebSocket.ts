/**
 * Oturum boyunca dayanıklı WebSocket: üstel geri bağlanma, online/sekme görünür olunca hızlı yeniden deneme,
 * her bağlantıda `getUrl()` ile güncel adres (JWT query/cookie uyumu).
 */

const WS_MANAGED_INITIAL_DELAY_MS = 1_500;
const WS_MANAGED_MAX_DELAY_MS = 30_000;
const WS_MANAGED_BACKOFF_FACTOR = 2;
const WS_HEARTBEAT_INTERVAL_MS = 30_000;
const WS_STALE_AFTER_MS = 90_000;

export type ManagedWebSocketOptions = {
  getUrl: () => string;
  onMessage: (event: MessageEvent) => void;
  onOpen?: () => void;
  onError?: (event: Event) => void;
  /** Bağlantı koptuğunda (cleanup / iptal değil); UI gibi dinleyiciler için. */
  onClose?: () => void;
  enabled?: boolean;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  bindSocket?: (socket: WebSocket | null) => void;
  tag?: string;
  /** Uygulama seviyesi ping (sunucu pong döner). 0 = kapalı. */
  heartbeatIntervalMs?: number;
  /** Bu süre boyunca mesaj gelmezse bağlantı kapatılıp yeniden kurulur. 0 = kapalı. */
  staleAfterMs?: number;
};

export function runManagedWebSocket(options: ManagedWebSocketOptions): () => void {
  const {
    getUrl,
    onMessage,
    onOpen,
    onError,
    onClose,
    enabled = true,
    initialDelayMs = WS_MANAGED_INITIAL_DELAY_MS,
    maxDelayMs = WS_MANAGED_MAX_DELAY_MS,
    backoffFactor = WS_MANAGED_BACKOFF_FACTOR,
    bindSocket,
    tag = "ws",
    heartbeatIntervalMs = WS_HEARTBEAT_INTERVAL_MS,
    staleAfterMs = WS_STALE_AFTER_MS,
  } = options;

  let cancelled = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let staleTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  /** visibility / online sonrası onclose içinde hemen yeniden bağlan */
  let forceImmediateReconnect = false;

  const clearReconnect = () => {
    if (reconnectTimer != null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const clearHeartbeat = () => {
    if (heartbeatTimer != null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const clearStale = () => {
    if (staleTimer != null) {
      clearTimeout(staleTimer);
      staleTimer = null;
    }
  };

  const bumpStaleWatch = () => {
    clearStale();
    if (!staleAfterMs || staleAfterMs <= 0 || cancelled || !enabled) return;
    staleTimer = setTimeout(() => {
      staleTimer = null;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.close(4000, "stale-connection");
      } catch {
        /* ignore */
      }
    }, staleAfterMs);
  };

  const startHeartbeat = () => {
    clearHeartbeat();
    if (!heartbeatIntervalMs || heartbeatIntervalMs <= 0) return;
    heartbeatTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify({ type: "ping" }));
      } catch {
        /* ignore */
      }
    }, heartbeatIntervalMs);
  };

  const stripHandlersAndNull = (socket: WebSocket) => {
    try {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
    } catch {
      /* ignore */
    }
  };

  const scheduleReconnect = () => {
    if (cancelled || !enabled) return;
    clearReconnect();
    const delay = Math.min(
      maxDelayMs,
      initialDelayMs * Math.pow(backoffFactor, attempt)
    );
    attempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (cancelled || !enabled) return;
      openSocket();
    }, delay);
  };

  const openSocket = () => {
    if (cancelled || !enabled) return;
    clearReconnect();
    clearHeartbeat();
    clearStale();

    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return;
    }

    if (ws) {
      stripHandlersAndNull(ws);
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, "managed-ws-replace");
        }
      } catch {
        /* ignore */
      }
      ws = null;
      bindSocket?.(null);
    }

    let url: string;
    try {
      url = getUrl();
    } catch (e) {
      console.error(`[${tag}] getUrl failed`, e);
      scheduleReconnect();
      return;
    }

    let next: WebSocket;
    try {
      next = new WebSocket(url);
    } catch (e) {
      console.error(`[${tag}] new WebSocket failed`, e);
      scheduleReconnect();
      return;
    }

    ws = next;
    bindSocket?.(ws);

    ws.onopen = (event) => {
      if (process.env.NODE_ENV === "development") {
        console.info(`[WS:${tag}] Connected`, event);
      }
      attempt = 0;
      startHeartbeat();
      bumpStaleWatch();
      onOpen?.();
    };

    ws.onmessage = (event) => {
      bumpStaleWatch();
      try {
        const payload = JSON.parse(String(event.data));
        if (payload?.type === "pong") {
          return;
        }
      } catch {
        /* non-json veya parse hatası — ilet */
      }
      onMessage(event);
    };

    ws.onerror = (event) => {
      // onerror Event nesnesi kod/reason taşımaz; yeniden bağlanma onclose ile yönetilir.
      if (process.env.NODE_ENV === "development") {
        console.debug(`[WS:${tag}] Connection error (will retry)`, event);
      }
      onError?.(event);
    };

    ws.onclose = () => {
      clearHeartbeat();
      clearStale();
      bindSocket?.(null);
      ws = null;
      if (cancelled || !enabled) return;

      onClose?.();

      if (forceImmediateReconnect) {
        forceImmediateReconnect = false;
        attempt = 0;
        clearReconnect();
        queueMicrotask(() => openSocket());
        return;
      }

      scheduleReconnect();
    };
  };

  /** Sekme/online: yalnızca kopuk veya şüpheli bağlantıda yeniden bağlan; sağlıklı OPEN'ı kesme. */
  const bumpReconnectOnLifecycle = () => {
    if (cancelled || !enabled) return;
    attempt = 0;
    clearReconnect();

    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      openSocket();
      return;
    }

    if (ws.readyState === WebSocket.CONNECTING) {
      return;
    }

    // OPEN: stale timer'ı yenile; zorunlu close+reconnect yok (focus storm önlenir).
    bumpStaleWatch();
    try {
      if (heartbeatIntervalMs > 0) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    } catch {
      forceImmediateReconnect = true;
      try {
        ws.close(1000, "visibility-or-online-ping-failed");
      } catch {
        forceImmediateReconnect = false;
        openSocket();
      }
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      bumpReconnectOnLifecycle();
    }
  };

  const onOnline = () => {
    bumpReconnectOnLifecycle();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
  }

  if (enabled) {
    openSocket();
  }

  return () => {
    cancelled = true;
    forceImmediateReconnect = false;
    clearReconnect();
    clearHeartbeat();
    clearStale();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onOnline);
    }
    bindSocket?.(null);
    if (ws) {
      stripHandlersAndNull(ws);
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, "managed-ws-cleanup");
        }
      } catch {
        /* ignore */
      }
      ws = null;
    }
  };
}
