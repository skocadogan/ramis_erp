// ============================================================
// Stock Man — API type helpers
//
// Thin layer over the DRF paginated envelope. `extractResults`
// accepts both `{ results: T[] }` and a raw `T[]` so services
// can stay agnostic to whether a particular endpoint is paginated
// (most list endpoints are) or returns a flat array (custom
// action endpoints like `expiring_lots/`).
// ============================================================

import type { Paginated } from "./models";

/** Coerce either a paginated envelope or a raw array to `T[]`. */
export function extractResults<T>(
  data: T[] | Paginated<T> | undefined | null
): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export type { Paginated };
