import { useQuery } from "@tanstack/react-query"
import { useDebounce } from "@/hooks/useDebounce"
import { searchApi } from "../services/searchApi"
import type { SearchResponse } from "../types"

const MIN_QUERY_LENGTH = 2

/**
 * Global arama hook'u.
 *
 * - 300ms debounce ile gereksiz istek önlenir.
 * - 2 karakterden kısa sorgular için istek gönderilmez.
 * - Sonuçlar 30 saniye cache'lenir (arama sayfaları için yeterli).
 */
export function useGlobalSearch(query: string) {
  const debouncedQuery = useDebounce(query, 300)

  return useQuery<SearchResponse>({
    queryKey: ["global-search", debouncedQuery],
    queryFn: () => searchApi.search({ q: debouncedQuery }),
    enabled: debouncedQuery.trim().length >= MIN_QUERY_LENGTH,
    staleTime: 30_000,
    gcTime: 60_000,
  })
}
