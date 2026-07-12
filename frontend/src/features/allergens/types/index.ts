export interface Allergen {
  id: string
  code: string
  name: string
  prevalence_pct: number
  risk_score: number
  sort_order?: number
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export type AllergenFormState = {
  code: string
  name: string
  prevalence_pct: string
  risk_score: string
  sort_order: string
}
