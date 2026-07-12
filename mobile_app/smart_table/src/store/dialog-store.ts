// ============================================================
// Smart Table — Dialog Store (Zustand)
//
// Global dialog state for replacing Alert.alert() with a
// custom Modal dialog. Supports simple alerts, confirms,
// and custom action buttons.
// ============================================================

import { create } from "zustand";

export interface DialogAction {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

export interface DialogState {
  visible: boolean;
  title: string;
  message: string;
  actions: DialogAction[];

  /** Show a simple alert with a single OK button */
  alert: (title: string, message: string) => void;

  /** Show a confirmation dialog with Cancel + Confirm buttons */
  confirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    confirmText?: string,
    cancelText?: string,
    destructive?: boolean,
  ) => void;

  /** Show a custom dialog with arbitrary actions */
  show: (title: string, message: string, actions: DialogAction[]) => void;

  /** Hide the dialog */
  hide: () => void;
}

export const useDialogStore = create<DialogState>((set) => ({
  visible: false,
  title: "",
  message: "",
  actions: [],

  alert: (title: string, message: string) => {
    set({
      visible: true,
      title,
      message,
      actions: [
        {
          text: "Tamam",
          style: "default",
          onPress: () => set({ visible: false }),
        },
      ],
    });
  },

  confirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    confirmText = "Evet",
    cancelText = "İptal",
    destructive = false,
  ) => {
    set({
      visible: true,
      title,
      message,
      actions: [
        {
          text: cancelText,
          style: "cancel",
          onPress: () => {
            set({ visible: false });
            onCancel?.();
          },
        },
        {
          text: confirmText,
          style: destructive ? "destructive" : "default",
          onPress: () => {
            set({ visible: false });
            onConfirm();
          },
        },
      ],
    });
  },

  show: (title: string, message: string, actions: DialogAction[]) => {
    set({ visible: true, title, message, actions });
  },

  hide: () => {
    set({ visible: false, title: "", message: "", actions: [] });
  },
}));
