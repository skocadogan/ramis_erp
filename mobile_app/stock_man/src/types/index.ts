// ============================================================
// Stock Man — Public types barrel
//
// Re-exports the domain models and the API helpers so callers
// can `import type { StockItem, UUID, extractResults } from "@/types"`.
// We re-export `models` first (which owns `Paginated` / `ApiError`)
// and then narrow `api` to its own additions (`QueryParams`,
// `QueryKey`, `extractResults`, `isPaginated`).
// ============================================================

export * from "./models";
;
;
