/** Fiş şablonu {{ date }} / {{ time }} ve backend created_at parse için TR alanları. */
export function buildReceiptDateTimeContext(isoLike: string | undefined | null): {
  created_at: string;
  date: string;
  time: string;
} {
  const parsed = isoLike ? new Date(isoLike) : new Date();
  const dt = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  return {
    created_at: dt.toISOString(),
    date: dt.toLocaleDateString("tr-TR"),
    time: dt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
  };
}
