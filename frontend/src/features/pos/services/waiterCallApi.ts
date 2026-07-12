import api from "@/lib/api";

export type PendingWaiterCall = {
  call_id: string;
  branch_id: string;
  table_id?: string | null;
  table_name?: string;
  zone_name?: string;
  source?: string;
  message: string;
  created_at?: string;
  reservation_id?: string | null;
  customer_name?: string | null;
};

export async function fetchPendingWaiterCalls(
  branchId: string
): Promise<PendingWaiterCall[]> {
  const res = await api.get<{ calls: PendingWaiterCall[] }>(
    "/waiter-calls/pending/",
    { params: { branch_id: branchId } }
  );
  return res.data.calls ?? [];
}

export async function dismissWaiterCalls(params: {
  branchId: string;
  callId?: string;
  callIds?: string[];
  dismissAll?: boolean;
}): Promise<void> {
  const body: Record<string, unknown> = {
    branch_id: params.branchId,
  };
  if (params.dismissAll) {
    body.dismiss_all = true;
  } else if (params.callIds?.length) {
    body.call_ids = params.callIds;
  } else if (params.callId) {
    body.call_id = params.callId;
  }
  await api.post("/waiter-calls/dismiss/", body);
}
