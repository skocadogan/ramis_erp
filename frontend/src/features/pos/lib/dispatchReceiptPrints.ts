"use client";

import { toast } from "sonner";
import { adminApi } from "@/features/admin/services/adminApi";
import { toastApiError, toastApiSuccess } from "@/lib/operationalToast";

export type ReceiptPrintJob = {
  templateSlug: string;
  printerId: string;
  context: Record<string, unknown>;
  idempotencyKey?: string;
};

export type DispatchReceiptPrintsOptions = {
  getPrinterErrorMessage: (printerId: string) => string;
  successMessage?: string;
  partialSuccessMessage?: (args: { succeeded: number; failed: number; total: number }) => string;
};

/** POS / masa ödemesi fiş baskılarını paralel kuyruğa alır; hata ve başarı toast'larını yönetir. */
export async function dispatchReceiptPrints(
  jobs: ReceiptPrintJob[],
  options: DispatchReceiptPrintsOptions
): Promise<{ succeeded: number; failed: number }> {
  const pending = jobs.filter((j) => j.templateSlug && j.printerId);
  if (!pending.length) {
    return { succeeded: 0, failed: 0 };
  }

  const results = await Promise.allSettled(
    pending.map((job) =>
      adminApi.printReceiptThermal(
        job.templateSlug,
        job.printerId,
        job.context,
        job.idempotencyKey ? { idempotencyKey: job.idempotencyKey } : undefined
      )
    )
  );

  let succeeded = 0;
  let failed = 0;
  results.forEach((result, idx) => {
    if (result.status === "fulfilled") {
      succeeded += 1;
      return;
    }
    failed += 1;
    toastApiError(result.reason, options.getPrinterErrorMessage(pending[idx].printerId));
  });

  if (succeeded > 0 && failed === 0 && options.successMessage) {
    toastApiSuccess(options.successMessage);
  } else if (succeeded > 0 && failed > 0 && options.partialSuccessMessage) {
    toast.warning(
      options.partialSuccessMessage({ succeeded, failed, total: pending.length })
    );
  }

  return { succeeded, failed };
}
