type CombinedCartLine = {
  quantity?: number;
  product_name?: string;
  product_category_station?: string | null;
  product_unit_multiplier?: number;
  product?: { name?: string };
};

type CartItemLike = {
  product: {
    name: string;
    category_station?: string | null;
    is_combined?: boolean;
    combined_items?: CombinedCartLine[];
    has_discount?: boolean;
    discounted_price?: number | string | null;
    base_price?: number | string;
  };
  quantity: number;
  unitPrice: number;
  selectedUnit?: { name?: string; multiplier?: number } | null;
  selectedModifiers?: { id: string; name: string; price_adjustment?: number | string }[];
  notes?: string;
};

type KitchenPrinterLike = {
  id: string;
  usage_type?: string;
  is_active?: boolean;
  kitchen_station?: string | null;
  kitchen_station_name?: string | null;
  receipt_template_slug?: string | null;
};

const MAX_PRINT_IDEMPOTENCY_KEY_LENGTH = 128;

export type StationPrintJob = {
  templateSlug: string;
  printerId: string;
  context: Record<string, unknown>;
  idempotencyKey?: string;
};

function buildReceiptLineItems(cart: CartItemLike[]) {
  return cart.map((item) => {
    const modSum = (item.selectedModifiers ?? []).reduce(
      (s, m) => s + parseFloat(String(m.price_adjustment ?? 0)),
      0
    );
    const unitBase =
      item.unitPrice ||
      parseFloat(
        String(
          item.product.has_discount && item.product.discounted_price
            ? item.product.discounted_price
            : (item.product.base_price ?? 0)
        )
      );
    const modifierLabel = (item.selectedModifiers ?? []).map((m) => m.name).join(", ");
    return {
      name: item.product.name,
      qty: item.quantity,
      price: unitBase + modSum,
      unit: item.selectedUnit?.name || "",
      ...(modifierLabel
        ? {
            modifiers: modifierLabel,
            modifier_names: (item.selectedModifiers ?? []).map((m) => m.name),
          }
        : {}),
      ...(item.notes?.trim() ? { notes: item.notes.trim() } : {}),
    };
  });
}

function sumLineItems(items: { price: number; qty: number }[]) {
  return items.reduce((total, line) => total + line.price * line.qty, 0);
}

function expandCombinedCartLines(cart: CartItemLike[]): CartItemLike[] {
  const expanded: CartItemLike[] = [];
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
        const name = ci.product_name || ci.product?.name || "—";
        expanded.push({
          ...item,
          quantity: lineQty,
          selectedModifiers: [],
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

function itemsForKitchenStation(cart: CartItemLike[], stationId: string): CartItemLike[] {
  return cart.filter(
    (item) => !item.product.category_station || item.product.category_station === stationId
  );
}

function shouldPrintStationTicket(cart: CartItemLike[], stationId: string): boolean {
  const hasDedicated = cart.some((item) => item.product.category_station === stationId);
  const hasShared = cart.some((item) => !item.product.category_station);
  return hasDedicated || hasShared;
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function buildPrintJobIdempotencyKey(
  prefix: string,
  printerId: string,
  templateSlug: string
): string {
  const key = `print:${prefix}:${printerId}:${hashString(templateSlug)}`;
  return key.length <= MAX_PRINT_IDEMPOTENCY_KEY_LENGTH
    ? key
    : `print:${hashString(key)}:${printerId}`;
}

function printJobIdempotencyKey(
  idempotencyPrefix: string | undefined,
  orderId: string | undefined,
  printer: KitchenPrinterLike
): string | undefined {
  if (!idempotencyPrefix) return undefined;
  const slugPart = printer.receipt_template_slug ?? "template";
  return buildPrintJobIdempotencyKey(orderId ?? idempotencyPrefix, printer.id, slugPart);
}

function activeKitchenPrinters(printers: KitchenPrinterLike[]) {
  return printers.filter(
    (p) =>
      p.usage_type === "KITCHEN" &&
      p.is_active !== false &&
      Boolean(p.kitchen_station) &&
      Boolean(p.receipt_template_slug)
  );
}

export function buildStationOrderPrintJobs(args: {
  cart: CartItemLike[];
  kitchenPrinters: KitchenPrinterLike[];
  baseContext: Record<string, unknown>;
  orderNumber?: string;
  orderId?: string;
  idempotencyPrefix?: string;
}): StationPrintJob[] {
  const { cart, kitchenPrinters, baseContext, orderNumber, orderId, idempotencyPrefix } = args;
  if (!cart.length) return [];

  const kitchenCart = expandCombinedCartLines(cart);

  const printers = activeKitchenPrinters(kitchenPrinters);
  if (!printers.length) return [];

  const printerByStation = new Map<string, KitchenPrinterLike>();
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

  const makeJob = (
    printer: KitchenPrinterLike,
    items: ReturnType<typeof buildReceiptLineItems>
  ) => {
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
        ...(printer.kitchen_station_name ? { station_name: printer.kitchen_station_name } : {}),
      },
      idempotencyKey: printJobIdempotencyKey(idempotencyPrefix, orderId, printer),
    };
  };

  if (uniqueStations.length <= 1) {
    const stationId = uniqueStations[0] ?? null;
    let printer = stationId ? printerByStation.get(stationId) : undefined;
    if (!printer && printers.length === 1) {
      printer = printers[0];
    }
    if (!printer) return [];
    return [makeJob(printer, buildReceiptLineItems(kitchenCart))];
  }

  const grouped = new Map<string, CartItemLike[]>();
  for (const [stationId] of printerByStation) {
    if (!shouldPrintStationTicket(kitchenCart, stationId)) continue;
    grouped.set(stationId, itemsForKitchenStation(kitchenCart, stationId));
  }

  const jobs: StationPrintJob[] = [];
  for (const [stationId, items] of grouped) {
    const printer = printerByStation.get(stationId);
    if (!printer || !items.length) continue;
    jobs.push(makeJob(printer, buildReceiptLineItems(items)));
  }
  return jobs;
}
