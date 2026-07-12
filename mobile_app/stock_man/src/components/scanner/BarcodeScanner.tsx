// ============================================================
// Stock Man — BarcodeScanner
//
// Reusable camera-based barcode scanner used by the modal
// "Scanner" screen and any future embedded scanning flow
// (e.g. "scan to add" inside a receiving screen).
//
// Uses expo-camera's CameraView (v56 API) with the
// barcodeScannerSettings prop, which lets us declare every
// format we care about in a single call. On every successful
// scan we (1) haptic-vibrate via the system Vibration API
// (expo-haptics is not installed) and (2) call `onScan`.
//
// The component never mutates the global "scanned" flag
// itself — that's the parent's job. This lets the same
// instance back different flows (e.g. the modal screen uses
// it to trigger a lookup, an embedded flow might just append
// to a list).
// ============================================================

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from "react-native";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, QrCode, X } from "lucide-react-native";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import {
  SUPPORTED_BARCODE_TYPES,
  type SupportedBarcodeType,
} from "@/types/p5Data";

export interface BarcodeScannerProps {
  /** Called once per scanned code. The parent decides whether
   *  to debounce / ignore subsequent calls. */
  onScan: (code: string, type: string) => void;
  /** Header title (right side of the top bar). */
  title?: string;
  /** Tap-to-close handler for the X / back button. */
  onClose?: () => void;
  /** When false, the scanner does not emit `onBarcodeScanned`
   *  events. Useful for "pausing" the scanner while a result
   *  dialog is open. */
  active?: boolean;
  /** Override the bottom instruction text. */
  hint?: string;
  /** Barcode types to accept. Defaults to every format the
   *  scanner.* i18n namespace implies (EAN, UPC, Code-128,
   *  QR, PDF417, etc.). */
  barcodeTypes?: readonly SupportedBarcodeType[];
  /** fullscreen: dedicated screen / legacy modal. embedded: dialog sheet. */
  variant?: "fullscreen" | "embedded";
  /** Class on the root container. */
  className?: string;
  /** Style on the root container. */
  style?: ViewStyle;
}

const VIBRATION_MS = 120;

export function BarcodeScanner({
  onScan,
  title,
  onClose,
  active = true,
  hint,
  barcodeTypes = SUPPORTED_BARCODE_TYPES,
  variant = "fullscreen",
  className,
  style,
}: BarcodeScannerProps) {
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const [hasAskedOnce, setHasAskedOnce] = useState(false);

  // Permission is `null` while expo-camera is hydrating the
  // stored grant. We render a spinner in that brief window.
  if (permission === null) {
    return (
      <View
        className={cn(
          "flex-1 bg-[#090D16] justify-center items-center",
          className
        )}
        style={style}
        accessibilityRole="progressbar"
        accessibilityLabel={t("scanner.permissionLoading")}
      >
        <ActivityIndicator size="large" color="#1E40AF" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View
        className={cn(
          "flex-1 bg-[#090D16] justify-center items-center px-6",
          className
        )}
        style={style}
      >
        <View className="bg-primary/10 p-6 rounded-full mb-6">
          <QrCode size={50} color="#1E40AF" />
        </View>
        <Text className="text-white text-xl font-bold text-center mb-3">
          {t("scanner.permissionTitle")}
        </Text>
        <Text className="text-gray-400 text-center mb-8 leading-5">
          {t("scanner.permissionDesc")}
        </Text>
        <Pressable
          onPress={async () => {
            setHasAskedOnce(true);
            await requestPermission();
          }}
          accessibilityRole="button"
          accessibilityLabel={t("scanner.grantPermission")}
          className="bg-primary px-8 py-3.5 rounded-xl active:opacity-85 shadow-lg shadow-primary/20"
        >
          <Text className="text-white font-bold text-base">
            {t("scanner.grantPermission")}
          </Text>
        </Pressable>
        {hasAskedOnce && !permission.canAskAgain ? (
          <Text className="text-gray-500 text-xs text-center mt-6 px-4">
            {t("scanner.permissionDesc")}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <ScannerStage
      onScan={onScan}
      title={title ?? t("scanner.title")}
      hint={hint ?? t("scanner.scanInstruction")}
      onClose={onClose}
      active={active}
      barcodeTypes={barcodeTypes}
      variant={variant}
      className={className}
      style={style}
    />
  );
}

interface StageProps {
  onScan: (code: string, type: string) => void;
  title: string;
  hint: string;
  onClose?: () => void;
  active: boolean;
  barcodeTypes: readonly SupportedBarcodeType[];
  variant: "fullscreen" | "embedded";
  className?: string;
  style?: ViewStyle;
}

function ScannerStage({
  onScan,
  title,
  hint,
  onClose,
  active,
  barcodeTypes,
  variant,
  className,
  style,
}: StageProps) {
  const { t } = useI18n();
  const embedded = variant === "embedded";
  const frameSize = embedded ? 200 : 280;
  const [cameraBox, setCameraBox] = useState<{ width: number; height: number } | null>(
    null
  );
  const [scannedLock, setScannedLock] = useState(false);

  const onCameraBoxLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setCameraBox((prev) =>
      prev?.width === width && prev?.height === height ? prev : { width, height }
    );
  }, []);

  React.useEffect(() => {
    if (!scannedLock) return;
    const timer = setTimeout(() => setScannedLock(false), 1500);
    return () => clearTimeout(timer);
  }, [scannedLock]);

  const handleScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (!active || scannedLock) return;
      const code = (result?.data ?? "").trim();
      if (!code) return;
      setScannedLock(true);
      Vibration.vibrate(VIBRATION_MS);
      onScan(code, result.type ?? "unknown");
    },
    [active, onScan, scannedLock]
  );

  return (
    <View
      className={cn("flex-1 bg-[#090D16]", className)}
      style={[embedded ? styles.embeddedRoot : undefined, style]}
      accessibilityLabel="barcode-scanner"
      collapsable={false}
    >
      {embedded ? (
        <View
          style={styles.embeddedCameraClip}
          onLayout={onCameraBoxLayout}
          collapsable={false}
        >
          {cameraBox ? (
            <CameraView
              style={{
                width: cameraBox.width,
                height: cameraBox.height,
              }}
              facing="back"
              active={active}
              ratio={Platform.OS === "android" ? "4:3" : undefined}
              onBarcodeScanned={active && !scannedLock ? handleScanned : undefined}
              barcodeScannerSettings={{ barcodeTypes: [...barcodeTypes] }}
            />
          ) : null}
        </View>
      ) : (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          active={active}
          onBarcodeScanned={active && !scannedLock ? handleScanned : undefined}
          barcodeScannerSettings={{ barcodeTypes: [...barcodeTypes] }}
        />
      )}

      {/* Masked overlay (transparent center square, dimmed around) */}
      <View
        style={StyleSheet.absoluteFill}
        className="justify-center items-center"
        pointerEvents="none"
      >
        <View style={[styles.scanFrameRow, { height: frameSize }]}>
          <View style={styles.scanFrameSide} />
          <View style={[styles.scanFrame, { width: frameSize, height: frameSize }]}>
            <View className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-primary rounded-tl-xl" />
            <View className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-primary rounded-tr-xl" />
            <View className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-primary rounded-bl-xl" />
            <View className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-primary rounded-br-xl" />
            <View className="absolute left-0 right-0 top-1/2 h-[2px] bg-primary/70 shadow-lg shadow-primary" />
          </View>
          <View style={styles.scanFrameSide} />
        </View>
        <View style={styles.scanHintBar}>
          <Text className="text-white/95 text-center font-semibold text-sm">
            {hint}
          </Text>
        </View>
      </View>

      {!embedded ? (
        <SafeAreaView
          className="absolute top-0 left-0 right-0"
          edges={["top"]}
        >
          <View className="px-4 py-3 flex-row justify-between items-center">
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              className="w-10 h-10 bg-black/40 rounded-full justify-center items-center active:opacity-80"
            >
              {onClose ? (
                <ChevronLeft size={24} color="#FFFFFF" />
              ) : (
                <X size={20} color="#FFFFFF" />
              )}
            </Pressable>
            <Text className="text-white text-lg font-bold">{title}</Text>
            <View className="w-10 h-10" />
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  embeddedRoot: {
    overflow: "hidden",
    width: "100%",
  },
  embeddedCameraClip: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#090D16",
  },
  scanFrameRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    maxWidth: "100%",
  },
  scanFrameSide: {
    flex: 1,
    height: "100%",
    backgroundColor: "rgba(0,0,0,0.6)",
    maxWidth: 120,
  },
  scanFrame: {
    position: "relative",
  },
  scanHintBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
});

