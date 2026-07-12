export type BackendHealthSnapshot = "checking" | "ok" | "down";

let backendHealthSnapshot: BackendHealthSnapshot = "checking";

export function publishBackendHealthStatus(status: BackendHealthSnapshot): void {
  backendHealthSnapshot = status;
}

export function getBackendHealthSnapshot(): BackendHealthSnapshot {
  return backendHealthSnapshot;
}
