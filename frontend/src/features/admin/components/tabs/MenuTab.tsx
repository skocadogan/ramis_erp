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
          <h2 className="text-2xl font-ui-bold text-slate-900 dark:text-slate-100">{t('menu.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('menu.description')}</p>
        </div>
        {canManageProducts && (
          <Link href="/menu-management" className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-ui-medium text-white hover:bg-slate-800 shadow-sm transition-colors">
            <UtensilsCrossed size={16} />{t('menu.goToPage')}
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-border shadow-sm dark:bg-slate-900 dark:border-slate-700">
          <div className="px-4 py-3 border-b border-border dark:border-slate-700">
            <h3 className="text-sm font-ui-bold text-slate-800 dark:text-slate-200">{t('menu.categoriesCount', { count: categories.length })}</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {categories.map(cat => (
              <div key={cat.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground w-2">{cat.order}</span>
                  <span className="font-ui-medium text-slate-800 dark:text-slate-200">{cat.name}</span>
                </div>
                <span className={`text-xs font-ui-semibold ${cat.is_active ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {cat.is_active ? t('common.active') : t('common.passive')}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-border shadow-sm dark:bg-slate-900 dark:border-slate-700">
          <div className="px-4 py-3 border-b border-border dark:border-slate-700">
            <h3 className="text-sm font-ui-bold text-slate-800 dark:text-slate-200">{t('menu.productsCount', { count: products.length })}</h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto dark:divide-slate-800">
            {products.map(p => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="font-ui-medium text-slate-800 dark:text-slate-200">{p.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{p.category_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-ui-bold text-slate-900 dark:text-white">
                    {formatAmount(p.base_price, canViewAmounts)}
                  </span>
                  <span className={`text-2xs font-ui-semibold ${p.is_active ? "text-emerald-600" : "text-muted-foreground"}`}>
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
