// ============================================================
// Stock Man — Button bileşen testleri
// ============================================================
//
// Button varyant, size, loading ve disabled davranışlarını
// test eder. NativeWind class'ları runtime'da çözümlenmediği
// için class adlarını değil, "render olur mu / onPress
// tetiklenir mi / loading spinner görünür mü" sorularını
// soruyoruz (smoke test pattern'i).
// ============================================================

import React from "react";
import { render, fireEvent, screen } from "@testing-library/react-native";
import { ActivityIndicator, Text } from "react-native";
import { Button } from "@/components/ui/Button";

describe("Button — temel render", () => {
  it("label string olarak render olur", () => {
    render(<Button onPress={jest.fn()}>Kaydet</Button>);
    expect(screen.getByText("Kaydet")).toBeTruthy();
  });

  it("label number olarak da kabul edilir", () => {
    render(<Button onPress={jest.fn()}>{42}</Button>);
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("React node children kabul eder (string değilse direkt geçirilir)", () => {
    render(
      <Button onPress={jest.fn()}>
        <Text testID="custom-child">Custom</Text>
      </Button>
    );
    expect(screen.getByTestId("custom-child")).toBeTruthy();
  });
});

describe("Button — onPress", () => {
  it("tıklayınca onPress tetiklenir", () => {
    const onPress = jest.fn();
    render(<Button onPress={onPress}>Tıkla</Button>);
    fireEvent.press(screen.getByText("Tıkla"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("disabled=true ise onPress tetiklenmez", () => {
    const onPress = jest.fn();
    render(
      <Button onPress={onPress} disabled>
        Devre Dışı
      </Button>
    );
    fireEvent.press(screen.getByText("Devre Dışı"));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("Button — loading", () => {
  it("loading=true → ActivityIndicator render olur, label GİZLİ değil (kod yapısı: loading ? spinner : leftIcon ? : children)", () => {
    render(
      <Button onPress={jest.fn()} loading>
        Kaydet
      </Button>
    );
    // ActivityIndicator varsa loading çalışıyor demektir
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeTruthy();
  });

  it("loading=true → onPress tetiklenmez (otomatik disabled)", () => {
    const onPress = jest.fn();
    render(
      <Button onPress={onPress} loading>
        Kaydet
      </Button>
    );
    // Pressable disabled olduğu için press event'i no-op
    const pressable = screen.getByText("Kaydet").parent;
    if (pressable) {
      fireEvent.press(pressable);
    }
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("Button — varyant ve size (smoke test)", () => {
  it("tüm varyantlar render olur (crash etmez)", () => {
    const variants = ["primary", "secondary", "outline", "ghost", "destructive"] as const;
    for (const v of variants) {
      const { unmount } = render(
        <Button onPress={jest.fn()} variant={v}>
          {v}
        </Button>
      );
      expect(screen.getByText(v)).toBeTruthy();
      unmount();
    }
  });

  it("tüm size'lar render olur (crash etmez)", () => {
    const sizes = ["sm", "md", "lg", "xl"] as const;
    for (const s of sizes) {
      const { unmount } = render(
        <Button onPress={jest.fn()} size={s}>
          {s}
        </Button>
      );
      expect(screen.getByText(s)).toBeTruthy();
      unmount();
    }
  });
});

describe("Button — accessibility", () => {
  it("accessibilityLabel verilirse element'e set edilir", () => {
    render(
      <Button onPress={jest.fn()} accessibilityLabel="kaydet-butonu">
        Kaydet
      </Button>
    );
    // Pressable doğrudan bulunamadığında parent'lara bakar
    expect(screen.getByLabelText("kaydet-butonu")).toBeTruthy();
  });

  it("accessibilityRole='button' otomatik set", () => {
    render(<Button onPress={jest.fn()}>x</Button>);
    expect(screen.getByRole("button")).toBeTruthy();
  });
});
