import type { Printer } from "@/features/admin/services/adminApi";
import type { CartItem } from "@/types/pos";
import type { ReceiptPrintJob } from "./dispatchReceiptPrints";
import { buildPrintJobIdempotencyKey } from "./printIdempotency";

type ReceiptLineItem = {
  name: string;
  qty: number;
  price: number;
  unit: string;
  tax_rate?: number;
  modifiers?: string;
  modifier_names?: string[];
  modifier_entries?: Array<{ name: string; price: number }>;
  notes?: string;
};

function buildReceiptLineItems(cart: CartItem[]): ReceiptLineItem[] {
  return cart.map((item) => {
    const selectedMods = item.selectedModifiers ?? [];
    const modSum = selectedMods.reduce((s, m) => s + m.price_adjustment, 0);
    const unitBase =
      item.unitPrice ||
      (item.product.has_discount && item.product.discounted_price
        ? item.product.discounted_price
        : item.product.base_price);
    const modifierEntries = selectedMods.map((m) => ({
      name: m.name,
      price: m.price_adjustment,
    }));
    const modifierLabel = selectedMods.map((m) => m.name).join(", ");
    return {
      name: item.product.name,
      qty: item.quantity,
      price: unitBase,
      unit: item.selectedUnit?.name || "",
      tax_rate: parseFloat(String(item.product.tax_rate ?? 0)) || 0,
      ...(modifierEntries.length
        ? {
            modifier_entries: modifierEntries,
            modifiers: modifierLabel,
            modifier_names: selectedMods.map((m) => m.name),
          }
        : {}),
      ...(item.notes?.trim() ? { notes: item.notes.trim() } : {}),
      ...(modSum > 0 ? { modifier_total: modSum } : {}),
    };
  });
}

function sumLineItems(items: ReceiptLineItem[]): number {
  return items.reduce((total, line) => total + line.price * line.qty, 0);
}

/** Birleşik ürünleri alt ürün satırlarına açar (istasyon yönlendirmesi için). */
function expandCombinedCartLines(cart: CartItem[]): CartItem[] {
  const expanded: CartItem[] = [];
  for (const item of cart) {
    const combined = item.product.combined_items;
    if (item.product.is_combined && combined && combined.length > 0) {
      const parentUnitMult = item.selectedUnit?.multiplier ?? 1;
      for (const ci of combined) {
        const lineQty =
          item.quantity *
          parentUnitMult *
          Number(ci.quantity ?? 1) *
          Number(ci.product_unit_multiplier ?? 1);
        const name =
          ci.product_name ||
          (typeof ci.product === "object" && ci.product?.name) ||
          "—";
        expanded.push({
          ...item,
          quantity: lineQty,
          selectedModifiers: [],
          notes: item.notes,
          product: {
            ...item.product,
            name,
            category_station: ci.product_category_station ?? null,
            is_combined: false,
            combined_items: undefined,
          },
        });
      }
      continue;
    }
    expanded.push(item);
  }
  return expanded;
}

/** KDS ile aynı: istasyon kalemleri + istasyonu belirtilmemiş ortak kalemler. */
function itemsForKitchenStation(cart: CartItem[], stationId: string): CartItem[] {
  return cart.filter(
    (item) =>
      !item.product.category_station || item.product.category_station === stationId
  );
}

function shouldPrintStationTicket(cart: CartItem[], stationId: string): boolean {
  const hasDedicated = cart.some((item) => item.product.category_station === stationId);
  const hasShared = cart.some((item) => !item.product.category_station);
  return hasDedicated || hasShared;
}

function printJobIdempotencyKey(
  idempotencyPrefix: string | undefined,
  orderId: string | undefined,
  printer: Printer
): string | undefined {
  if (!idempotencyPrefix) return undefined;
  const slugPart = printer.receipt_template_slug ?? "template";
  const prefix = orderId ?? idempotencyPrefix;
  return buildPrintJobIdempotencyKey(prefix, printer.id, slugPart);
}

function activeKitchenPrinters(printers: Printer[]): Printer[] {
  return printers.filter(
    (p) =>
      p.usage_type === "KITCHEN" &&
      p.is_active &&
      Boolean(p.kitchen_station) &&
      Boolean(p.receipt_template_slug)
  );
}

function makeJob(
  printer: Printer,
  items: ReceiptLineItem[],
  baseContext: Record<string, unknown>,
  orderNumber: string | undefined,
  orderId: string | undefined,
  idempotencyPrefix: string | undefined
): ReceiptPrintJob {
  const subtotal = sumLineItems(items);
  return {
    templateSlug: printer.receipt_template_slug!,
    printerId: printer.id,
    context: {
      ...baseContext,
      items,
      subtotal,
      total: subtotal,
      ...(orderId ? { order_id: orderId } : {}),
      ...(orderNumber ? { order_number: orderNumber } : {}),
      ...(printer.kitchen_station ? { kitchen_station_id: printer.kitchen_station } : {}),
      ...(printer.kitchen_station_name
        ? { station_name: printer.kitchen_station_name }
        : {}),
    },
    idempotencyKey: printJobIdempotencyKey(idempotencyPrefix, orderId, printer),
  };
}

/**
 * Sepet kalemlerini mutfak istasyonu yazıcılarına böler.
 * Tek istasyon varsa tüm sipariş o yazıcıdan basılır; birden fazla istasyon varsa istasyon başına ayrı fiş.
 */
export function buildStationOrderPrintJobs(args: {
  cart: CartItem[];
  kitchenPrinters: Printer[];
  baseContext: Record<string, unknown>;
  orderNumber?: string;
  orderId?: string;
  idempotencyPrefix?: string;
}): ReceiptPrintJob[] {
  const { cart, kitchenPrinters, baseContext, orderNumber, orderId, idempotencyPrefix } = args;
  if (!cart.length) return [];

  const kitchenCart = expandCombinedCartLines(cart);

  const printers = activeKitchenPrinters(kitchenPrinters);
  if (!printers.length) return [];

  const printerByStation = new Map<string, Printer>();
  for (const printer of printers) {
    if (printer.kitchen_station) {
      printerByStation.set(printer.kitchen_station, printer);
    }
  }

  const stationIdsInCart = new Set<string>();
  for (const item of kitchenCart) {
    const stationId = item.product.category_station;
    if (stationId) stationIdsInCart.add(stationId);
  }

  const uniqueStations = [...stationIdsInCart];

  if (uniqueStations.length <= 1) {
    const stationId = uniqueStations[0] ?? null;
    let printer = stationId ? printerByStation.get(stationId) : undefined;
    if (!printer && printers.length === 1) {
      printer = printers[0];
    }
    if (!printer) return [];

    return [
      makeJob(
        printer,
        buildReceiptLineItems(kitchenCart),
        baseContext,
        orderNumber,
        orderId,
        idempotencyPrefix
      ),
    ];
  }

  const grouped = new Map<string, CartItem[]>();
  for (const stationId of printerByStation.keys()) {
    if (!shouldPrintStationTicket(kitchenCart, stationId)) continue;
    grouped.set(stationId, itemsForKitchenStation(kitchenCart, stationId));
  }

  const jobs: ReceiptPrintJob[] = [];
  for (const [stationId, items] of grouped) {
    const printer = printerByStation.get(stationId);
    if (!printer || !items.length) continue;
    jobs.push(
      makeJob(
        printer,
        buildReceiptLineItems(items),
        baseContext,
        orderNumber,
        orderId,
        idempotencyPrefix
      )
    );
  }

  return jobs;
}
