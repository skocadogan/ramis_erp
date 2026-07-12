"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AppRuntimeConfig } from "@/lib/runtimeConfig";
import {
  applyClientRuntimeConfig,
  loadClientRuntimeConfig,
} from "@/lib/runtimeConfig";

const RuntimeConfigContext = createContext<AppRuntimeConfig | null>(null);

type RuntimeConfigProviderProps = {
  children: ReactNode;
  /** SSR ile aynı snapshot; hydration uyumu için layout'tan gelir. */
  initialConfig: AppRuntimeConfig;
};

/**
 * Uygulama açılışında /ramis/runtime-config okunur (sunucudaki /etc/ramis/runtime-config.json).
 * apiBaseUrl ve NEXT_PUBLIC bayrakları yeniden derleme olmadan güncellenebilir.
 */
export function RuntimeConfigProvider({
  children,
  initialConfig,
}: RuntimeConfigProviderProps) {
  const [config, setConfig] = useState<AppRuntimeConfig>(() => {
    applyClientRuntimeConfig(initialConfig);
    return initialConfig;
  });

  useEffect(() => {
    let cancelled = false;
    void loadClientRuntimeConfig().then((next) => {
      if (!cancelled) {
        setConfig(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RuntimeConfigContext.Provider value={config}>
      {children}
    </RuntimeConfigContext.Provider>
  );
}

export function useRuntimeConfig(): AppRuntimeConfig {
  const ctx = useContext(RuntimeConfigContext);
  if (ctx == null) {
    throw new Error(
      "useRuntimeConfig: Bileşen ağacı RuntimeConfigProvider ile sarılmalı (src/app/providers.tsx)."
    );
  }
  return ctx;
}
