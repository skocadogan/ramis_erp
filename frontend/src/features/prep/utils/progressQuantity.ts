/** Hazırlık görevi ilerlemesi: hedefe göre sınırlı artış/azalış (±1 adım). */
export function adjustPrepCompletedQuantity(
  current: number,
  target: number,
  delta: number
): number {
  const c = Number(current);
  const t = Number(target);
  if (!Number.isFinite(c) || !Number.isFinite(t) || t < 0) return 0;
  const next = c + delta;
  if (next < 0) return 0;
  if (next > t) return t;
  return next;
}

export function prepProgressPercent(completed: number, target: number): number {
  const c = Number(completed);
  const t = Number(target);
  if (!Number.isFinite(c) || !Number.isFinite(t) || t <= 0) return 0;
  return Math.min(100, Math.max(0, (c / t) * 100));
}
