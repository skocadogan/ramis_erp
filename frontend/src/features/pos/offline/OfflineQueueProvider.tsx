"use client";

import type { ReactNode } from "react";
import { useOfflineQueueState } from "./useOfflineQueue";
import { SyncProgressDialog } from "./SyncProgressDialog";

/** POS / garson sayfalarında mount edilir; flush döngüsünü başlatır. */
export function OfflineQueueProvider({ children }: { children: ReactNode }) {
  useOfflineQueueState();
  return (
    <>
      {children}
      <SyncProgressDialog />
    </>
  );
}
