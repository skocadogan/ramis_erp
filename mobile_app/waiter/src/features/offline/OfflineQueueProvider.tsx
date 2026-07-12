import React, { type ReactNode } from "react";
import { useOfflineQueueState } from "./useOfflineQueue";
import { SyncProgressModal } from "./SyncProgressModal";

/** Stack ile aynı layout seviyesinde; navigator'ı sarmalamaz. */
export function OfflineQueueHost() {
  useOfflineQueueState();
  return <SyncProgressModal />;
}

/** @deprecated OfflineQueueHost kullanın */
function OfflineQueueProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <OfflineQueueHost />
    </>
  );
}

void OfflineQueueProvider;
