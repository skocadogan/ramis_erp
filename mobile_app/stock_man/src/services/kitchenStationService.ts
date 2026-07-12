// ============================================================
// Stock Man — Kitchen Station service
//
// GET /stations/ — branch-scoped mutfak istasyonu listesi.
// RBAC: branches.view_station veya branches.manage_station
// ============================================================

import { axiosClient } from "@/api/client";
import { extractResults } from "@/types/api";
import type { KitchenStation, UUID } from "@/types";

export const kitchenStationService = {
  list: async (params?: { branch_id?: UUID }): Promise<KitchenStation[]> => {
    const res = await axiosClient.get("/stations/", { params });
    return extractResults<KitchenStation>(res.data);
  },
};
