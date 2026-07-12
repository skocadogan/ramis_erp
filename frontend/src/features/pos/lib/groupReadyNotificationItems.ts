import type { ReadyItem } from "@/types/pos";

export type ReadyNotificationGroup = {
  key: string;
  groupLabel: string;
  items: ReadyItem[];
};

function formatTableGroupLabel(tableName: string): string {
  const t = tableName.trim();
  if (!t || t === "—") return t || "—";
  if (t === "Paket Servis") return t;
  if (/^masa\s+/i.test(t)) return t;
  return `Masa ${t}`;
}

function formatTakeawayGroupLabel(item: ReadyItem): string {
  const num = item.order_number?.trim();
  if (num) return num;
  const id = item.order_id?.trim();
  if (id && id.length >= 8) return id.slice(-8).toUpperCase();
  return "Paket Servis";
}

function getReadyItemGroupKey(item: ReadyItem): string {
  if (item.order_type === "TAKEAWAY") {
    const oid = item.order_id?.trim();
    if (oid) return `takeaway:${oid}`;
    const on = item.order_number?.trim();
    if (on) return `takeaway-num:${on}`;
  }
  return `table:${item.table_name?.trim() || "—"}`;
}

function formatReadyGroupLabel(item: ReadyItem): string {
  if (item.order_type === "TAKEAWAY") {
    return formatTakeawayGroupLabel(item);
  }
  return formatTableGroupLabel(item.table_name?.trim() || "—");
}

export function groupReadyNotificationItems(items: ReadyItem[]): ReadyNotificationGroup[] {
  const map = new Map<string, ReadyItem[]>();
  for (const item of items) {
    const key = getReadyItemGroupKey(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }

  const groups: ReadyNotificationGroup[] = Array.from(map.entries()).map(([key, groupItems]) => {
    const sorted = [...groupItems].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
    return {
      key,
      groupLabel: formatReadyGroupLabel(sorted[0]),
      items: sorted,
    };
  });

  groups.sort((a, b) => {
    const aT = Math.max(0, ...a.items.map((i) => new Date(i.updated_at).getTime()));
    const bT = Math.max(0, ...b.items.map((i) => new Date(i.updated_at).getTime()));
    return bT - aT;
  });

  return groups;
}
