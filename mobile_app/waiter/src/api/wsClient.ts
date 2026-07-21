export interface WebSocketClient {
  connect(urlOrFactory: string | (() => string | Promise<string>)): void;
  disconnect(): void;
  send(message: Record<string, unknown>): void;
  onMessage(handler: (data: unknown) => void): () => void;
  onConnectionChange(handler: (connected: boolean) => void): () => void;
}

export function createWebSocketClient(): WebSocketClient {
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let staleTimer: ReturnType<typeof setInterval> | null = null;
  let lastPongAt = Date.now();
  let teardown = false;
  let urlFactory: (() => string | Promise<string>) | null = null;
  const messageHandlers = new Set<(data: unknown) => void>();
  const connectionHandlers = new Set<(connected: boolean) => void>();

  const notifyConnection = (connected: boolean) => {
    connectionHandlers.forEach((h) => h(connected));
  };

  const notifyMessage = (data: unknown) => {
    messageHandlers.forEach((h) => h(data));
  };

  const stopHealthChecks = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (staleTimer) {
      clearInterval(staleTimer);
      staleTimer = null;
    }
  };

  const startHealthChecks = () => {
    stopHealthChecks();
    lastPongAt = Date.now();
    heartbeatTimer = setInterval(() => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify({ type: "ping" }));
      } catch (err) {
        console.warn("WS ping send error:", err);
      }
    }, 30_000);
    staleTimer = setInterval(() => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastPongAt <= 95_000) return;
      console.warn("WS stale detected, reconnecting");
      socket.close();
    }, 30_000);
  };

  const closeSocketQuietly = () => {
    if (!socket) return;
    const prev = socket;
    socket = null;
    try {
      prev.onclose = null;
      prev.onerror = null;
      prev.onmessage = null;
      prev.onopen = null;
      prev.close();
    } catch {
      /* ignore */
    }
  };

  const doConnect = () => {
    if (teardown || !urlFactory) return;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    void (async () => {
      let url: string;
      try {
        url = await urlFactory!();
      } catch (err) {
        console.warn("WS URL factory failed, retrying:", err);
        if (teardown) return;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), 30_000);
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(doConnect, delay);
        return;
      }

      if (teardown) return;

      closeSocketQuietly();
      const next = new WebSocket(url);
      socket = next;

      next.onopen = () => {
        if (socket !== next) return;
        reconnectAttempt = 0;
        notifyConnection(true);
        startHealthChecks();
      };

      next.onmessage = (e) => {
        if (socket !== next) return;
        try {
          const message = JSON.parse(e.data);
          if (message.type === "pong") {
            lastPongAt = Date.now();
            return;
          }
          notifyMessage(message);
        } catch (err) {
          console.error("WS Message parse error:", err, "| raw:", e.data?.slice?.(0, 200));
        }
      };

      next.onclose = () => {
        if (socket !== next && socket != null) return;
        notifyConnection(false);
        stopHealthChecks();
        if (teardown) return;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), 30_000);
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(doConnect, delay);
      };

      next.onerror = () => {
        // onclose handles reconnect
      };
    })();
  };

  return {
    connect(urlOrFactory: string | (() => string | Promise<string>)) {
      teardown = false;
      reconnectAttempt = 0;
      urlFactory =
        typeof urlOrFactory === "function" ? urlOrFactory : () => urlOrFactory;
      doConnect();
    },
    disconnect() {
      teardown = true;
      stopHealthChecks();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      closeSocketQuietly();
    },
    send(message: Record<string, unknown>) {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    },
    onMessage(handler: (data: unknown) => void): () => void {
      messageHandlers.add(handler);
      return () => {
        messageHandlers.delete(handler);
      };
    },
    onConnectionChange(handler: (connected: boolean) => void): () => void {
      connectionHandlers.add(handler);
      return () => {
        connectionHandlers.delete(handler);
      };
    },
  };
}
