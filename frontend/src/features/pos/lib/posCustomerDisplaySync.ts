import type { DisplaySurveyPrompt } from "@/types/pos";
import { usePosStore } from "@/store/usePosStore";

let publishCustomerDisplayNow:
  | ((payload?: { surveyPrompt?: DisplaySurveyPrompt | null }) => void)
  | null = null;

/** Müşteri ekranı (CFD) yalnızca POS oturumunda senkronize edilir. */
export function shouldSyncPosCustomerDisplay(): boolean {
  return usePosStore.getState().settingsContext === "pos";
}

export function resetPosCustomerDisplayState(): void {
  const st = usePosStore.getState();
  st.setDisplayCompletedSurveyContext(null);
  st.setActiveDisplayOrder(null);
  st.setDisplayMetadata({
    isPaymentMode: false,
    paymentMethod: null,
    isProcessing: false,
  });
  st.setDisplayOptionsModal(null);
  st.setDisplayAllergenModal(null);
  st.setDisplayRecommendedModal(null);
  st.setDisplaySurveyPrompt(null);
  st.setDisplaySuccessSignal(null);
}

export function signalPosCustomerDisplaySuccess(type: "ORDER" | "PAYMENT"): void {
  if (!shouldSyncPosCustomerDisplay()) return;
  usePosStore.getState().setDisplaySuccessSignal(type);
}

export function registerPosCustomerDisplayPublisher(
  publisher: ((payload?: { surveyPrompt?: DisplaySurveyPrompt | null }) => void) | null
): void {
  publishCustomerDisplayNow = publisher;
}

export function publishPosCustomerDisplaySurveyPrompt(prompt: DisplaySurveyPrompt | null): void {
  if (!shouldSyncPosCustomerDisplay()) return;
  usePosStore.getState().setDisplaySurveyPrompt(prompt);
  publishCustomerDisplayNow?.({ surveyPrompt: prompt });
}

export function buildIdleDisplayUpdatePayload() {
  return {
    type: "DISPLAY_UPDATE",
    data: {
      cart: [],
      total: 0,
      subtotal: 0,
      discount: 0,
      table: null,
      metadata: { isPaymentMode: false, paymentMethod: null, isProcessing: false },
      optionsModal: null,
      allergenModal: null,
      recommendedModal: null,
      surveyPrompt: null,
      timestamp: new Date().toISOString(),
    },
  };
}
