import type { Printer } from "@/features/admin/services/adminApi";
import type { OrderDetail } from "@/features/tables/components/TableOrderModal/types";
import type { ReceiptPrintJob } from "./dispatchReceiptPrints";
import { buildPrintJobIdempotencyKey } from "./printIdempotency";

/** Mutfak yeniden baskı: teslim edilmiş kalemler dahil (backend enrich ile uyumlu). */
const KITCHEN_REPRINT_ITEM_STATUSES = new Set([
  "PENDING",
  "PREPARING",
  "READY",
  "DELIVERED",
]);

function activeKitchenPrinters(printers: Printer[]): Printer[] {
  return printers.filter(
    (p) =>
      p.usage_type === "KITCHEN" &&
      p.is_active &&
      Boolean(p.kitchen_station) &&
      Boolean(p.receipt_template_slug),
  );
}

function itemsForKitchenReprint(order: OrderDetail) {
  const eligible = order.items.filter(
    (item) =>
      item.status !== "CANCELLED" &&
      KITCHEN_REPRINT_ITEM_STATUSES.has(item.status),
  );
  if (eligible.length) return eligible;
  // Yedek: istasyon yönlendirmesi için iptal hariç kalemler (kalemler backend'de yüklenir).
  return order.items.filter((item) => item.status !== "CANCELLED");
}

function shouldPrintStationTicket(order: OrderDetail, stationId: string): boolean {
  const items = itemsForKitchenReprint(order);
  const hasDedicated = items.some((item) => item.station_id === stationId);
  const hasShared = items.some((item) => !item.station_id);
  return hasDedicated || hasShared;
}

function orderHasReprintableItems(order: OrderDetail): boolean {
  return order.items.some((item) => item.status !== "CANCELLED");
}

/**
 * Masa siparişlerinden mutfak fişi yeniden baskı işleri üretir.
 * Kalemler backend'de order_id + kitchen_station_id ile zenginleştirilir.
 */
export function buildKitchenReprintJobsFromOrders(args: {
  orders: OrderDetail[];
  kitchenPrinters: Printer[];
  baseContext: Record<string, unknown>;
  reprintToken: string;
}): ReceiptPrintJob[] {
  const { orders, kitchenPrinters, baseContext, reprintToken } = args;
  const printers = activeKitchenPrinters(kitchenPrinters);
  if (!printers.length || !orders.length) return [];

  const printerByStation = new Map<string, Printer>();
  for (const printer of printers) {
    if (printer.kitchen_station) {
      printerByStation.set(printer.kitchen_station, printer);
    }
  }

  const jobs: ReceiptPrintJob[] = [];

  for (const order of orders) {
    if (!orderHasReprintableItems(order)) continue;

    const items = itemsForKitchenReprint(order);
    const orderJobsBefore = jobs.length;

    const orderId = order.id;
    const orderNumber = order.order_number || orderId;

    const makeJob = (printer: Printer) => ({
      templateSlug: printer.receipt_template_slug!,
      printerId: printer.id,
      context: {
        ...baseContext,
        order_id: orderId,
        order_number: orderNumber,
        kitchen_station_id: printer.kitchen_station,
        ...(printer.kitchen_station_name
          ? { station_name: printer.kitchen_station_name }
          : {}),
        ...(order.notes?.trim() ? { notes: order.notes.trim() } : {}),
      },
      idempotencyKey: buildPrintJobIdempotencyKey(
        `reprint:${reprintToken}:${orderId}`,
        printer.id,
        printer.receipt_template_slug!,
      ),
    });

    const stationIdsInOrder = new Set<string>();
    for (const item of items) {
      if (item.station_id) stationIdsInOrder.add(item.station_id);
    }
    const uniqueStations = [...stationIdsInOrder];

    if (uniqueStations.length <= 1) {
      const stationId = uniqueStations[0] ?? null;
      let printer = stationId ? printerByStation.get(stationId) : undefined;
      if (!printer && printers.length === 1) {
        printer = printers[0];
      }
      if (printer) {
        jobs.push(makeJob(printer));
      }
    } else {
      for (const stationId of printerByStation.keys()) {
        if (!shouldPrintStationTicket(order, stationId)) continue;
        const printer = printerByStation.get(stationId);
        if (!printer) continue;
        jobs.push(makeJob(printer));
      }
    }

    // İstasyon eşleşmesi bulunamadıysa her mutfak yazıcısına gönder; kalemler backend'de yüklenir.
    if (jobs.length === orderJobsBefore) {
      for (const printer of printers) {
        jobs.push(makeJob(printer));
      }
    }
  }

  return jobs;
}
