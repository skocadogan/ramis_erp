import type { Table, Zone } from "@/types/pos";

/**
 * Gerçek masa kayıtlarından paket bölgelerindeki fizik masaları çıkarır;
 * backend’den gelen sanal paket slotlarını ekler (POS masa ızgarası).
 */
export function mergePosTablesWithTakeawayVirtual(
  rawTables: Table[],
  virtualTables: Table[],
  zones: Zone[],
): Table[] {
  const takeawayZoneIds = new Set(
    zones.filter((z) => z.is_takeaway).map((z) => z.id),
  );
  if (takeawayZoneIds.size === 0 && virtualTables.length > 0) {
    for (const v of virtualTables) {
      if (v.zone) takeawayZoneIds.add(v.zone);
    }
  }
  const filtered = rawTables.filter((t) => !takeawayZoneIds.has(t.zone));
  return [...filtered, ...virtualTables];
}
