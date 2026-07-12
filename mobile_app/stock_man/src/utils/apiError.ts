// ============================================================
// Stock Man — API error extraction helper
// DRF: detail, error, non_field_errors, alan hataları, iç içe items.
// ============================================================

const STRUCTURED_ERROR_KEYS = new Set([
  "code",
  "insufficient_items",
]);

function formatFieldLabel(key: string): string {
  if (key === "non_field_errors") return "";
  return key.replace(/_/g, " ");
}

function collectValidationMessages(value: unknown, path = ""): string[] {
  if (value == null) return [];

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return [];
    return path ? [`${path}: ${text}`] : [text];
  }

  if (Array.isArray(value)) {
    if (value.every((entry) => typeof entry === "string")) {
      const texts = value.map((entry) => String(entry).trim()).filter(Boolean);
      if (texts.length === 0) return [];
      if (!path) return texts;
      return [`${path}: ${texts.join(", ")}`];
    }

    return value.flatMap((entry, index) => {
      const rowLabel = path ? `${path} ${index + 1}` : `#${index + 1}`;
      if (typeof entry === "string") {
        const text = entry.trim();
        return text ? [`${rowLabel}: ${text}`] : [];
      }
      if (
        entry &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        Object.keys(entry).length === 0
      ) {
        return [];
      }
      return collectValidationMessages(entry, rowLabel);
    });
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, nested]) => {
        if (STRUCTURED_ERROR_KEYS.has(key)) return [];
        if (key === "non_field_errors") {
          return collectValidationMessages(nested, path);
        }
        const label = path
          ? `${path} · ${formatFieldLabel(key)}`
          : formatFieldLabel(key);
        return collectValidationMessages(nested, label);
      }
    );
  }

  const text = String(value).trim();
  return text ? (path ? [`${path}: ${text}`] : [text]) : [];
}

function extractFromResponseData(data: unknown): string | null {
  if (typeof data === "string" && data.trim()) {
    return data.trim();
  }

  if (Array.isArray(data)) {
    const messages = collectValidationMessages(data);
    return messages.length > 0 ? messages.join("\n") : null;
  }

  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }

  if (record.detail !== undefined) {
    if (typeof record.detail === "string" && record.detail.trim()) {
      return record.detail.trim();
    }
    const detailMessages = collectValidationMessages(record.detail);
    if (detailMessages.length > 0) {
      return detailMessages.join("\n");
    }
  }

  const fieldMessages = collectValidationMessages(
    Object.fromEntries(
      Object.entries(record).filter(
        ([key]) =>
          !STRUCTURED_ERROR_KEYS.has(key) &&
          key !== "detail" &&
          key !== "error" &&
          key !== "message"
      )
    )
  );
  if (fieldMessages.length > 0) {
    return fieldMessages.join("\n");
  }

  return null;
}

export function extractApiError(err: unknown, fallback = "Unknown error"): string {
  const response = (err as { response?: { data?: unknown; status?: number } })
    ?.response;
  const fromData = extractFromResponseData(response?.data);
  if (fromData) return fromData;

  if (err instanceof Error && err.message.trim()) {
    return err.message.trim();
  }

  if (response?.status) {
    return `${fallback} (${response.status})`;
  }

  return fallback;
}

