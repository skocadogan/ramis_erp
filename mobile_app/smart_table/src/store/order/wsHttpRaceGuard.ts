let revision = 0;

export function captureWsRevision(): number {
  return revision;
}

export function markWsOrderMutation(): void {
  revision += 1;
}

export function isWsRevisionCurrent(capturedRevision: number): boolean {
  return capturedRevision === revision;
}
