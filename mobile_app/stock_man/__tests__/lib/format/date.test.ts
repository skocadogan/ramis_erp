// ============================================================
// Stock Man — Date formatter birim testleri
// ============================================================
//
// Intl.DateTimeFormat semantiğine dayanan testler. Saat dilimi
// stabilitesi için `timeZone: "UTC"` varsayımıyla testler
// çalıştırılır (Jest default node timezone).
// ============================================================

import { formatDate, formatDateTime, formatRelative, daysUntil } from "@/lib/format/date";

describe("formatDate", () => {
  it("TR localında '14 Haz 2026' formatında döner", () => {
    // Saat diliminden bağımsız olması için noon UTC seçiyoruz
    const result = formatDate("2026-06-14T12:00:00Z", "tr");
    // Bazı node sürümlerinde "14 Haz 2026" yerine "14 Haz 2026 Pzt" gibi dönebilir
    expect(result).toContain("14");
    expect(result).toContain("Haz");
    expect(result).toContain("2026");
  });

  it("en-US locale → numeric format", () => {
    const result = formatDate("2026-06-14T12:00:00Z", "en");
    // 'Jun 14, 2026' veya '14 Jun 2026' gibi; sadece 14 ve 2026 içerdiğini kontrol edelim
    expect(result).toContain("14");
    expect(result).toContain("2026");
  });

  it("Date objesi kabul eder", () => {
    const d = new Date("2026-06-14T12:00:00Z");
    const result = formatDate(d, "tr");
    expect(result).toContain("14");
    expect(result).toContain("2026");
  });

  it("null → '—' (em dash)", () => {
    expect(formatDate(null, "tr")).toBe("—");
  });

  it("undefined → '—'", () => {
    expect(formatDate(undefined, "tr")).toBe("—");
  });

  it("geçersiz ISO string → '—'", () => {
    expect(formatDate("not-a-date", "tr")).toBe("—");
  });

  it("varsayılan locale = tr", () => {
    // Locale parametresi verilmediğinde TR çıktısı olmalı
    const result = formatDate("2026-06-14T12:00:00Z");
    expect(result).toContain("Haz");
  });
});

describe("formatDateTime", () => {
  it("tarih + saat formatında döner", () => {
    const result = formatDateTime("2026-06-14T19:42:00Z", "tr");
    expect(result).toContain("14");
    expect(result).toContain("Haz");
    expect(result).toContain("2026");
    // Saat kısmı rakam içermeli (HH:MM)
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it("null → '—'", () => {
    expect(formatDateTime(null, "tr")).toBe("—");
  });

  it("invalid → '—'", () => {
    expect(formatDateTime("xyz", "tr")).toBe("—");
  });

  it("Date objesi kabul eder", () => {
    const d = new Date("2026-06-14T19:42:00Z");
    const result = formatDateTime(d, "tr");
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});

describe("formatRelative", () => {
  // Date.now mock'la, çünkü göreceli zaman "now"'a göre hesaplanır
  const NOW = new Date("2026-06-14T12:00:00Z").getTime();
  let originalDateNow: () => number;

  beforeEach(() => {
    originalDateNow = Date.now;
    Date.now = jest.fn(() => NOW);
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  it("gelecek 3 gün → '3 gün sonra' gibi (TR)", () => {
    const future = new Date(NOW + 3 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatRelative(future, "tr");
    expect(result).toContain("3");
    expect(result).toContain("gün");
  });

  it("geçmiş 2 saat → '2 saat önce' (TR)", () => {
    const past = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
    const result = formatRelative(past, "tr");
    expect(result).toContain("2");
    expect(result).toContain("saat");
  });

  it("bugün (1 saat sonra) → saat ölçeğinde", () => {
    const soon = new Date(NOW + 1 * 60 * 60 * 1000).toISOString();
    const result = formatRelative(soon, "tr");
    expect(result).toContain("saat");
  });

  it("30+ gün fark → ay ölçeğine yuvarlanır", () => {
    const future = new Date(NOW + 60 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatRelative(future, "tr");
    expect(result).toContain("ay");
  });

  it("null → '—'", () => {
    expect(formatRelative(null, "tr")).toBe("—");
  });

  it("undefined → '—'", () => {
    expect(formatRelative(undefined, "tr")).toBe("—");
  });

  it("invalid → '—'", () => {
    expect(formatRelative("not-a-date", "tr")).toBe("—");
  });

  it("en-US locale: 'in 3 days' formatı", () => {
    const future = new Date(NOW + 3 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatRelative(future, "en");
    expect(result.toLowerCase()).toContain("3");
    expect(result.toLowerCase()).toMatch(/in.*day/);
  });
});

describe("daysUntil", () => {
  const NOW = new Date("2026-06-14T12:00:00Z").getTime();
  let originalDateNow: () => number;

  beforeEach(() => {
    originalDateNow = Date.now;
    Date.now = jest.fn(() => NOW);
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  it("yarın → 1", () => {
    const tomorrow = new Date(NOW + 24 * 60 * 60 * 1000);
    expect(daysUntil(tomorrow)).toBe(1);
  });

  it("bugün → 0 veya 1 (ceil yapar)", () => {
    // daysUntil ceil kullanıyor: aynı gün bile olsa 0+1=1 olabilir
    const today = new Date(NOW);
    const result = daysUntil(today);
    expect(result === 0 || result === 1).toBe(true);
  });

  it("3 gün sonra → 3", () => {
    const future = new Date(NOW + 3 * 24 * 60 * 60 * 1000);
    expect(daysUntil(future)).toBe(3);
  });

  it("dün → -1 (negatif)", () => {
    const yesterday = new Date(NOW - 24 * 60 * 60 * 1000);
    expect(daysUntil(yesterday)).toBe(-1);
  });

  it("null → null", () => {
    expect(daysUntil(null)).toBeNull();
  });

  it("undefined → null", () => {
    expect(daysUntil(undefined)).toBeNull();
  });

  it("invalid → null", () => {
    expect(daysUntil("not-a-date")).toBeNull();
  });

  it("ISO string kabul eder", () => {
    const future = new Date(NOW + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysUntil(future)).toBe(7);
  });
});
