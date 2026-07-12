// ============================================================
// Stock Man — Amount bileşen testleri
// ============================================================

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Amount } from "@/components/ui/Amount";
import { useUIStore } from "@/store/useUIStore";

let mockCanView = true;
jest.mock("@/hooks/usePermission", () => ({
  useCanViewAmounts: () => mockCanView,
}));

beforeEach(() => {
  mockCanView = true;
  useUIStore.setState({ language: "tr", themePreference: "system" });
});

describe("Amount — izin varsa", () => {
  it("TR dilinde ₺ sembolü ile formatlanır", () => {
    mockCanView = true;
    render(<Amount value={1234.5} />);
    const flat = JSON.stringify(screen.toJSON());
    expect(flat).toContain("₺");
    expect(flat).toContain("1.234");
  });

  it("en dilinde ₺ sembolü kullanılır", () => {
    mockCanView = true;
    useUIStore.setState({ language: "en" });
    render(<Amount value={100} />);
    const text = JSON.stringify(screen.toJSON());
    expect(text).toContain("₺");
  });

  it("inline mode render olur", () => {
    mockCanView = true;
    render(<Amount value={50} inline />);
    const text = JSON.stringify(screen.toJSON());
    expect(text).not.toContain("•••");
  });

  it("bg dilinde € sembolü kullanılır", () => {
    mockCanView = true;
    useUIStore.setState({ language: "bg" });
    render(<Amount value={100} />);
    const text = JSON.stringify(screen.toJSON());
    expect(text).toContain("€");
  });
});

describe("Amount — izin yoksa (maskelenmiş)", () => {
  it("varsayılan → '•••' maskesi + para birimi sembolü", () => {
    mockCanView = false;
    render(<Amount value={1234.5} />);
    const text = JSON.stringify(screen.toJSON());
    expect(text).toContain("•••");
    expect(text).toContain("₺");
  });

  it("inline=true → '••• <symbol>' formatında", () => {
    mockCanView = false;
    render(<Amount value={9999} inline />);
    const text = JSON.stringify(screen.toJSON());
    expect(text).toContain("•••");
    expect(text).toContain("₺");
  });

  it("accessibilityLabel='Amount hidden — insufficient permission' set", () => {
    mockCanView = false;
    render(<Amount value={1000} />);
    expect(
      screen.getByLabelText("Amount hidden — insufficient permission")
    ).toBeTruthy();
  });

  it("mask altındayken gerçek değer UI'a sızmaz", () => {
    mockCanView = false;
    render(<Amount value={9999.99} />);
    const text = JSON.stringify(screen.toJSON());
    expect(text).not.toContain("9.999");
    expect(text).not.toContain("9999");
  });
});

describe("Amount — render", () => {
  it("crash etmeden render olur", () => {
    mockCanView = true;
    render(<Amount value={1234} />);
    expect(screen.toJSON()).toBeTruthy();
  });
});
