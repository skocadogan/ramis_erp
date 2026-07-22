"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { getMenuCatalogWsUrl, runManagedWebSocket, acceptWsEvent } from "@/lib/ws";

/**
 * Menü API’sinde değişiklik olunca backend `menu_catalog_refresh` yayınlar;
 * POS menü / sepet fiyatlarını HTTP ile yeniler.
 */
const REFRESH_DEBOUNCE_MS = 400;

export function useMenuCatalogSync(
  enabled: boolean,
  onRefresh: () => void | Promise<void>,
  onSocketState?: (open: boolean) => void,
) {
  const token = useAuthStore((s) => s.token);
  const onRefreshRef = useRef(onRefresh);
  const onSocketStateRef = useRef(onSocketState);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);
  useEffect(() => {
    onSocketStateRef.current = onSocketState;
  }, [onSocketState]);

  useEffect(() => {
    let debounceTimer: number | null = null;

    const cleanup = runManagedWebSocket({
      tag: "menu-catalog",
      enabled: enabled && !!token,
      getUrl: getMenuCatalogWsUrl,
      onOpen: () => {
        console.debug("[MenuCatalog] WebSocket bağlandı");
        onSocketStateRef.current?.(true);
      },
      onClose: () => onSocketStateRef.current?.(false),
      onMessage: (event) => {
        try {
          const parsed = acceptWsEvent(event.data, "menu-catalog");
          if (!parsed || parsed.type !== "menu_catalog_refresh") return;
          if (debounceTimer) window.clearTimeout(debounceTimer);
          debounceTimer = window.setTimeout(() => {
            debounceTimer = null;
            void onRefreshRef.current();
          }, REFRESH_DEBOUNCE_MS);
        } catch {
          /* geçersiz mesaj */
        }
      },
    });

    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      cleanup();
    };
  }, [enabled, token]);
}
