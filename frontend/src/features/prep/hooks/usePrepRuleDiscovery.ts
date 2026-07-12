import { useQuery } from "@tanstack/react-query";
import { prepApi } from "../services/prepApi";

export interface RuleDiscovery {
  product_id: string;
  product_name: string;
  total_sold_30d: number;
  reason: string;
}

export function usePrepRuleDiscovery(branchId?: string) {
  return useQuery<RuleDiscovery[]>({
    queryKey: ['prep-rule-discovery', branchId],
    queryFn: () => prepApi.getRuleDiscovery(branchId),
    enabled: !!branchId,
  });
}
