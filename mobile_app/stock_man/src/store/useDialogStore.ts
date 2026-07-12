// ============================================================
// Stock Man — Dialog Store
//
// Programmatic Alert.alert() replacement. The `dialog` helper
// at the bottom is the public API used by feature code:
//
//   dialog.alert("Title", "Body");
//   dialog.confirm("Title", "Body", onConfirm);
//
// The DialogHost component (in components/ui/Dialog.tsx) reads
// this store and renders a themed modal. Dismissing the modal
// is handled inside the host — callers do NOT need to call
// hide() themselves for alert/confirm flows.
// ============================================================

import { create } from "zustand";
import { tSync } from "@/i18n";
import { useUIStore } from "@/store/useUIStore";

function currentLang() {
  return useUIStore.getState().language;
}

function defaultOkLabel() {
  return tSync("common.ok", currentLang());
}

type DialogActionVariant = "primary" | "secondary" | "destructive";

export type DialogAction = {
  label: string;
  onPress?: () => void;
  variant?: DialogActionVariant;
};

export type DialogIconVariant = "info" | "success" | "error" | "warning" | "confirm";

type DialogState = {
  visible: boolean;
  title: string;
  description?: string;
  iconVariant?: DialogIconVariant;
  actions: DialogAction[];
  show: (opts: {
    title: string;
    description?: string;
    iconVariant?: DialogIconVariant;
    actions?: DialogAction[];
  }) => void;
  hide: () => void;
};

export const useDialogStore = create<DialogState>((set) => ({
  visible: false,
  title: "",
  description: undefined,
  iconVariant: undefined,
  actions: [],
  show: (opts) =>
    set({
      visible: true,
      ...opts,
      actions: opts.actions ?? [{ label: defaultOkLabel(), variant: "primary" }],
    }),
  hide: () => set({ visible: false }),
}));

/** Sugar for the most common dialog patterns. */
export const dialog = {
  alert: (title: string, description?: string) =>
    useDialogStore.getState().show({
      title,
      description,
      iconVariant: "info",
      actions: [{ label: defaultOkLabel(), variant: "primary" }],
    }),
  confirm: (title: string, description?: string, onConfirm?: () => void) =>
    useDialogStore.getState().show({
      title,
      description,
      iconVariant: "confirm",
      actions: [
        { label: tSync("common.cancel", currentLang()), variant: "secondary" },
        {
          label: tSync("common.confirm", currentLang()),
          variant: "primary",
          onPress: onConfirm,
        },
      ],
    }),
  error: (title: string, description?: string) =>
    useDialogStore.getState().show({
      title,
      description,
      iconVariant: "error",
      actions: [{ label: defaultOkLabel(), variant: "primary" }],
    }),
  success: (title: string, description?: string) =>
    useDialogStore.getState().show({
      title,
      description,
      iconVariant: "success",
      actions: [{ label: defaultOkLabel(), variant: "primary" }],
    }),
};
