/** DRF `next` mutlak veya göreli URL olabilir. */
export function pageFromDrfNext(next: string | null): number | undefined {
  if (!next) return undefined
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost"
    const url = new URL(next, base)
    const p = url.searchParams.get("page")
    return p ? Number.parseInt(p, 10) : undefined
  } catch {
    return undefined
  }
}
