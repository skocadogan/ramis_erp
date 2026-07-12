/** KDS: aynı masayı farklı siparişlerde eşleştirme (backend table.name ile uyumlu, küçük harf). */
export function kdsTableMergeKey(tableName: string): string {
  return tableName.trim().toLowerCase();
}
