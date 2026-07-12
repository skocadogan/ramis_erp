// ============================================================
// Stock Man — usePrinters hook (P5)
//
// React Query wrapper around `printingService.list`. We pin
// `is_active=true` by default because the printer-picker UI
// only shows live printers; an admin screen (future) can call
// the service directly to also see disabled ones.
//
// `staleTime: 5 min` — the printer list rarely changes mid-shift,
// and the connection-state modal polls every 30 s anyway.
// ============================================================


