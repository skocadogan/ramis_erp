export interface PrinterConfig {
  printerId: string;
  templateSlug: string;
}

export function normalizePrinterList(
  raw: unknown
): PrinterConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => {
    if (p && typeof p === "object") {
      const o = p as Record<string, unknown>;
      return {
        printerId: String(o.printerId ?? ""),
        templateSlug: String(o.templateSlug ?? ""),
      };
    }
    return { printerId: "", templateSlug: "" };
  });
}

let cloudPrefsSaveAllowed = false;
let skipCloudPrefsRemoteSave = false;
let cloudPrefsSaveTimer: ReturnType<typeof setTimeout> | null = null;

export function markPosCloudPrefsSaveAllowed(allowed: boolean) {
  if (!allowed && cloudPrefsSaveTimer) {
    clearTimeout(cloudPrefsSaveTimer);
    cloudPrefsSaveTimer = null;
  }
  cloudPrefsSaveAllowed = allowed;
}

export function isCloudPrefsSaveAllowed(): boolean {
  return cloudPrefsSaveAllowed;
}

export function isSkipCloudPrefsRemoteSave(): boolean {
  return skipCloudPrefsRemoteSave;
}

export function clearCloudPrefsSaveTimer(): void {
  if (cloudPrefsSaveTimer) {
    clearTimeout(cloudPrefsSaveTimer);
    cloudPrefsSaveTimer = null;
  }
}

export function setCloudPrefsSaveTimer(timer: ReturnType<typeof setTimeout> | null): void {
  cloudPrefsSaveTimer = timer;
}

export function setSkipCloudPrefsRemoteSave(val: boolean): void {
  skipCloudPrefsRemoteSave = val;
}
