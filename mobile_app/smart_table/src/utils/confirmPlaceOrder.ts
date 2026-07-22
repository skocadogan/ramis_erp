// Sepet → mutfak sipariş onayı (smart_table Dialog)

import { useDialogStore } from "@/store/dialog-store";
import type { Language } from "@/types";

export function requestPlaceOrderConfirmation(options: {
  language: Language;
  onConfirm: () => void;
  onClearCart: () => void;
}): void {
  const isTr = options.language === "tr";
  useDialogStore.getState().show(
    isTr ? "Sipariş Onayı" : "Order Confirmation",
    isTr
      ? "Siparişiniz Direkt Mutfağa İletilecektir. Onaylıyor musunuz?"
      : "Your order will be sent directly to the kitchen. Do you confirm?",
    [
      {
        text: isTr ? "İptal" : "Cancel",
        style: "cancel",
      },
      {
        text: isTr ? "Sepeti sil" : "Clear cart",
        style: "destructive",
        onPress: () => {
          options.onClearCart();
          useDialogStore
            .getState()
            .alert(
              isTr ? "Bilgi" : "Info",
              isTr ? "Sepetiniz Boşaltıldı." : "Your cart has been emptied.",
            );
        },
      },
      {
        text: isTr ? "Onaylıyorum" : "Confirm",
        style: "default",
        onPress: options.onConfirm,
      },
    ],
  );
}
