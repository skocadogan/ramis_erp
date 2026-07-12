import api, { skipInterceptorToast } from "@/lib/api";

export interface ReservationDto {
  id: string;
  branch: string;
  table: string | null;
  table_name: string | null;
  zone_name: string | null;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  status: string;
  status_display: string;
  notes: string;
}

export interface ReservationBranchSettingsDto {
  id?: string;
  branch: string;
  due_alert_lead_minutes: number;
  due_alert_interval_minutes: number;
  updated_at?: string;
}

export async function fetchReservationBranchSettings(branchId: string) {
  const { data } = await api.get<ReservationBranchSettingsDto>(
    "/reservations/branch-settings/by-branch/",
    { params: { branch_id: branchId } }
  );
  return data;
}

export async function patchReservationBranchSettings(payload: {
  branch: string;
  due_alert_lead_minutes: number;
  due_alert_interval_minutes: number;
}) {
  const { data } = await api.patch<ReservationBranchSettingsDto>(
    "/reservations/branch-settings/by-branch/",
    payload,
    { ...skipInterceptorToast }
  );
  return data;
}

export async function fetchReservations(params: { branch_id?: string; scheduled_date?: string }) {
  const { data } = await api.get<{ results?: ReservationDto[] } | ReservationDto[]>("/reservations/", {
    params,
  });
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export async function createReservation(payload: Record<string, unknown>) {
  const { data } = await api.post<ReservationDto>("/reservations/", payload, { ...skipInterceptorToast });
  return data;
}

export async function reservationAction(id: string, action: "confirm" | "seat" | "cancel" | "no-show", body?: object) {
  const path =
    action === "no-show"
      ? `/reservations/${id}/no-show/`
      : `/reservations/${id}/${action}/`;
  const { data } = await api.post(path, body ?? {}, { ...skipInterceptorToast });
  return data;
}

export async function deleteReservation(id: string) {
  await api.delete(`/reservations/${id}/`, { ...skipInterceptorToast });
}
