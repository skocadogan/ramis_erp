import type { GroupedOrder } from "../types";

/** OrderGrid iptal zarfi ile aynı (ms). */
const KDS_CANCELLED_GRACE_MS = 15_000;

function filterVisibleGroupedOrders(groups: GroupedOrder[], nowMs: number): GroupedOrder[] {
  return groups.filter((group) => {
    if (!group.all_cancelled) return true;
    return nowMs - group.max_updated_at_ts < KDS_CANCELLED_GRACE_MS;
  });
}

type KdsUnitBreakdown = {
  unitName: string | null;
  quantity: number;
  /** Aynı birim + seçenek kombinasyonu (sidebar: «1x Az (Ekstra Soslu)») */
  modifierNames: string[];
};

function itemModifierNames(item: GroupedOrder["items"][number]): string[] {
  return (item.modifiers ?? [])
    .map((m) => (m.modifier_name || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "tr"));
}

function unitBreakdownKey(unitName: string, modifierNames: string[]): string {
  return `${unitName}\u0000${modifierNames.join("\u0001")}`;
}

type KdsCombinedPartAgg = {
  product_name: string;
  quantity_total: number;
  unit_name: string | null;
};

export type KdsProductTotalRow = {
  productName: string;
  categoryName: string | null;
  totalQuantity: number;
  units: KdsUnitBreakdown[];
  /** Birleşik ürün için alt bileşen toplamları */
  combinedParts?: KdsCombinedPartAgg[];
};

type TotalsBucket = {
  categoryName: string | null;
  productName: string;
  totalQuantity: number;
  unitBreakdown: Map<
    string,
    { unitName: string | null; modifierNames: string[]; quantity: number }
  >;
  combinedPartsAgg: Map<string, KdsCombinedPartAgg>;
  /** Birleşik menü ana satırı — aynı parent_item yalnızca bir kez adetlenir */
  countedParentItemIds?: Set<string>;
};

function addCombinedPart(
  bucket: TotalsBucket,
  part: { product_name: string; quantity_total: number; unit_name: string | null },
) {
  const pname = (part.product_name || "").trim() || "?";
  const un = part.unit_name ?? null;
  const ck = `${pname}\u0000${un ?? ""}`;
  const pq = Number(part.quantity_total) || 0;
  const prev = bucket.combinedPartsAgg.get(ck);
  if (prev) {
    bucket.combinedPartsAgg.set(ck, {
      ...prev,
      quantity_total: prev.quantity_total + pq,
    });
  } else {
    bucket.combinedPartsAgg.set(ck, {
      product_name: pname,
      quantity_total: pq,
      unit_name: un,
    });
  }
}

function addStandaloneItem(bucket: TotalsBucket, item: GroupedOrder["items"][number]) {
  const qty = Number(item.quantity) || 0;
  const unitName = (item.unit_name || "").trim();
  const modifierNames = itemModifierNames(item);
  const breakdownKey = unitBreakdownKey(unitName, modifierNames);

  bucket.totalQuantity += qty;
  const prevUnit = bucket.unitBreakdown.get(breakdownKey);
  if (prevUnit) {
    bucket.unitBreakdown.set(breakdownKey, {
      ...prevUnit,
      quantity: prevUnit.quantity + qty,
    });
  } else {
    bucket.unitBreakdown.set(breakdownKey, {
      unitName: unitName || null,
      modifierNames,
      quantity: qty,
    });
  }

  if (item.is_combined_product && Array.isArray(item.combined_parts) && item.combined_parts.length > 0) {
    for (const part of item.combined_parts) {
      addCombinedPart(bucket, part);
    }
  }
}

function addCombinedComponentItem(bucket: TotalsBucket, item: GroupedOrder["items"][number]) {
  const parentId = item.parent_item;
  if (!parentId) return;

  if (!bucket.countedParentItemIds) {
    bucket.countedParentItemIds = new Set();
  }
  if (!bucket.countedParentItemIds.has(parentId)) {
    bucket.countedParentItemIds.add(parentId);
    bucket.totalQuantity += Number(item.combined_parent_quantity) || 0;
  }

  const compQty = Number(item.quantity) || 0;
  addCombinedPart(bucket, {
    product_name: item.product_name,
    quantity_total: compQty,
    unit_name: item.unit_name ?? null,
  });
}

export function aggregateOrderedProductTotals(
  groups: GroupedOrder[],
  nowMs: number
): KdsProductTotalRow[] {
  const visible = filterVisibleGroupedOrders(groups, nowMs);

  const totalsMap = new Map<string, TotalsBucket>();

  for (const g of visible) {
    for (const item of g.items) {
      if (item.status === "CANCELLED") continue;

      if (item.parent_item && item.combined_parent_name) {
        const categoryName = item.combined_parent_category_name || item.category_name || "";
        const productName = (item.combined_parent_name || "").trim() || "?";
        const key = `combined|${categoryName}|${productName}`;
        const existing = totalsMap.get(key) ?? {
          categoryName: item.combined_parent_category_name ?? item.category_name,
          productName,
          totalQuantity: 0,
          unitBreakdown: new Map(),
          combinedPartsAgg: new Map<string, KdsCombinedPartAgg>(),
          countedParentItemIds: new Set<string>(),
        };
        addCombinedComponentItem(existing, item);
        totalsMap.set(key, existing);
        continue;
      }

      if (item.parent_item) continue;

      const categoryName = item.category_name || "";
      const productName = (item.product_name || "").trim() || "?";
      const key = `${categoryName}|${productName}`;
      const existing = totalsMap.get(key) ?? {
        categoryName: item.category_name,
        productName,
        totalQuantity: 0,
        unitBreakdown: new Map(),
        combinedPartsAgg: new Map<string, KdsCombinedPartAgg>(),
      };
      addStandaloneItem(existing, item);
      totalsMap.set(key, existing);
    }
  }

  return [...totalsMap.values()]
    .map((v) => ({
      productName: v.productName,
      categoryName: v.categoryName,
      totalQuantity: v.totalQuantity,
      units: [...v.unitBreakdown.values()].sort((a, b) => {
        const unitCmp = (a.unitName || "").localeCompare(b.unitName || "", "tr");
        if (unitCmp !== 0) return unitCmp;
        return a.modifierNames.join(",").localeCompare(b.modifierNames.join(","), "tr");
      }),
      combinedParts:
        v.combinedPartsAgg.size > 0
          ? [...v.combinedPartsAgg.values()].sort((a, b) =>
              a.product_name.localeCompare(b.product_name, "tr"),
            )
          : undefined,
    }))
    .sort((a, b) => {
      const catA = a.categoryName || "";
      const catB = b.categoryName || "";
      if (catA !== catB) return catA.localeCompare(catB, "tr");
      return a.productName.localeCompare(b.productName, "tr");
    });
}
