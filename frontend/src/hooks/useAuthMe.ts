"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import api from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { queryKeys } from "@/lib/queryKeys";
import type { AuthUser } from "@/types/user.types";

/** /auth/me/ yanıtı — backend'den gelen ham veri */
interface AuthMeResponse {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  branch: string | null;
  branch_name: string | null;
  available_branches: { id: string; name: string }[];
  is_superuser: boolean;
  all_permissions: string[];
}

/** AuthUser'a dönüştür */
function toAuthUser(data: AuthMeResponse): AuthUser {
  return {
    id: data.id,
    username: data.username,
    first_name: data.first_name,
    last_name: data.last_name,
    branch_id: data.branch ?? undefined,
    branch_name: data.branch_name ?? undefined,
    available_branches: data.available_branches ?? [],
    is_superuser: data.is_superuser,
    permissions: data.all_permissions || [],
  };
}

/**
 * /auth/me/ çağrısını React Query ile cache'ler.
 *
 * - staleTime: 5 dakika — bu süre içinde tekrar fetch yapılmaz
 * - Başarılı fetch'te Zustand store'u günceller
 * - Token yoksa fetch yapılmaz (enabled: false)
 *
 * AuthGuard her sayfa geçişinde bu hook'u kullanır.
 * İlk çağrıdan sonraki 5 dakika boyunca cache'den anında çözülür.
 */
export function useAuthMe() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const query = useQuery<AuthMeResponse>({
    queryKey: queryKeys.authMe,
    queryFn: async () => {
      const res = await api.get<AuthMeResponse>("/auth/me/");
      return res.data;
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 dakika — bu süre içinde cache'den çöz
    gcTime: 30 * 60 * 1000, // 30 dakika garbage collection
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Fetch başarılı olduğunda Zustand store'u güncelle
  // NOT: query.data yerine dataUpdatedAt kullanılır; TanStack her refetch'te
  // yeni bir data referansı üretir (içerik aynı olsa bile), bu da effect'i
  // her refetch'te tetiklerdi. Timestamp sadece gerçek veri değişiminde artar.
  useEffect(() => {
    if (query.data && token) {
      const user = toAuthUser(query.data);
      const store = useAuthStore.getState();
      // Sadece gerçekten değişmişse güncelle (gereksiz re-render önleme)
      const storePerms = store.user?.permissions ?? [];
      const newPerms = user.permissions ?? [];
      if (
        store.user?.id !== user.id ||
        storePerms.length !== newPerms.length
      ) {
        store.setAuth(user, token);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.dataUpdatedAt, token]);

  return {
    user: query.data ? toAuthUser(query.data) : null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    invalidate: () => queryClient.invalidateQueries({ queryKey: queryKeys.authMe }),
  };
}

