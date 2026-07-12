export type SyncSessionState = {
  active: boolean;
  total: number;
  completed: number;
  currentLabel: string | null;
};

const IDLE: SyncSessionState = {
  active: false,
  total: 0,
  completed: 0,
  currentLabel: null,
};

type SyncSessionListener = () => void;

const listeners = new Set<SyncSessionListener>();
let session: SyncSessionState = { ...IDLE };

function notify() {
  listeners.forEach((listener) => listener());
}

export function getSyncSessionState(): SyncSessionState {
  return session;
}

export function subscribeSyncSession(listener: SyncSessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function beginSyncSession(total: number): void {
  session = {
    active: true,
    total: Math.max(0, total),
    completed: 0,
    currentLabel: null,
  };
  notify();
}

export function updateSyncSessionProgress(completed: number, currentLabel?: string | null): void {
  if (!session.active) return;
  session = {
    ...session,
    completed: Math.min(completed, session.total),
    currentLabel: currentLabel ?? session.currentLabel,
  };
  notify();
}

export function endSyncSession(): void {
  session = { ...IDLE };
  notify();
}
