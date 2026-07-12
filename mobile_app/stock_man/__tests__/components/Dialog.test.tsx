// ============================================================
// Stock Man — Dialog bileşen testleri
// ============================================================
//
// Dialog (presentational) + DialogHost (store-reader) için
// temel render testleri. Modal native bileşen olduğu için
// "görsel" doğrulamadan ziyade "doğru prop'lar iletilir mi"
// sorusuna odaklanıyoruz.
// ============================================================

import React from "react";
import { act, render, fireEvent, screen } from "@testing-library/react-native";
import { Dialog, DialogHost } from "@/components/ui/Dialog";
import { useDialogStore } from "@/store/useDialogStore";

describe("Dialog — standalone", () => {
  it("title, description, actions render olur", () => {
    const onPress = jest.fn();
    render(
      <Dialog
        visible
        onClose={jest.fn()}
        title="Silmeyi onayla"
        description="Bu işlem geri alınamaz"
        actions={[
          { label: "Vazgeç", variant: "secondary" },
          { label: "Sil", variant: "destructive", onPress },
        ]}
      />
    );
    expect(screen.getByText("Silmeyi onayla")).toBeTruthy();
    expect(screen.getByText("Bu işlem geri alınamaz")).toBeTruthy();
    expect(screen.getByText("Vazgeç")).toBeTruthy();
    expect(screen.getByText("Sil")).toBeTruthy();
  });

  it("sadece title ile de render olur (description opsiyonel)", () => {
    render(
      <Dialog
        visible
        onClose={jest.fn()}
        title="Sadece başlık"
        actions={[{ label: "Tamam" }]}
      />
    );
    expect(screen.getByText("Sadece başlık")).toBeTruthy();
    expect(screen.getByText("Tamam")).toBeTruthy();
  });

  it("actions yoksa varsayılan OK butonu render olur", () => {
    render(
      <Dialog visible onClose={jest.fn()} title="Bilgi" />
    );
    expect(screen.getByText("Tamam")).toBeTruthy();
  });

  it("action onPress tetiklenir ve dialog kapanır", () => {
    const onPress = jest.fn();
    const onClose = jest.fn();
    render(
      <Dialog
        visible
        onClose={onClose}
        title="Aksiyon"
        actions={[{ label: "Yap", onPress }]}
      />
    );
    fireEvent.press(screen.getByText("Yap"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dismissible backdrop onClose çağırır", () => {
    const onClose = jest.fn();
    render(
      <Dialog
        visible
        onClose={onClose}
        title="X"
        actions={[{ label: "OK" }]}
      />
    );
    // Backdrop Pressable → accessibilityLabel='dialog-dismiss'
    const backdrop = screen.getByLabelText("dialog-dismiss");
    fireEvent.press(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("dismissible=false ise backdrop onClose çağırmaz", () => {
    const onClose = jest.fn();
    render(
      <Dialog
        visible
        onClose={onClose}
        title="X"
        actions={[{ label: "OK" }]}
        dismissible={false}
      />
    );
    const backdrop = screen.getByLabelText("dialog-dismiss");
    fireEvent.press(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Dialog — iconVariant", () => {
  const variants = ["info", "success", "error", "warning", "confirm"] as const;
  for (const v of variants) {
    it(`iconVariant='${v}' render olur (crash etmez)`, () => {
      const { unmount } = render(
        <Dialog
          visible
          onClose={jest.fn()}
          title={`Test ${v}`}
          iconVariant={v}
        />
      );
      expect(screen.getByText(`Test ${v}`)).toBeTruthy();
      unmount();
    });
  }
});

describe("DialogHost — store-driven render", () => {
  beforeEach(() => {
    useDialogStore.setState({
      visible: false,
      title: "",
      description: undefined,
      iconVariant: undefined,
      actions: [],
    });
  });

  it("store visible=false → içerik render olmaz", () => {
    useDialogStore.setState({ visible: false, title: "Görünmemeli" });
    render(<DialogHost />);
    expect(screen.queryByText("Görünmemeli")).toBeNull();
  });

  it("store visible=true → store'daki title render olur", () => {
    useDialogStore.setState({
      visible: true,
      title: "Başlık",
      description: "Açıklama",
      actions: [{ label: "OK" }],
    });
    render(<DialogHost />);
    expect(screen.getByText("Başlık")).toBeTruthy();
    expect(screen.getByText("Açıklama")).toBeTruthy();
    expect(screen.getByText("OK")).toBeTruthy();
  });

  it("hide() çağrıldığında visible=false olur", () => {
    useDialogStore.setState({ visible: true, title: "X" });
    render(<DialogHost />);
    expect(screen.getByText("X")).toBeTruthy();

    act(() => {
      useDialogStore.getState().hide();
    });
    // Re-render sonrası içerik kaybolmalı
    expect(screen.queryByText("X")).toBeNull();
  });
});
