"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useLocale } from "next-intl";
import { RuntimeConfigProvider } from "@/lib/RuntimeConfigProvider";
import type { AppRuntimeConfig } from "@/lib/runtimeConfig";
import { BackendHealthProvider } from "@/components/shell/BackendHealthProvider";
import { ThemeProvider } from "@/components/shell/ThemeProvider";
import { setCurrentLocale } from "@/lib/formatters";

export function Providers({
  children,
  initialRuntimeConfig,
}: {
  children: React.ReactNode;
  initialRuntimeConfig: AppRuntimeConfig;
}) {
  const locale = useLocale();

  /* Sync next-intl locale → formatters.ts module-level locale */
  useEffect(() => {
    setCurrentLocale(locale);
  }, [locale]);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 10 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <RuntimeConfigProvider initialConfig={initialRuntimeConfig}>
      <BackendHealthProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            {children}
            <Toaster position="top-right" richColors />
          </ThemeProvider>
        </QueryClientProvider>
      </BackendHealthProvider>
    </RuntimeConfigProvider>
  );
}
