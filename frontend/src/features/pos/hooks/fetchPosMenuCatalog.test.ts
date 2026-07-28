import { beforeEach, describe, expect, it, vi } from "vitest"

const get = vi.fn()

vi.mock("@/lib/api", () => ({
  default: { get },
}))

vi.mock("@/lib/mediaUrl", () => ({
  resolveMediaUrl: (url: string | null | undefined) => url ?? null,
}))

describe("fetchAllPosProducts", () => {
  beforeEach(() => {
    get.mockReset()
  })

  it("next varken sonraki sayfaları birleştirir", async () => {
    get
      .mockResolvedValueOnce({
        data: {
          results: [{ id: "1", name: "A", image: null }],
          next: "http://x?page=2",
        },
      })
      .mockResolvedValueOnce({
        data: {
          results: [{ id: "2", name: "B", image: null }],
          next: null,
        },
      })

    const { fetchAllPosProducts } = await import("./fetchPosMenuCatalog")
    const products = await fetchAllPosProducts("branch-1")

    expect(products.map((p) => p.id)).toEqual(["1", "2"])
    expect(get).toHaveBeenCalledTimes(2)
    expect(get.mock.calls[0][1].params.page).toBe(1)
    expect(get.mock.calls[1][1].params.page).toBe(2)
  })

  it("düz dizi yanıtında tek sayfada biter", async () => {
    get.mockResolvedValueOnce({
      data: [{ id: "1", name: "A", image: null }],
    })

    const { fetchAllPosProducts } = await import("./fetchPosMenuCatalog")
    const products = await fetchAllPosProducts("branch-1")

    expect(products).toHaveLength(1)
    expect(get).toHaveBeenCalledTimes(1)
  })
})
