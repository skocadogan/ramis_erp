"use client"

import { useQuery } from "@tanstack/react-query"
import { adminApi } from "@/features/admin/services/adminApi"

export interface StaffMember {
  id: string
  name: string
}

/**
 * Belirtilen şubeye bağlı aktif personel listesini getirir.
 */
export function useBranchStaff(branchId?: string) {
  return useQuery<StaffMember[]>({
    queryKey: ["branch_staff", branchId],
    queryFn: async () => {
      const params: Record<string, unknown> = {
        is_active: true,
      }
      if (branchId) {
        params.branch = branchId
      }
      const results = await adminApi.fetchAllUsers(params)
      return results.map((u) => ({
        id: u.id,
        name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username,
      }))
    },
    enabled: !!branchId,
    staleTime: 5 * 60 * 1000, // 5 dk cache
  })
}
