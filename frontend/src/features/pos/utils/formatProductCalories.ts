/** POS / müşteri ekranı — ürün kalori etiketi (kCal). */
export function formatProductCalories(
  calories: number | null | undefined,
  t: (key: string, values?: Record<string, number>) => string,
): string | null {
  if (calories == null || !Number.isFinite(calories) || calories <= 0) {
    return null;
  }
  return t("caloriesValue", { value: Math.round(calories) });
}
