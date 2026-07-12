export interface WebSocketClient {
  connect(url: string): void;
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
  let currentUrl = "";
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

  const doConnect = () => {
    if (teardown) return;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    socket = new WebSocket(currentUrl);

    socket.onopen = () => {
      reconnectAttempt = 0;
      notifyConnection(true);
      startHealthChecks();
    };

    socket.onmessage = (e) => {
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

    socket.onclose = () => {
      notifyConnection(false);
      stopHealthChecks();
      if (teardown) return;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), 30_000);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(doConnect, delay);
    };

    socket.onerror = () => {
      // onclose handles reconnect
    };
  };

  return {
    connect(url: string) {
      teardown = false;
      reconnectAttempt = 0;
      currentUrl = url;
      doConnect();
    },
    disconnect() {
      teardown = true;
      stopHealthChecks();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket) {
        socket.close();
        socket = null;
      }
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
