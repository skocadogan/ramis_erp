// ============================================================
// Stock Man — Scanner (modal screen)
//
// Mounted via expo-router at `/(main)/scanner` (push from the
// dashboard, the stock list, or any future "scan to add"
// button). The screen is a thin shell:
//
//   <Header>      ← back + title "Barkod Tarayıcı"
//   <BarcodeScanner>  ← fills the rest, fires onScan(code)
//   <LookupResultDialog> ← shown after a lookup finishes
//
// Flow:
//   1. BarcodeScanner calls onScan(code) when a frame decodes
//   2. We mutate the lookup mutation, capture the result
//   3. LookupResultDialog shows the result (or loading/error)
//   4. Picking a stock item / supplier deep-links and closes
//   5. If the user dismisses the dialog, the scanner is
//      re-enabled (active=true) and they can scan again
// ============================================================

import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { BarcodeScanner } from "@/components/scanner/BarcodeScanner";
import { LookupResultDialog } from "@/components/scanner/LookupResultDialog";
import { useI18n } from "@/i18n";
import { useToast } from "@/components/ui/Toast";
import { useBarcodeLookup } from "@/data/p5";
import type { BarcodeLookupResult } from "@/types/p5Data";
import type { StockItem, Supplier } from "@/types";

export default function ScannerScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const toast = useToast();

  const [scannerActive, setScannerActive] = useState(true);
  const [result, setResult] = useState<BarcodeLookupResult | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLooking, setIsLooking] = useState(false);

  const lookup = useBarcodeLookup();
  const lookupGeneration = useRef(0);

  const runLookup = useCallback(
    (code: string, _type: string) => {
      const generation = ++lookupGeneration.current;
      setScannerActive(false);
      setResult(null);
      setLookupError(null);
      setIsLooking(true);
      setDialogOpen(true);

      lookup.mutateAsync(code).then(
        (res) => {
          if (generation !== lookupGeneration.current) return;
          setResult(res);
          setIsLooking(false);
        },
        (err) => {
          if (generation !== lookupGeneration.current) return;
          setLookupError(
            err instanceof Error ? err.message : t("errors.unknown")
          );
          setIsLooking(false);
        }
      );
    },
    [lookup, t]
  );

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(main)/(tabs)" as any);
    }
  }, [router]);

  const handleDialogClose = useCallback(() => {
    lookupGeneration.current += 1;
    setDialogOpen(false);
    // Re-enable the scanner so the user can try again.
    setScannerActive(true);
    setResult(null);
    setLookupError(null);
  }, []);

  const handlePickStockItem = useCallback(
    (item: StockItem) => {
      toast.success(item.name, t("scanner.navigatingToStock"));
      router.push(`/(main)/stock/${item.id}` as any);
    },
    [router, toast, t]
  );

  const handlePickSupplier = useCallback(
    (supplier: Supplier) => {
      toast.success(supplier.name, t("scanner.navigatingToSupplier"));
      router.push(`/(main)/supplier/${supplier.id}` as any);
    },
    [router, toast, t]
  );

  const handleManualEntry = useCallback(
    (code: string) => {
      router.push({
        pathname: "/(main)/stock/new",
        params: { barcode: code },
      } as any);
    },
    [router]
  );

  return (
    <View style={styles.root}>
      <BarcodeScanner
        onScan={runLookup}
        onClose={handleClose}
        active={scannerActive}
        title={t("scanner.title")}
      />
      <LookupResultDialog
        visible={dialogOpen}
        result={result}
        loading={isLooking}
        error={lookupError}
        onClose={handleDialogClose}
        onPickStockItem={handlePickStockItem}
        onPickSupplier={handlePickSupplier}
        onManualEntry={handleManualEntry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#090D16" },
});
