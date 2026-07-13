"use client"

import { UtensilsCrossed } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { formatAmount } from "@/lib/formatters"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"

export interface Category {
  id: string
  name: string
  is_active: boolean
  order: number
}

export interface Product {
  id: string
  name: string
  category_name: string
  base_price: string
  is_active: boolean
}

interface MenuTabProps {
  categories: Category[]
  products: Product[]
  /** Ürün yönetimi (menu.manage_product) — yoksa tam menü sayfası linki gösterilmez */
  canManageProducts?: boolean
}

export function MenuTab({ categories, products, canManageProducts }: MenuTabProps) {
  const t = useTranslations("admin")
  const canViewAmounts = useCanViewAmounts()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t('menu.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('menu.description')}</p>
        </div>
        {canManageProducts && (
          <Link href="/menu-management" className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white hover: shadow-sm transition-colors">
            <UtensilsCrossed size={16} />{t('menu.goToPage')}
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-border shadow-sm bg-card border-border">
          <div className="px-4 py-3 border-b border-border border-border">
            <h3 className="text-sm font-bold text-foreground">{t('menu.categoriesCount', { count: categories.length })}</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {categories.map(cat => (
              <div key={cat.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground w-2">{cat.order}</span>
                  <span className="font-medium text-foreground">{cat.name}</span>
                </div>
                <span className={`text-xs font-semibold ${cat.is_active ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {cat.is_active ? t('common.active') : t('common.passive')}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border shadow-sm bg-card border-border">
          <div className="px-4 py-3 border-b border-border border-border">
            <h3 className="text-sm font-bold text-foreground">{t('menu.productsCount', { count: products.length })}</h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto dark:divide-slate-800">
            {products.map(p => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="font-medium text-foreground">{p.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{p.category_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold dark:text-white">
                    {formatAmount(p.base_price, canViewAmounts)}
                  </span>
                  <span className={`text-2xs font-semibold ${p.is_active ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {p.is_active ? t('common.active') : t('common.passive')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
