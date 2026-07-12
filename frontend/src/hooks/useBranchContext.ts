"use client"

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/useAuthStore'
import { useModulePermissions } from '@/hooks/useModulePermissions'
import { adminApi } from '@/features/admin/services/adminApi'
import type { Branch, AuthUser } from '@/types/user.types'

function branchesFromAvailable(available: AuthUser['available_branches']): Branch[] {
  if (!available?.length) return []
  return available.map(b => ({
    id: b.id,
    name: b.name,
    code: '',
    address: null,
    phone: null,
    email: null,
    website: null,
    tax_office: null,
    tax_number: null,
    registry_no: null,
    mersis_no: null,
    logo: null,
    users_count: 0,
    users_list: [],
  }))
}

interface UseBranchContextOptions {
  /** React Query cache key suffix. Farklı sayfalar kendi key'lerini verebilir. */
  queryKey?: string
  enabled?: boolean
}

interface UseBranchContextReturn {
  branchList: Branch[]
  branchOverride: string
  setBranchOverride: (id: string) => void
  effectiveBranchId: string
  branchName: string | undefined
  showBranchPicker: boolean
  isSuperuser: boolean | undefined
  user: AuthUser | null
}

/**
 * Şube seçimi için tekrar eden boilerplate'i tek bir hook'ta toplar.
 *
 * Kullanım alanları: TablesPage, ReservationsPage (ve ileride diğer sayfalar).
 *
 * @example
 *   const { effectiveBranchId, branchList, showBranchPicker, setBranchOverride } = useBranchContext()
 */
export function useBranchContext({
  queryKey = 'branch-context',
  enabled = true,
}: UseBranchContextOptions = {}): UseBranchContextReturn {
  const user = useAuthStore(s => s.user)
  const { isSuperuser } = useModulePermissions()

  const fromProfile = useMemo(() => branchesFromAvailable(user?.available_branches), [user?.available_branches])

  const fetchAdminBranches =
    Boolean(enabled) &&
    fromProfile.length === 0 &&
    Boolean(isSuperuser && !user?.branch_id)

  const { data: adminBranchList = [] } = useQuery<Branch[]>({
    queryKey: ['branches', queryKey],
    queryFn: () => adminApi.getBranches(),
    enabled: fetchAdminBranches,
  })

  const branchList = useMemo((): Branch[] => {
    if (fromProfile.length > 0) return fromProfile
    if (adminBranchList.length > 0) return adminBranchList
    if (user?.branch_id) {
      return branchesFromAvailable([
        { id: user.branch_id, name: user.branch_name ?? 'Şube' },
      ])
    }
    return []
  }, [fromProfile, adminBranchList, user?.branch_id, user?.branch_name])

  const [branchOverride, setBranchOverride] = useState('')

  useEffect(() => {
    if (user?.branch_id) return
    if (branchList.length > 0 && !branchOverride) {
      setBranchOverride(branchList[0].id)
    }
  }, [user?.branch_id, branchList, branchOverride])

  /** Çok şubeli kullanıcıda seçilen şube; yoksa profil branch_id */
  const effectiveBranchId = branchOverride || user?.branch_id || ''
  const branchName =
    branchList.find(b => b.id === effectiveBranchId)?.name ?? user?.branch_name
  const showBranchPicker = Boolean(
    branchList.length > 1 || (Boolean(isSuperuser && !user?.branch_id) && branchList.length > 0)
  )

  return {
    branchList,
    branchOverride,
    setBranchOverride,
    effectiveBranchId,
    branchName,
    showBranchPicker,
    isSuperuser,
    user,
  }
}
