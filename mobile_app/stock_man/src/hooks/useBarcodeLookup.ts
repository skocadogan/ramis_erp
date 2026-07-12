// ============================================================
// Stock Man — useBarcodeLookup hook (P5)
//
// Thin React Query mutation wrapper around `scannerService.lookup`.
// Returns a standard `useMutation` shape — the caller triggers
// it with `mutate(code)` or `mutateAsync(code)` and reads
// `data` for the `BarcodeLookupResult`.
//
// The mutation has retry=0 (inherited from the global query
// client) because the lookup is typically a fresh scanner
// trigger — re-trying would be a UI papercut, not a fix.
// ============================================================

import { useMutation } from "@tanstack/react-query";
import { scannerService, type BarcodeLookupResult } from "@/services/scannerService";

export function useBarcodeLookup() {
  return useMutation<BarcodeLookupResult, Error, string>({
    mutationFn: (code: string) => scannerService.lookup(code),
  });
}
