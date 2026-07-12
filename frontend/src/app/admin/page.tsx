"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"

/**
 * Eski /admin yolu: Nginx `location /admin/` ile Django admin aynı önekte çakışır.
 * Uygulama yönetim paneli `/panel` altına taşındı; burada sorgu korunarak yönlendirilir.
 */
function LegacyAdminRedirectInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const q = searchParams.toString()
    router.replace("/panel" + (q ? `?${q}` : ""))
  }, [router, searchParams])

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
    </div>
  )
}

export default function LegacyAdminRedirect() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-slate-50">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <LegacyAdminRedirectInner />
    </Suspense>
  )
}
