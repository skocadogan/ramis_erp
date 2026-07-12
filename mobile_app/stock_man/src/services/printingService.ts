// ============================================================
// Stock Man — Printing service (P5)
//
// Thin REST client for the `/printing/printers/` and
// `/printing/jobs/` endpoints. Actual ESC/POS dispatch is
// performed server-side by Celery (`print_thermal` task); the
// mobile app only ever *queues* a job and the result surfaces
// later via either a WebSocket push or polling `/printing/print-jobs/`.
//
// We don't wrap `print_thermal` here because that's called
// inline from the receipt-flow screens (e.g. goods receiving
// receipt) via the `reporting` service, not the `printing`
// admin module. This file is for the P5 printer-picker UI:
// the warehouse tablet shows the user a list of installed
// printers, they tap one, we POST a job to the backend.
// ============================================================

import { axiosClient } from "@/api/client";
import type { Paginated, Printer, PrintJobCreate, UUID } from "@/types";

export const printingService = {
  /** List printers, optionally filtered by `usage_type` / `is_active`. */
  list: async (params?: { usage_type?: string; is_active?: boolean }): Promise<Paginated<Printer>> => {
    const res = await axiosClient.get("/printing/printers/", { params });
    return res.data;
  },

  /** Single-printer detail (rarely needed on mobile, but useful for the
   *  "Test print" flow in the printer-settings sheet). */
  get: async (id: UUID): Promise<Printer> => {
    const res = await axiosClient.get<Printer>(`/printing/printers/${id}/`);
    return res.data;
  },

  /** Create a print job. The backend returns a job_id that can be
   *  polled via `/printing/print-jobs/{job_id}/`. */
  createJob: async (payload: PrintJobCreate): Promise<{ job_id: UUID; status: string }> => {
    const res = await axiosClient.post<{ job_id: UUID; status: string }>(
      "/printing/jobs/",
      payload
    );
    return res.data;
  },
};
