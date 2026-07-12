import type { StockMovementType } from "@/types";

const MOVEMENT_TYPE_KEYS: StockMovementType[] = [
  "IN",
  "OUT",
  "ADJUSTMENT",
  "TRANSFER",
  "WASTE",
  "RETURN",
  "CANCEL",
  "DISPOSAL",
];

export type MovementTypeTranslateFn = (key: string) => string;

export function getStockMovementTypeLabel(
  type: StockMovementType,
  t: MovementTypeTranslateFn,
): string {
  if (MOVEMENT_TYPE_KEYS.includes(type)) {
    return t(`stock.movementType.${type}`);
  }
  return type;
}

export function getStockMovementTypeAbbr(
  type: StockMovementType,
  t: MovementTypeTranslateFn,
): string {
  if (MOVEMENT_TYPE_KEYS.includes(type)) {
    const key = `stock.movementTypeAbbr.${type}`;
    const abbr = t(key);
    if (abbr !== key) return abbr;
  }
  return type.slice(0, 2);
}

export type StockMovementBadgeClasses = {
  container: string;
  text: string;
  qty: string;
};

/** Tip bazlı badge ve miktar renk sınıfları — web `stockMovementDisplay` ile uyumlu. */
export function stockMovementTypeBadgeClasses(
  type: StockMovementType,
): StockMovementBadgeClasses {
  switch (type) {
    case "IN":
      return {
        container: "bg-success/15",
        text: "text-success",
        qty: "text-success",
      };
    case "OUT":
      return {
        container: "bg-destructive/15",
        text: "text-destructive",
        qty: "text-destructive",
      };
    case "ADJUSTMENT":
      return {
        container: "bg-warning/15",
        text: "text-warning",
        qty: "text-warning",
      };
    case "TRANSFER":
      return {
        container: "bg-primary/15",
        text: "text-primary",
        qty: "text-primary",
      };
    case "RETURN":
      return {
        container: "bg-info/15",
        text: "text-info",
        qty: "text-info",
      };
    case "CANCEL":
      return {
        container: "bg-warning/15",
        text: "text-warning",
        qty: "text-warning",
      };
    case "DISPOSAL":
    case "WASTE":
    default:
      return {
        container: "bg-destructive/15",
        text: "text-destructive",
        qty: "text-destructive",
      };
  }
}

const ADJUSTMENT_DIFF_RE = /:\s*([+-]?\d+(?:[.,]\d+)?)\s*$/;

type MovementQuantityFields = {
  movement_type: StockMovementType;
  quantity: number;
  reference?: string | null;
  signed_quantity?: number | null;
};

function getStockMovementSignedQuantity(movement: MovementQuantityFields): number {
  if (movement.signed_quantity != null && !Number.isNaN(Number(movement.signed_quantity))) {
    return Number(movement.signed_quantity);
  }

  const qty = Math.abs(Number(movement.quantity) || 0);

  switch (movement.movement_type) {
    case "IN":
    case "RETURN":
      return qty;
    case "OUT":
    case "WASTE":
    case "DISPOSAL":
    case "CANCEL":
      return -qty;
    case "ADJUSTMENT": {
      const ref = (movement.reference || "").trim();
      const match = ref.match(ADJUSTMENT_DIFF_RE);
      if (match && match[1]) {
        const diff = Number.parseFloat(match[1].replace(",", "."));
        if (!Number.isNaN(diff)) return diff;
      }
      return qty;
    }
    default:
      return qty;
  }
}

export function stockMovementQuantityPrefix(
  type: StockMovementType,
  quantity: number,
  reference?: string | null,
  signedQuantity?: number | null,
): string {
  const signed = getStockMovementSignedQuantity({
    movement_type: type,
    quantity,
    reference,
    signed_quantity: signedQuantity,
  });
  if (signed > 0) return "+";
  if (signed < 0) return "−";
  return "";
}
