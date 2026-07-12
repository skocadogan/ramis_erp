"use client";

const MAX_PRINT_IDEMPOTENCY_KEY_LENGTH = 128;

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function buildPrintJobIdempotencyKey(
  prefix: string,
  printerId: string,
  templateSlug: string
): string {
  const key = `print:${prefix}:${printerId}:${hashString(templateSlug)}`;

  if (key.length <= MAX_PRINT_IDEMPOTENCY_KEY_LENGTH) {
    return key;
  }

  return `print:${hashString(key)}:${printerId}`;
}
