import { useCallback } from "react";
import { useRouter, type Href } from "expo-router";

/** Expo typed routes bazen gecikmeli üretilir; bilinen olmayan fallback'ler için string kabul edilir. */
export type NavigateBackFallback = Href | (string & {});

/**
 * Tutarlı geri navigasyonu: stack varsa pop, yoksa isteğe bağlı fallback.
 */
export function useNavigateBack(fallback?: NavigateBackFallback) {
  const router = useRouter();

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (fallback) {
      router.replace(fallback as Href);
    }
  }, [router, fallback]);

  const canGoBack = router.canGoBack() || !!fallback;

  return { goBack, canGoBack };
}
