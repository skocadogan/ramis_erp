// ============================================================
// cn — Lightweight className merger
//
// Recursively flattens arrays and filters falsy values.
// Mirrors the smart_table pattern but supports nested arrays
// for conditional grouping:
//   cn('px-4', isActive && 'bg-primary', [disabled && 'opacity-50', error && 'border-destructive'])
// ============================================================

type ClassValue = string | number | null | false | undefined | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const push = (v: ClassValue) => {
    if (!v) return;
    if (typeof v === "string" || typeof v === "number") {
      out.push(String(v));
    } else if (Array.isArray(v)) {
      v.forEach(push);
    }
  };
  inputs.forEach(push);
  return out.filter(Boolean).join(" ");
}
