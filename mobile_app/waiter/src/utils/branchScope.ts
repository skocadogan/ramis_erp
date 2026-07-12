/**
 * POS’ta kullanıcı profil şubesi ile kalıcı `activeBranchId` önceliği.
 * Çoklu şube senaryosunda activeBranchId doğru bağlamı temsil eder.
 */
export function effectiveBranchId(
  userBranchId: string | undefined | null,
  activeBranchId: string | null | undefined
): string | null {
  const a =
    activeBranchId != null && String(activeBranchId).trim() !== "" ? String(activeBranchId) : null;
  const u =
    userBranchId != null && String(userBranchId).trim() !== "" ? String(userBranchId) : null;
  return a || u || null;
}
