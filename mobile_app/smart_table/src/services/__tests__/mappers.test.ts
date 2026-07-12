import { mapCategory, mapProduct } from "@/services/mappers";
import type { ApiCategory, ApiProduct } from "@/services/mappers";

describe("mappers", () => {
  it("mapCategory uses name_en when present", () => {
    const api: ApiCategory = {
      id: "c1",
      name: "Ana Yemek",
      name_en: "Main Course",
      description: "Desc",
      is_active: true,
      order: 1,
      color: "#000",
      station: null,
      station_name: null,
      parent: null,
      parent_name: null,
      created_at: "",
      updated_at: "",
    };
    const mapped = mapCategory(api);
    expect(mapped.nameEn).toBe("Main Course");
  });

  it("mapProduct maps bilingual fields and units", () => {
    const api: ApiProduct = {
      id: "p1",
      category: "c1",
      category_name: "Ana Yemek",
      category_color: "#000",
      name: "Köfte",
      name_en: "Meatball",
      description: "Lezzetli",
      description_en: "Tasty",
      base_price: "100",
      gross_price: "118",
      tax_rate: "18",
      discount_rate: "0",
      discounted_price: null,
      has_discount: false,
      is_active: true,
      show_on_pos: true,
      is_show_on_menu: true,
      is_featured: false,
      is_popular: true,
      is_chef_recommendation: false,
      is_combined: false,
      image: null,
      order: 1,
      units: [
        {
          id: "u1",
          name: "Porsiyon",
          name_en: "Portion",
          multiplier: "1",
          price_override: null,
          order: 0,
          calculated_price: "100",
        },
      ],
      variants: [],
      modifier_groups: [],
      allergens: [],
      is_allergenic: false,
      availability_mode: "UNLIMITED",
      remaining_portions: null,
      preparation_time: null,
      is_reserved_out: false,
      updated_at: "",
      calories: 420,
    };

    const product = mapProduct(api);
    expect(product.nameEn).toBe("Meatball");
    expect(product.descriptionEn).toBe("Tasty");
    expect(product.units[0].nameEn).toBe("Portion");
    expect(product.nutritionalInfo?.calories).toBe(420);
  });

  it("mapProduct omits nutritionalInfo when calories missing", () => {
    const api: ApiProduct = {
      id: "p2",
      category: "c1",
      category_name: "Ana Yemek",
      category_color: "#000",
      name: "Salata",
      name_en: null,
      description: null,
      description_en: null,
      base_price: "50",
      gross_price: "59",
      tax_rate: "18",
      discount_rate: "0",
      discounted_price: null,
      has_discount: false,
      is_active: true,
      show_on_pos: true,
      is_show_on_menu: true,
      is_featured: false,
      is_popular: false,
      is_chef_recommendation: false,
      is_combined: false,
      image: null,
      order: 1,
      units: [],
      variants: [],
      modifier_groups: [],
      allergens: [],
      is_allergenic: false,
      availability_mode: "UNLIMITED",
      remaining_portions: null,
      preparation_time: null,
      is_reserved_out: false,
      updated_at: "",
      calories: null,
    };

    const product = mapProduct(api);
    expect(product.nutritionalInfo).toBeUndefined();
  });

  it("mapProduct maps recommendations from API", () => {
    const api: ApiProduct = {
      id: "p1",
      category: "c1",
      category_name: "Ana Yemek",
      category_color: "#000",
      name: "Köfte",
      name_en: null,
      description: null,
      description_en: null,
      base_price: "100",
      gross_price: "118",
      tax_rate: "18",
      discount_rate: "0",
      discounted_price: null,
      has_discount: false,
      is_active: true,
      show_on_pos: true,
      is_show_on_menu: true,
      is_featured: false,
      is_popular: false,
      is_chef_recommendation: false,
      is_combined: false,
      image: null,
      order: 1,
      units: [],
      variants: [],
      modifier_groups: [],
      allergens: [],
      is_allergenic: false,
      availability_mode: "UNLIMITED",
      remaining_portions: null,
      preparation_time: null,
      is_reserved_out: false,
      updated_at: "",
      has_recommendations: true,
      recommendations: [
        {
          id: "r1",
          product_id: "p2",
          name: "Ayran",
          base_price: "25",
          has_discount: false,
          discounted_price: null,
          units: [
            {
              id: "u2",
              name: "Bardak",
              name_en: "Glass",
              multiplier: "1",
              price_override: null,
              order: 0,
              calculated_price: "25",
            },
          ],
          product_unit_id: "u2",
          product_unit_name: "Bardak",
          order: 0,
        },
      ],
    };

    const product = mapProduct(api);
    expect(product.hasRecommendations).toBe(true);
    expect(product.recommendations).toHaveLength(1);
    expect(product.recommendations?.[0].productId).toBe("p2");
    expect(product.recommendations?.[0].productUnitId).toBe("u2");
  });

  it("mapProduct maps combined product items", () => {
    const api: ApiProduct = {
      id: "p1",
      category: "c1",
      category_name: "Menu",
      category_color: "#000",
      name: "Karma Tabak",
      name_en: "Combo Plate",
      description: null,
      description_en: null,
      base_price: "100",
      gross_price: "118",
      tax_rate: "18",
      discount_rate: "0",
      discounted_price: null,
      has_discount: false,
      is_active: true,
      show_on_pos: true,
      is_show_on_menu: true,
      is_featured: false,
      is_popular: false,
      is_chef_recommendation: false,
      is_combined: true,
      image: null,
      order: 1,
      units: [],
      combined_items: [
        {
          id: "ci1",
          product: "p-child",
          product_name: "Kofte",
          product_name_en: "Meatball",
          quantity: "2.5000",
          product_unit: "u-child",
          product_unit_name: "Porsiyon",
          product_unit_name_en: "Portion",
        },
      ],
      variants: [],
      modifier_groups: [],
      allergens: [],
      is_allergenic: false,
      availability_mode: "UNLIMITED",
      remaining_portions: null,
      preparation_time: null,
      is_reserved_out: false,
      updated_at: "",
    };

    const product = mapProduct(api);
    expect(product.isCombined).toBe(true);
    expect(product.combinedItems).toHaveLength(1);
    expect(product.combinedItems[0]).toMatchObject({
      id: "ci1",
      productId: "p-child",
      productName: "Kofte",
      productNameEn: "Meatball",
      quantity: 2.5,
      productUnitId: "u-child",
      productUnitName: "Porsiyon",
      productUnitNameEn: "Portion",
    });
  });
});
