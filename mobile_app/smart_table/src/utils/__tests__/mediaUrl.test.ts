import { getMediaOrigin, resolveMediaUrl } from "@/utils/mediaUrl";

const SERVER = "http://192.168.1.50";

describe("mediaUrl", () => {
  it("getMediaOrigin strips /api suffix from server URL", () => {
    expect(getMediaOrigin(`${SERVER}/api/v1`)).toBe(SERVER);
    expect(getMediaOrigin(SERVER)).toBe(SERVER);
  });

  it("resolveMediaUrl converts relative /media path", () => {
    expect(resolveMediaUrl("/media/products/pizza.jpg", SERVER)).toBe(
      `${SERVER}/media/products/pizza.jpg`,
    );
  });

  it("resolveMediaUrl rewrites localhost absolute URLs", () => {
    expect(
      resolveMediaUrl("http://localhost:8000/media/products/pizza.jpg", SERVER),
    ).toBe(`${SERVER}/media/products/pizza.jpg`);
  });

  it("resolveMediaUrl leaves external absolute URLs unchanged", () => {
    const cdn = "https://cdn.example.com/image.jpg";
    expect(resolveMediaUrl(cdn, SERVER)).toBe(cdn);
  });

  it("resolveMediaUrl returns empty string for null/undefined", () => {
    expect(resolveMediaUrl(null, SERVER)).toBe("");
    expect(resolveMediaUrl(undefined, SERVER)).toBe("");
  });
});
