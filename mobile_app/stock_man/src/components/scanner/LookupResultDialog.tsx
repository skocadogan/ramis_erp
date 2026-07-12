// ============================================================
// Stock Man — LookupResultDialog
//
// Shown after a successful barcode lookup. The dialog renders
// one of four layouts depending on the result type:
//   - not_found   → "Bulunamadı" + manual entry CTA
//   - stock_item  → product card with deep-link to the stock
//   - supplier    → supplier card with deep-link
//   - multiple    → list of items + suppliers for the user to
//                   pick the right one
//
// The dialog does NOT navigate itself. It bubbles the user's
// pick up via callbacks (`onPickStockItem`, `onPickSupplier`)
// so the screen can run any side-effects (close the scanner,
// invalidate queries, toast, etc.) before pushing the route.
// ============================================================

import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  Building2,
  Package,
  PackageOpen,
  Plus,
  Search,
  X,
} from "lucide-react-native";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/utils/cn";
import { useI18n } from "@/i18n";
import type { BarcodeLookupResult } from "@/types/p5Data";
import type { StockItem, Supplier } from "@/types";

export interface LookupResultDialogProps {
  result: BarcodeLookupResult | null;
  visible: boolean;
  onClose: () => void;
  onPickStockItem: (item: StockItem) => void;
  onPickSupplier: (supplier: Supplier) => void;
  /** Called when the user wants to manually create a stock item
   *  for a barcode that was not found. */
  onManualEntry?: (code: string) => void;
  /** When true, the "loading" variant is shown (we look the
   *  code up). */
  loading?: boolean;
  /** When defined, an error message replaces the result body. */
  error?: string | null;
}

function asStockItem(row: StockItem | Supplier): StockItem | null {
  return typeof (row as StockItem).sku === "string" ? (row as StockItem) : null;
}

function asSupplier(row: StockItem | Supplier): Supplier | null {
  return typeof (row as StockItem).sku === "string" ? null : (row as Supplier);
}

export function LookupResultDialog({
  result,
  visible,
  onClose,
  onPickStockItem,
  onPickSupplier,
  onManualEntry,
  loading = false,
  error = null,
}: LookupResultDialogProps) {
  const { t } = useI18n();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="dialog-dismiss"
        className="flex-1 items-center justify-center bg-black/60 px-6"
      >
        <Pressable
          onPress={() => {}}
          accessibilityLabel="dialog-content"
          className="w-full max-w-md rounded-2xl bg-card border border-border p-6"
        >
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-bold text-foreground flex-1">
              {titleFor(result, loading, error, t)}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="dialog-close"
              className="w-8 h-8 -mr-2 items-center justify-center rounded-full active:opacity-70"
              hitSlop={8}
            >
              <X size={18} color="#64748B" />
            </Pressable>
          </View>
          <Body
            result={result}
            loading={loading}
            error={error}
            onPickStockItem={(item) => {
              onClose();
              onPickStockItem(item);
            }}
            onPickSupplier={(s) => {
              onClose();
              onPickSupplier(s);
            }}
            onManualEntry={
              onManualEntry
                ? (code) => {
                    onClose();
                    onManualEntry(code);
                  }
                : undefined
            }
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function titleFor(
  result: BarcodeLookupResult | null,
  loading: boolean,
  error: string | null,
  t: (key: string) => string
): string {
  if (loading) return t("common.loading");
  if (error) return t("common.error");
  if (!result) return t("scanner.title");
  switch (result.kind) {
    case "not_found":
      return t("errors.notFound");
    case "stock_item":
      return t("stock.title");
    case "supplier":
      return t("supplier.title");
    case "multiple":
      return t("scanner.multipleFound");
  }
}

interface BodyProps {
  result: BarcodeLookupResult | null;
  loading: boolean;
  error: string | null;
  onPickStockItem: (item: StockItem) => void;
  onPickSupplier: (supplier: Supplier) => void;
  onManualEntry?: (code: string) => void;
}

function Body({
  result,
  loading,
  error,
  onPickStockItem,
  onPickSupplier,
  onManualEntry,
}: BodyProps) {
  const { t } = useI18n();

  if (loading) {
    return (
      <View className="items-center py-6">
        <ActivityIndicator size="large" color="#1E40AF" />
        <Text className="mt-3 text-sm text-muted-foreground">
          {t("common.loading")}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="py-2">
        <Text className="text-sm text-destructive text-center">{error}</Text>
      </View>
    );
  }

  if (!result) return null;

  switch (result.kind) {
    case "not_found":
      return <NotFoundBody code={result.barcode} onManualEntry={onManualEntry} />;
    case "stock_item":
      return <StockItemBody item={result.item} onPick={onPickStockItem} />;
    case "supplier":
      return <SupplierBody supplier={result.supplier} onPick={onPickSupplier} />;
    case "multiple": {
      const items: StockItem[] = [];
      const suppliers: Supplier[] = [];
      for (const row of result.results) {
        const it = asStockItem(row);
        if (it) items.push(it);
        else {
          const s = asSupplier(row);
          if (s) suppliers.push(s);
        }
      }
      return (
        <MultipleBody
          items={items}
          suppliers={suppliers}
          code={result.barcode}
          onPickStockItem={onPickStockItem}
          onPickSupplier={onPickSupplier}
        />
      );
    }
  }
}

function NotFoundBody({
  code,
  onManualEntry,
}: {
  code: string;
  onManualEntry?: (code: string) => void;
}) {
  const { t } = useI18n();
  return (
    <View className="items-center py-2">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-muted mb-3">
        <PackageOpen size={28} color="#64748B" />
      </View>
      <Text className="text-sm text-muted-foreground text-center">
        {t("scanner.notFound", { code })}
      </Text>
      {onManualEntry ? (
        <View className="mt-4 w-full">
          <Button
            variant="outline"
            leftIcon={Plus}
            fullWidth
            onPress={() => onManualEntry(code)}
          >
            {t("scanner.manualEntry")}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

function StockItemBody({
  item,
  onPick,
}: {
  item: StockItem;
  onPick: (item: StockItem) => void;
}) {
  const { t } = useI18n();
  return (
    <Pressable onPress={() => onPick(item)} accessibilityRole="button">
      <Card className="flex-row items-center">
        <View className="h-14 w-14 items-center justify-center rounded-xl bg-primary/10 mr-3">
          <Package size={26} color="#1E40AF" />
        </View>
        <View className="flex-1 min-w-0">
          <Text
            className="text-base font-bold text-foreground"
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text className="text-caption text-muted-foreground" numberOfLines={1}>
            SKU: {item.sku}
          </Text>
          {item.is_low_stock ? (
            <View className="mt-1.5 self-start">
              <Badge variant="warning" size="sm" dot label={t("stock.lowStockBadge")} />
            </View>
          ) : null}
        </View>
      </Card>
      <Text className="mt-3 text-center text-caption text-primary font-semibold">
        {t("stock.title")} →
      </Text>
    </Pressable>
  );
}

function SupplierBody({
  supplier,
  onPick,
}: {
  supplier: Supplier;
  onPick: (supplier: Supplier) => void;
}) {
  const { t } = useI18n();
  return (
    <Pressable onPress={() => onPick(supplier)} accessibilityRole="button">
      <Card className="flex-row items-center">
        <View className="h-14 w-14 items-center justify-center rounded-xl bg-info/10 mr-3">
          <Building2 size={26} color="#0EA5E9" />
        </View>
        <View className="flex-1 min-w-0">
          <Text
            className="text-base font-bold text-foreground"
            numberOfLines={1}
          >
            {supplier.name}
          </Text>
          {supplier.contact_person ? (
            <Text
              className="text-caption text-muted-foreground"
              numberOfLines={1}
            >
              {supplier.contact_person}
            </Text>
          ) : null}
          {supplier.phone ? (
            <Text
              className="text-caption text-muted-foreground"
              numberOfLines={1}
            >
              {supplier.phone}
            </Text>
          ) : null}
        </View>
      </Card>
      <Text className="mt-3 text-center text-caption text-primary font-semibold">
        {t("supplier.title")} →
      </Text>
    </Pressable>
  );
}

function MultipleBody({
  items,
  suppliers,
  code,
  onPickStockItem,
  onPickSupplier,
}: {
  items: StockItem[];
  suppliers: Supplier[];
  code: string;
  onPickStockItem: (item: StockItem) => void;
  onPickSupplier: (supplier: Supplier) => void;
}) {
  const { t } = useI18n();
  const hasItems = items.length > 0;
  const hasSuppliers = suppliers.length > 0;
  if (!hasItems && !hasSuppliers) {
    return (
      <View className="py-2">
        <Text className="text-sm text-muted-foreground text-center">
          {t("scanner.notFound", { code })}
        </Text>
      </View>
    );
  }
  return (
    <ScrollView
      className="max-h-[420px]"
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-center mb-3 px-1">
        <Search size={14} color="#64748B" />
        <Text className="ml-1.5 text-caption text-muted-foreground">
          {t("scanner.multipleFound")} · {code}
        </Text>
      </View>

      {hasItems ? (
        <View className="mb-2">
          <Text className="text-caption font-bold text-muted-foreground uppercase mb-1.5 px-1">
            {t("stock.title")}
          </Text>
          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => onPickStockItem(item)}
              accessibilityRole="button"
              className={cn("mb-2 active:opacity-80")}
            >
              <Card className="flex-row items-center">
                <View className="h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mr-3">
                  <Package size={20} color="#1E40AF" />
                </View>
                <View className="flex-1 min-w-0">
                  <Text
                    className="text-body font-semibold text-foreground"
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <Text
                    className="text-caption text-muted-foreground"
                    numberOfLines={1}
                  >
                    {item.sku}
                  </Text>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      ) : null}

      {hasSuppliers ? (
        <View>
          <Text className="text-caption font-bold text-muted-foreground uppercase mb-1.5 px-1">
            {t("supplier.title")}
          </Text>
          {suppliers.map((supplier) => (
            <Pressable
              key={supplier.id}
              onPress={() => onPickSupplier(supplier)}
              accessibilityRole="button"
              className={cn("mb-2 active:opacity-80")}
            >
              <Card className="flex-row items-center">
                <View className="h-10 w-10 items-center justify-center rounded-lg bg-info/10 mr-3">
                  <Building2 size={20} color="#0EA5E9" />
                </View>
                <View className="flex-1 min-w-0">
                  <Text
                    className="text-body font-semibold text-foreground"
                    numberOfLines={1}
                  >
                    {supplier.name}
                  </Text>
                  {supplier.phone ? (
                    <Text
                      className="text-caption text-muted-foreground"
                      numberOfLines={1}
                    >
                      {supplier.phone}
                    </Text>
                  ) : null}
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

