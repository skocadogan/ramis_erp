// ============================================================
// Stock Man — BarcodeScannerDialog
//
// Embeds BarcodeScanner in a semi-modal overlay instead of
// full-screen. Phone: bottom sheet (~68% height). Tablet:
// centered card. Backdrop tap closes the dialog.
// ============================================================

import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { X } from "lucide-react-native";
import { BarcodeScanner, type BarcodeScannerProps } from "./BarcodeScanner";
import { useI18n } from "@/i18n";
import { useResponsive } from "@/hooks/useResponsive";

export interface BarcodeScannerDialogProps extends BarcodeScannerProps {
  visible: boolean;
  onRequestClose: () => void;
  /** Optional footer below the scanner (e.g. scan error actions). */
  footer?: React.ReactNode;
}

export function BarcodeScannerDialog({
  visible,
  onRequestClose,
  footer,
  title,
  ...scannerProps
}: BarcodeScannerDialogProps) {
  const { t } = useI18n();
  const { isTablet } = useResponsive();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  const sheetHeight = Math.min(Math.round(windowHeight * 0.68), 560);
  const dialogWidth = Math.min(480, windowWidth - 48);
  const panelWidth = isTablet ? dialogWidth : windowWidth - 32;
  const headerHeight = 52;
  const footerHeight = footer ? 88 : 0;
  const scannerHeight = Math.max(sheetHeight - headerHeight - footerHeight, 240);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
      statusBarTranslucent
    >
      <View
        style={[
          styles.backdrop,
          isTablet ? styles.backdropTablet : styles.backdropPhone,
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onRequestClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        />

        <View
          accessibilityLabel="barcode-scanner-dialog"
          collapsable={false}
          style={[
            styles.panel,
            {
              height: sheetHeight,
              width: panelWidth,
            },
            isTablet ? styles.panelTablet : styles.panelPhone,
          ]}
        >
          <View style={styles.header}>
            <Text className="text-body font-semibold text-foreground flex-1" numberOfLines={1}>
              {title ?? t("scanner.title")}
            </Text>
            <Pressable
              onPress={onRequestClose}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
              hitSlop={8}
            >
              <X size={20} color="#64748B" />
            </Pressable>
          </View>

          <View style={[styles.scannerSlot, { height: scannerHeight }]}>
            <BarcodeScanner
              {...scannerProps}
              variant="embedded"
              title={title}
              onClose={onRequestClose}
            />
          </View>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 16,
  },
  backdropTablet: {
    justifyContent: "center",
    alignItems: "center",
  },
  backdropPhone: {
    justifyContent: "flex-end",
    paddingBottom: 0,
  },
  panel: {
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    zIndex: 1,
  },
  panelTablet: {
    borderRadius: 16,
  },
  panelPhone: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    alignSelf: "stretch",
  },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  scannerSlot: {
    overflow: "hidden",
    width: "100%",
    backgroundColor: "#090D16",
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
});

