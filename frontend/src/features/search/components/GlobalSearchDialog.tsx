"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { Search, X, Loader2, Clock } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useGlobalSearch } from "../hooks/useGlobalSearch"
import { useNavSearch } from "../hooks/useNavSearch"
import { SearchResultGroupSection } from "./SearchResultGroup"
import { NavSearchResultSection } from "./NavSearchResultSection"
import { MIN_NAV_QUERY_LENGTH } from "../utils/navSearch"

// ---------------------------------------------------------------------------
// Recent searches — localStorage helpers
// ---------------------------------------------------------------------------

const RECENT_SEARCHES_KEY = "ramis_recent_searches"
const MAX_RECENT_SEARCHES = 5

function loadRecentSearches(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed))
      return parsed
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .slice(0, MAX_RECENT_SEARCHES)
    return []
  } catch {
    return []
  }
}

function persistRecentSearches(searches: string[]): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches.slice(0, MAX_RECENT_SEARCHES)))
  } catch {
    // localStorage full or inaccessible — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GlobalSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Command Palette tarzı arama dialog'u.
 *
 * Özellikler:
 *  - Ctrl+K / ⌘K kısayolu (AppHeader'dan tetiklenir)
 *  - Menü/sayfa navigasyonu (client-side, RBAC filtreli)
 *  - 300ms debounce ile API istek optimizasyonu
 *  - UUID ve metin araması desteği
 *  - RBAC: kullanıcının yetkisiz olduğu modüller sonuçlarda görünmez
 *  - Son 5 aramayı localStorage'da tutar
 *  - ↑↓ ok tuşları ile klavye navigasyonu
 */
export function GlobalSearchDialog({ open, onOpenChange }: GlobalSearchDialogProps) {
  const t = useTranslations("common.globalSearch")
  const router = useRouter()

  const [query, setQuery] = useState("")
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const resultsContainerRef = useRef<HTMLDivElement>(null)

  const { data, isFetching, isError } = useGlobalSearch(query)
  const navResults = useNavSearch(query)

  // ── Dialog open/close lifecycle ──────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setRecentSearches(loadRecentSearches())
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    } else {
      setQuery("")
      setSelectedIndex(-1)
    }
  }, [open])

  const hasEntityResults = Boolean(data && data.total_count > 0)
  const hasNavResults = navResults.length > 0
  const hasAnyResults = hasNavResults || hasEntityResults
  const totalResultCount = navResults.length + (data?.total_count ?? 0)

  const queryLongEnough = query.trim().length >= MIN_NAV_QUERY_LENGTH

  const showEmptyState =
    queryLongEnough &&
    !isFetching &&
    !isError &&
    !hasAnyResults

  // Flat list for ↑↓ keyboard navigation (nav first, then API results)
  const flatUrls = useMemo(() => {
    const urls: string[] = navResults.map((n) => n.href)
    if (hasEntityResults && data) {
      for (const group of Object.values(data.results)) {
        for (let i = 0; i < group.items.length; i++) {
          urls.push(group.url)
        }
      }
    }
    return urls
  }, [navResults, data, hasEntityResults])

  const entityGroupStartIndices: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {}
    if (!hasEntityResults || !data) return map
    let idx = navResults.length
    for (const [key, group] of Object.entries(data.results)) {
      map[key] = idx
      idx += group.items.length
    }
    return map
  }, [data, hasEntityResults, navResults.length])

  useEffect(() => {
    setSelectedIndex(-1)
  }, [data, navResults])

  // ── Recent search management ─────────────────────────────────────────────
  const addRecentSearch = useCallback((searchQuery: string) => {
    const trimmed = searchQuery.trim()
    if (!trimmed) return
    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s.toLowerCase() !== trimmed.toLowerCase())
      const updated = [trimmed, ...filtered].slice(0, MAX_RECENT_SEARCHES)
      persistRecentSearches(updated)
      return updated
    })
  }, [])

  const removeRecentSearch = useCallback((searchQuery: string) => {
    setRecentSearches((prev) => {
      const updated = prev.filter((s) => s !== searchQuery)
      persistRecentSearches(updated)
      return updated
    })
  }, [])

  const handleResultSelect = useCallback(
    (url: string) => {
      if (query.trim()) {
        addRecentSearch(query.trim())
      }
      onOpenChange(false)
      router.push(url)
    },
    [query, addRecentSearch, onOpenChange, router],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!flatUrls.length) return

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setSelectedIndex((prev) => (prev < flatUrls.length - 1 ? prev + 1 : 0))
          break
        case "ArrowUp":
          e.preventDefault()
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : flatUrls.length - 1))
          break
        case "Enter":
          e.preventDefault()
          if (selectedIndex >= 0 && flatUrls[selectedIndex]) {
            handleResultSelect(flatUrls[selectedIndex])
          }
          break
      }
    },
    [flatUrls, selectedIndex, handleResultSelect],
  )

  useEffect(() => {
    if (selectedIndex < 0 || !resultsContainerRef.current) return
    const el = resultsContainerRef.current.querySelector(
      `[data-search-index="${selectedIndex}"]`,
    ) as HTMLElement | null
    el?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  const showRecentSearches = !query && recentSearches.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id="global-search-dialog"
        showCloseButton={false}
        className="overflow-hidden p-0 max-w-lg top-[20vh] translate-y-0 data-[state=open]:slide-in-from-top-4"
        aria-label={t("dialogAriaLabel")}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          {isFetching && queryLongEnough ? (
            <Loader2
              size={16}
              className="text-blue-500 shrink-0 animate-spin"
              aria-label={t("searchingAriaLabel")}
            />
          ) : (
            <Search size={16} className="text-muted-foreground dark:text-muted-foreground shrink-0" />
          )}

          <input
            id="global-search-input"
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("inputPlaceholder")}
            className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder:text-muted-foreground dark:placeholder:text-muted-foreground outline-none"
            aria-label={t("inputAriaLabel")}
            autoComplete="off"
            spellCheck={false}
          />

          {query && (
            <button
              onClick={() => {
                setQuery("")
                setSelectedIndex(-1)
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              aria-label={t("clearAriaLabel")}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div
          id="global-search-results"
          ref={resultsContainerRef}
          className="max-h-[60vh] overflow-y-auto py-2 px-1"
          role="listbox"
          aria-label={t("resultsAriaLabel")}
        >
          {isError && (
            <p className="px-4 py-6 text-center text-sm text-rose-500">
              {t("errorMessage")}
            </p>
          )}

          {showEmptyState && (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <Search size={32} className="text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-muted-foreground">
                {t("noResults", { query })}
              </p>
              {data?.is_uuid && (
                <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                  {t("uuidSearchHint")}
                </p>
              )}
            </div>
          )}

          {!query && (
            <>
              {showRecentSearches ? (
                <div className="px-2">
                  <div className="flex items-center gap-2 px-2 py-2">
                    <Clock size={14} className="text-muted-foreground shrink-0" />
                    <span className="text-xs font-ui-medium text-muted-foreground uppercase tracking-wide">
                      {t("recentSearchesTitle")}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {recentSearches.map((search) => (
                      <div
                        key={search}
                        role="button"
                        tabIndex={0}
                        onClick={() => setQuery(search)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setQuery(search) } }}
                        className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-slate-800 dark:text-slate-200 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 group cursor-pointer"
                      >
                        <Clock size={13} className="text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate">{search}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeRecentSearch(search)
                          }}
                          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-slate-600 dark:hover:text-slate-300 transition-all"
                          aria-label={t("removeRecentAriaLabel", { search })}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <Search size={28} className="text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-muted-foreground">{t("startPrompt")}</p>
                  <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-1">
                    {t("startHint")}
                  </p>
                </div>
              )}
            </>
          )}

          {queryLongEnough && hasNavResults && (
            <NavSearchResultSection
              title={t("pagesGroupTitle")}
              badgeLabel={t("pagesGroupBadge")}
              items={navResults}
              onSelect={handleResultSelect}
              selectedIndex={selectedIndex}
              startIndex={0}
            />
          )}

          {hasEntityResults &&
            data &&
            Object.entries(data.results).map(([key, group]) => (
              <SearchResultGroupSection
                key={key}
                moduleKey={key}
                group={group}
                onSelect={handleResultSelect}
                selectedIndex={selectedIndex}
                startIndex={entityGroupStartIndices[key] ?? navResults.length}
              />
            ))}
        </div>

        {queryLongEnough && hasAnyResults && (
          <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-4 py-2">
            <span className="text-xs text-muted-foreground dark:text-muted-foreground">
              {t("resultCount", { count: totalResultCount })}
            </span>
            <span className="text-xs text-muted-foreground dark:text-muted-foreground">
              {t("footerHint")}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
