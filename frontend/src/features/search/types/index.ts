// Frontend'den API response'u temsil eden tipler.
// Backend'in GlobalSearchView response formatıyla 1:1 uyumlu olmalı.

export interface SearchResultItem {
  id: string
  title: string
  subtitle: string
}

export interface SearchResultGroup {
  label: string
  icon: string
  url: string
  count: number
  items: SearchResultItem[]
}

export interface SearchResponse {
  query: string
  is_uuid: boolean
  total_count: number
  results: Record<string, SearchResultGroup>
}

// Desteklenen modül key'leri (registry ile senkronize — searchModuleLabels.ts)
export type { SearchModuleKey } from "../utils/searchModuleLabels"
