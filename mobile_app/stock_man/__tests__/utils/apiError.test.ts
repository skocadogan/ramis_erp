import { extractApiError } from "@/utils/apiError";

describe("extractApiError", () => {
  it("returns detail string from axios-like error", () => {
    const err = {
      response: { data: { detail: "Yetkisiz erişim." } },
    };
    expect(extractApiError(err, "fallback")).toBe("Yetkisiz erişim.");
  });

  it("returns field validation messages from DRF", () => {
    const err = {
      response: {
        data: {
          purchase_order_id: ["Seçilen satın alma bu depoya ait değil."],
        },
      },
    };
    expect(extractApiError(err, "fallback")).toBe(
      "purchase order id: Seçilen satın alma bu depoya ait değil."
    );
  });

  it("returns non_field_errors without field prefix", () => {
    const err = {
      response: {
        data: {
          non_field_errors: ["Reddedilen miktar alınan miktarı aşamaz."],
        },
      },
    };
    expect(extractApiError(err, "fallback")).toBe(
      "Reddedilen miktar alınan miktarı aşamaz."
    );
  });

  it("flattens nested item validation errors", () => {
    const err = {
      response: {
        data: {
          items: [
            {},
            { received_quantity: ["Alınan miktar 0'dan büyük olmalı."] },
          ],
        },
      },
    };
    expect(extractApiError(err, "fallback")).toContain("received quantity");
    expect(extractApiError(err, "fallback")).toContain(
      "Alınan miktar 0'dan büyük olmalı."
    );
  });

  it("returns root-level string array", () => {
    const err = {
      response: { data: ["Geçersiz istek."] },
    };
    expect(extractApiError(err, "fallback")).toBe("Geçersiz istek.");
  });

  it("falls back when payload is empty", () => {
    expect(extractApiError({}, "Beklenmeyen hata")).toBe("Beklenmeyen hata");
  });
});
