import { useCallback, useEffect, useRef } from "react";
import type { CartItem, Language, ProductUnitInfo } from "@/types";
import { useUIStore } from "@/store/ui-store";
import { buildCartQuantityToast } from "@/utils/cartToast";

const TOAST_DEBOUNCE_MS = 180;

interface PendingCartToast {
  productName: string;
  productNameEn?: string;
  unit: ProductUnitInfo;
  quantityDelta: number;
  language: Language;
}

export function useDebouncedCartQuantityToast() {
  const showToast = useUIStore((s) => s.showToast);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingToastRef = useRef<PendingCartToast | null>(null);

  const clearPendingCartToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingToastRef.current = null;
  }, []);

  const flushCartToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const pendingToast = pendingToastRef.current;
    pendingToastRef.current = null;

    if (!pendingToast || pendingToast.quantityDelta === 0) {
      return;
    }

    const toastMessage = buildCartQuantityToast(pendingToast);
    if (toastMessage) {
      showToast(
        toastMessage,
        pendingToast.quantityDelta > 0 ? "success" : "info",
      );
    }
  }, [showToast]);

  const enqueueCartToast = useCallback(
    (payload: PendingCartToast) => {
      const pendingToast = pendingToastRef.current;
      if (
        pendingToast &&
        pendingToast.productName === payload.productName &&
        pendingToast.productNameEn === payload.productNameEn &&
        pendingToast.unit.id === payload.unit.id &&
        pendingToast.language === payload.language
      ) {
        pendingToastRef.current = {
          ...pendingToast,
          quantityDelta: pendingToast.quantityDelta + payload.quantityDelta,
        };
      } else {
        if (pendingToast) {
          flushCartToast();
        }
        pendingToastRef.current = payload;
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        flushCartToast();
      }, TOAST_DEBOUNCE_MS);
    },
    [flushCartToast],
  );

  const enqueueCartItemToast = useCallback(
    (
      item: Pick<CartItem, "productName" | "productNameEn" | "unit">,
      quantityDelta: number,
      language: Language,
    ) => {
      enqueueCartToast({
        productName: item.productName,
        productNameEn: item.productNameEn,
        unit: item.unit,
        quantityDelta,
        language,
      });
    },
    [enqueueCartToast],
  );

  useEffect(() => {
    return () => {
      flushCartToast();
    };
  }, [flushCartToast]);

  return {
    enqueueCartToast,
    enqueueCartItemToast,
    flushCartToast,
    clearPendingCartToast,
  };
}
