import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { usePosStore, selectCartTotal } from "@/store/usePosStore";
import { useShallow } from "zustand/react/shallow";
import { getPosDisplayWsUrl, runManagedWebSocket } from "@/lib/ws";
import { buildIdleDisplayUpdatePayload, registerPosCustomerDisplayPublisher } from "@/features/pos/lib/posCustomerDisplaySync";
import type { CartItem, PosActiveOrderLineItem, PosActiveOrderSnapshot, Product } from "@/types/pos";

/**
 * Kasiyer tarafında sepet değişimlerini izler ve WebSocket üzerinden
 * bağlı olan müşteri ekranına (Display) yayınlar.
 *
 * @param terminalId Kasa terminalinin benzersiz kimliği (örn: 'kasa-01')
 * @param enabled Yalnızca POS ekranında true olmalıdır
 */
export const usePosDisplaySync = (terminalId: string | null, enabled = true) => {
  const tTableLabels = useTranslations("pos.table");
  const tNotifications = useTranslations("pos.notifications");
  const newTakeawayHeadingRef = useRef<string>("");
  const customerSurveyAnsweredMessageRef = useRef<string>("");
  useEffect(() => { newTakeawayHeadingRef.current = tTableLabels("newTakeawaySlot"); }, [tTableLabels]);
  useEffect(() => { customerSurveyAnsweredMessageRef.current = tNotifications("customerSurveyAnswered"); }, [tNotifications]);

  const ws = useRef<WebSocket | null>(null);
  const showCustomerDisplay = usePosStore((s) => s.showCustomerDisplay);
  const { cart, selectedTable, activeDisplayOrder, displayMetadata, displayOptionsModal, displayAllergenModal, displayRecommendedModal, displaySurveyPrompt, displaySuccessSignal, setDisplayCompletedSurveyContext, setDisplaySurveyPrompt, setDisplaySuccessSignal } = usePosStore(useShallow((s) => ({
    cart: s.cart,
    selectedTable: s.selectedTable,
    activeDisplayOrder: s.activeDisplayOrder,
    displayMetadata: s.displayMetadata,
    displayOptionsModal: s.displayOptionsModal,
    displayAllergenModal: s.displayAllergenModal,
    displayRecommendedModal: s.displayRecommendedModal,
    displaySurveyPrompt: s.displaySurveyPrompt,
    displaySuccessSignal: s.displaySuccessSignal,
    setDisplayCompletedSurveyContext: s.setDisplayCompletedSurveyContext,
    setDisplaySurveyPrompt: s.setDisplaySurveyPrompt,
    setDisplaySuccessSignal: s.setDisplaySuccessSignal,
  })));
  
  const cartTotal = usePosStore(selectCartTotal);

  const showCustomerDisplayRef = useRef(showCustomerDisplay);
  useEffect(() => {
    showCustomerDisplayRef.current = showCustomerDisplay;
  }, [showCustomerDisplay]);

  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const sendIdleDisplayState = (socket: WebSocket) => {
    try {
      socket.send(JSON.stringify(buildIdleDisplayUpdatePayload()));
    } catch (e) {
      console.error("[POS-Display] idle send failed", e);
    }
  };

  const stateRef = useRef({
    cart,
    cartTotal,
    selectedTable,
    activeDisplayOrder,
    displayMetadata,
    displayOptionsModal,
    displayAllergenModal,
    displayRecommendedModal,
    displaySurveyPrompt,
  });

  useEffect(() => {
    stateRef.current = {
      cart,
      cartTotal,
      selectedTable,
      activeDisplayOrder,
      displayMetadata,
      displayOptionsModal,
      displayAllergenModal,
      displayRecommendedModal,
      displaySurveyPrompt,
    };
  }, [cart, cartTotal, selectedTable, activeDisplayOrder, displayMetadata, displayOptionsModal, displayAllergenModal, displayRecommendedModal, displaySurveyPrompt]);

  const sendCurrentState = useCallback(() => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    if (!enabledRef.current) {
      sendIdleDisplayState(ws.current);
      return;
    }

    // Müşteri ekranı kapalıysa boş state gönder → IDLE/slayt moduna döner
    if (!showCustomerDisplayRef.current) {
      sendIdleDisplayState(ws.current);
      return;
    }

    const {
      cart: sCart,
      cartTotal: sTotal,
      selectedTable: sTable,
      activeDisplayOrder: sActiveOrder,
      displayMetadata: sMeta,
      displayOptionsModal: sOptionsModal,
      displayAllergenModal: sAllergenModal,
      displayRecommendedModal: sRecommendedModal,
      displaySurveyPrompt: sSurveyPrompt,
    } = stateRef.current;

    let finalCart = sCart;
    let finalTotal = sTotal;
    let finalSubtotal = sTotal;
    let finalDiscount = 0;
    let finalTable = sTable
      ? {
          name:
            sTable.virtual_kind === "new_slot"
              ? newTakeawayHeadingRef.current
              : sTable.name,
          number: sTable.table_number,
        }
      : null;

    if (sActiveOrder && sActiveOrder.length > 0) {
      const allItems: CartItem[] = sActiveOrder.flatMap((order: PosActiveOrderSnapshot) =>
        order.items.map((item: PosActiveOrderLineItem) => {
          const stubProduct = {
            id: "",
            name: item.product_name ?? "",
            base_price: item.unit_price,
            category: "",
            category_name: "",
            image: null as string | null,
          } satisfies Pick<
            Product,
            "id" | "name" | "base_price" | "category" | "category_name" | "image"
          >;
          return {
            cartId: item.id,
            product: stubProduct as Product,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            selectedUnit: item.unit_name
              ? { name: item.unit_name, multiplier: 1 }
              : null,
            selectedModifiers: (item.modifiers ?? []).map((m) => ({
              id: String(m.id),
              name: m.modifier_name,
              price_adjustment: Number(m.price ?? 0),
            })),
            orderLineStatus: item.status,
          };
        })
      );

      finalCart = allItems;
      finalDiscount = sActiveOrder.reduce((sum, o) => sum + (o.discount_amount || 0), 0);
      finalTotal = sActiveOrder.reduce((sum, o) => sum + o.total_amount, 0);
      finalSubtotal = finalTotal + finalDiscount;

      if (!finalTable && sActiveOrder[0].table_name) {
        finalTable = { name: sActiveOrder[0].table_name, number: 0 };
      }
    }

    const payload = {
      type: "DISPLAY_UPDATE",
      data: {
        cart: finalCart,
        total: finalTotal,
        subtotal: finalSubtotal,
        discount: finalDiscount,
        table: finalTable,
        metadata: sMeta,
        optionsModal: sOptionsModal,
        allergenModal: sAllergenModal,
        recommendedModal: sRecommendedModal,
        surveyPrompt: sSurveyPrompt,
        timestamp: new Date().toISOString(),
      },
    };

    try {
      ws.current.send(JSON.stringify(payload));
    } catch (e) {
      console.error("[POS-Display] send failed", e);
    }
  }, []);

  /** Debounced version to avoid message storm */
  const debouncedSend = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendCurrentStateDebounced = useCallback(() => {
    if (debouncedSend.current) clearTimeout(debouncedSend.current);
    debouncedSend.current = setTimeout(() => {
      debouncedSend.current = null;
      sendCurrentState();
    }, 50);
  }, [sendCurrentState]);

  useEffect(() => {
    return () => {
      if (debouncedSend.current) {
        clearTimeout(debouncedSend.current);
        debouncedSend.current = null;
      }
    };
  }, []);

  const flushPendingDisplaySuccess = useCallback(() => {
    const sock = ws.current;
    if (!displaySuccessSignal || !sock || sock.readyState !== WebSocket.OPEN) return;
    // Müşteri ekranı kapalıysa başarı sinyali gönderme
    if (!showCustomerDisplayRef.current) {
      setDisplaySuccessSignal(null);
      return;
    }
    try {
      sock.send(
        JSON.stringify({
          type: "pos_display_success",
          data: { type: displaySuccessSignal },
        })
      );
    } catch (e) {
      console.error("[POS-Display] success signal send failed", e);
      return;
    }
    setDisplaySuccessSignal(null);
  }, [displaySuccessSignal, setDisplaySuccessSignal]);

  // Ref ile tut: WS bağlantısını her displaySuccessSignal değişiminde yeniden açmayı önler
  const flushPendingDisplaySuccessRef = useRef(flushPendingDisplaySuccess);
  useLayoutEffect(() => {
    flushPendingDisplaySuccessRef.current = flushPendingDisplaySuccess;
  }, [flushPendingDisplaySuccess]);

  const sendCurrentStateRef = useRef(sendCurrentState);
  useLayoutEffect(() => {
    sendCurrentStateRef.current = sendCurrentState;
  }, [sendCurrentState]);

  useEffect(() => {
    registerPosCustomerDisplayPublisher((payload) => {
      if (payload && Object.prototype.hasOwnProperty.call(payload, "surveyPrompt")) {
        stateRef.current = {
          ...stateRef.current,
          displaySurveyPrompt: payload.surveyPrompt ?? null,
        };
      }
      sendCurrentStateRef.current();
    });
    return () => {
      registerPosCustomerDisplayPublisher(null);
    };
  }, []);

  useEffect(() => {
    if (!terminalId || !enabled) {
      const sock = ws.current;
      if (sock && sock.readyState === WebSocket.OPEN) {
        sendIdleDisplayState(sock);
      }
      ws.current = null;
      return;
    }

    const cleanup = runManagedWebSocket({
      tag: "pos-display-publisher",
      enabled: true,
      getUrl: () => getPosDisplayWsUrl(terminalId, { mode: "publisher" }),
      bindSocket: (socket) => {
        ws.current = socket;
      },
      onOpen: () => {
        console.debug(`[POS-Display] Linked to terminal: ${terminalId}`);
        sendCurrentState();
        flushPendingDisplaySuccessRef.current();
      },
      onMessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type !== "pos_display_survey") return;
          const action = payload.data?.action;
          if (action === "open" && payload.data?.prompt) {
            const prompt = payload.data.prompt;
            stateRef.current = {
              ...stateRef.current,
              displaySurveyPrompt: prompt,
            };
            setDisplaySurveyPrompt(prompt);
            sendCurrentState();
            return;
          }
          if (action === "close") {
            const completionSignal = payload.data?.completion_signal;
            const currentPrompt = stateRef.current.displaySurveyPrompt;
            stateRef.current = {
              ...stateRef.current,
              displaySurveyPrompt: null,
            };
            if (completionSignal === "PAYMENT" && currentPrompt) {
              setDisplayCompletedSurveyContext({
                sessionId: payload.data?.session_id ?? currentPrompt.session_id,
                orderId: currentPrompt.order ?? null,
                saleId: currentPrompt.sale ?? null,
              });
            }
            setDisplaySurveyPrompt(null);
            sendCurrentState();
            if (completionSignal === "PAYMENT") {
              toast.success(customerSurveyAnsweredMessageRef.current);
            }
          }
        } catch (error) {
          console.error("[POS-Display] incoming survey event parse failed", error);
        }
      },
    });

    return () => {
      const sock = ws.current;
      if (sock && sock.readyState === WebSocket.OPEN) {
        sendIdleDisplayState(sock);
      }
      cleanup();
    };
  }, [terminalId, enabled, setDisplayCompletedSurveyContext, setDisplaySurveyPrompt, sendCurrentState]);

  useEffect(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      sendCurrentStateDebounced();
    }
  }, [cart, cartTotal, selectedTable, terminalId, activeDisplayOrder, displayMetadata, displayOptionsModal, displayAllergenModal, displayRecommendedModal, displaySurveyPrompt, showCustomerDisplay, sendCurrentStateDebounced]);

  /** Seçenek/allerjen/öneri modalı gecikmesiz senkron (debounce modal kapanışında gecikme yaratmasın). */
  useEffect(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      sendCurrentState();
    }
  }, [displayOptionsModal, displayAllergenModal, displayRecommendedModal, displaySurveyPrompt, sendCurrentState]);



  useEffect(() => {
    if (!displaySuccessSignal) return;
    flushPendingDisplaySuccess();
  }, [displaySuccessSignal, flushPendingDisplaySuccess]);

  return null;
};
