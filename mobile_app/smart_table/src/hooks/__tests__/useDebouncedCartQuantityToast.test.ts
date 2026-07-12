import { act, renderHook } from "@testing-library/react-native";
import { useDebouncedCartQuantityToast } from "@/hooks/useDebouncedCartQuantityToast";
import { useUIStore } from "@/store/ui-store";
import type { CartItem, ProductUnitInfo } from "@/types";

const unit: ProductUnitInfo = {
  id: "unit-piece",
  name: "Adet",
  nameEn: "Piece",
  type: "PIECE",
  multiplier: 1,
  price: 100,
  isDefault: true,
};

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: "line-1",
    productId: "burger-1",
    productName: "Burger",
    productNameEn: "Burger",
    imageUrl: "",
    unit,
    quantity: 2,
    modifiers: [],
    productSalePrice: 100,
    unitPrice: 100,
    totalPrice: 200,
    ...overrides,
  };
}

describe("useDebouncedCartQuantityToast", () => {
  let showToast: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    showToast = jest.fn();
    useUIStore.setState((state) => ({
      ...state,
      toast: { id: 0, visible: false, message: "", type: "info" },
      showToast,
      hideToast: jest.fn(),
    }));
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it("ayni urunun hizli miktar artisini tek toastta birlestirir", () => {
    const { result } = renderHook(() => useDebouncedCartQuantityToast());

    act(() => {
      result.current.enqueueCartToast({
        productName: "Izgara Kofte",
        productNameEn: "Grilled Meatballs",
        unit,
        quantityDelta: 1,
        language: "tr",
      });
      result.current.enqueueCartToast({
        productName: "Izgara Kofte",
        productNameEn: "Grilled Meatballs",
        unit,
        quantityDelta: 2,
        language: "tr",
      });
      jest.advanceTimersByTime(180);
    });

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      "Izgara Kofte - Adet - 3 adet eklendi",
      "success",
    );
  });

  it("cart item yardimcisi ile cikarma toastini debounce eder", () => {
    const { result } = renderHook(() => useDebouncedCartQuantityToast());

    act(() => {
      result.current.enqueueCartItemToast(makeCartItem(), -2, "tr");
      jest.advanceTimersByTime(180);
    });

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      "Burger - Adet - 2 adet çıkartıldı",
      "info",
    );
  });

  it("component kapanirken bekleyen toasti dusurur", () => {
    const { result, unmount } = renderHook(() =>
      useDebouncedCartQuantityToast(),
    );

    act(() => {
      result.current.enqueueCartToast({
        productName: "Izgara Kofte",
        productNameEn: "Grilled Meatballs",
        unit,
        quantityDelta: 1,
        language: "tr",
      });
    });

    act(() => {
      unmount();
    });

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      "Izgara Kofte - Adet - 1 adet eklendi",
      "success",
    );
  });
});
