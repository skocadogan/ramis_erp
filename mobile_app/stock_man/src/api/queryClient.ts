// ============================================================
// Stock Man — React Query client
//
// Sensible defaults for a tablet warehouse app:
//   - 30s staleTime keeps the UI snappy without hammering the
//     backend while a user navigates between sibling screens
//   - 5 min gcTime prevents thrashing when filters change
//   - 2 retries on queries masks transient network blips
//   - mutations never retry (we don't want a "stuck" button)
//   - refetchOnWindowFocus: false — mobile apps don't have a
//     real "window focus" event we trust; rely on pull-to-refresh
//     and P5 WebSocket push instead
// ============================================================

import { QueryClient, onlineManager } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";

onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
