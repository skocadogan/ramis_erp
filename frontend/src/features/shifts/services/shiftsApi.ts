import api, { skipInterceptorToast } from "@/lib/api";
import type { PaginatedResponse } from "@/lib/types";
import type { ShiftDto, ShiftZReportDto, ShiftCashReportDto } from "../types";

const SHIFTS_PAGE_SIZE = 40;

export async function fetchActiveShift(branchId: string, terminalId?: string | null): Promise<ShiftDto | null> {
  const { data } = await api.get<ShiftDto | null>("/shifts/active/", {
    params: { branch_id: branchId, terminal_id: terminalId },
  });
  return data;
}

export async function fetchShiftsPage(params: {
  branch_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  opened_at_terminal?: string;
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<ShiftDto>> {
  const { data } = await api.get<PaginatedResponse<ShiftDto> | ShiftDto[]>("/shifts/", {
    params: {
      ...params,
      page: params.page ?? 1,
      page_size: params.page_size ?? SHIFTS_PAGE_SIZE,
    },
  });
  if (Array.isArray(data)) {
    return { count: data.length, next: null, previous: null, results: data };
  }
  return {
    count: data.count ?? data.results?.length ?? 0,
    next: data.next ?? null,
    previous: data.previous ?? null,
    results: data.results ?? [],
  };
}

export async function openShift(branchId: string, openingCash: string, atTerminalId?: string | null) {
  const { data } = await api.post<ShiftDto>(
    "/shifts/open/",
    {
      branch_id: branchId,
      opening_cash: openingCash,
      at_terminal_id: atTerminalId,
    },
    { ...skipInterceptorToast },
  );
  return data;
}

export async function closeShift(
  shiftId: string,
  actualCash: string,
  actualCard: string = "0",
  actualOther: string = "0",
  notes?: string
) {
  const { data } = await api.post<ShiftDto>(
    `/shifts/${shiftId}/close/`,
    {
      actual_cash: actualCash,
      actual_card: actualCard,
      actual_other: actualOther,
      notes: notes ?? "",
    },
    { ...skipInterceptorToast },
  );
  return data;
}

export async function fetchZReport(shiftId: string) {
  const { data } = await api.get<ShiftZReportDto>(`/shifts/${shiftId}/z-report/`, {
    ...skipInterceptorToast,
  });
  return data;
}

export async function fetchCashReport(shiftId: string) {
  const { data } = await api.get<ShiftCashReportDto>(`/shifts/${shiftId}/cash-report/`, {
    ...skipInterceptorToast,
  });
  return data;
}

export async function addShiftExpense(shiftId: string, description: string, amount: string) {
  const { data } = await api.post(
    `/shifts/${shiftId}/expenses/`,
    { description, amount },
    { ...skipInterceptorToast },
  );
  return data;
}

export async function addCashMovement(
  shiftId: string,
  amount: string,
  movementType: "IN" | "OUT",
  description: string
) {
  const { data } = await api.post(`/shifts/${shiftId}/cash-movements/`, {
    amount,
    movement_type: movementType,
    description,
  });
  return data;
}

export async function updateShiftClosingInfo(
  shiftId: string,
  actualCash: string,
  actualCard: string = "0",
  actualOther: string = "0",
  notes?: string
) {
  const { data } = await api.post<ShiftDto>(
    `/shifts/${shiftId}/update-closing/`,
    {
      actual_cash: actualCash,
      actual_card: actualCard,
      actual_other: actualOther,
      notes: notes ?? "",
    },
    { ...skipInterceptorToast },
  );
  return data;
}
