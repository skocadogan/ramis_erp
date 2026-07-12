// ============================================================
// Stock Man — Typed route constants (expo-router)
//
// Centralises href strings so screens avoid `router.push(... as any)`.
// Dynamic segments use helper functions that return typed `Href`.
// ============================================================

import type { Href } from "expo-router";

export const routes = {
  purchase: {
    list: "/(main)/(tabs)/purchase" as Href,
    new: "/(main)/purchase/new" as Href,
    recommend: "/(main)/purchase/recommend" as Href,
    detail: (id: string): Href => `/(main)/purchase/${id}` as Href,
    receivingFromPo: (poId: string): Href =>
      ({
        pathname: "/(main)/receiving/new",
        params: { po_id: poId },
      }) as Href,
  },
  receiving: {
    detail: (id: string): Href => `/(main)/receiving/${id}` as Href,
  },
  stock: {
    tabs: "/(main)/(tabs)/stock" as Href,
    detail: (id: string): Href => `/(main)/stock/${id}` as Href,
  },
  deficiency: {
    tabs: "/(main)/(tabs)/deficiency" as Href,
    detail: (id: string): Href => `/(main)/deficiency/${id}` as Href,
  },
  transfer: {
    tabs: "/(main)/(tabs)/transfer" as Href,
    detail: (id: string): Href => `/(main)/transfer/${id}` as Href,
  },
  supplier: {
    detail: (id: string): Href => `/(main)/supplier/${id}` as Href,
  },
  counting: {
    detail: (id: string): Href => `/(main)/counting/${id}` as Href,
  },
} as const;
