import { renderHook, act } from "@testing-library/react-native";
import { useProductDetailModifierToggle } from "@/hooks/useProductDetailModifierToggle";

describe("useProductDetailModifierToggle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("modifier toggle sırasında sadece yerel secimi gunceller", () => {
    const applyModifierToggle = jest.fn(() => ({ g1: ["m2"] }));

    const { result } = renderHook(() =>
      useProductDetailModifierToggle(applyModifierToggle),
    );

    act(() => {
      result.current("g1", "m2");
    });

    expect(applyModifierToggle).toHaveBeenCalledTimes(1);
    expect(applyModifierToggle).toHaveBeenCalledWith("g1", "m2");
  });
});
