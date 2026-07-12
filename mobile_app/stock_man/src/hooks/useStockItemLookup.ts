// ============================================================
// Stock Man — useStockItemLookup
//
// Resolves a barcode / SKU / product name to stock items only
// (used by the product search screen).
// ============================================================

import { useMutation } from "@tanstack/react-query";
import {
  scannerService,
  type StockOnlyLookupResult,
} from "@/services/scannerService";

export function useStockItemLookup() {
  return useMutation<StockOnlyLookupResult, Error, string>({
    mutationFn: (query: string) => scannerService.lookupStockOnly(query),
  });
}
