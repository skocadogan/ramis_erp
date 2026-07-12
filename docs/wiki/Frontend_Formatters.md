# Frontend Formatters — Merkezi Biçimlendirme

- **Özet:** Para birimi, miktar, birim çarpanı, tarih ve sayı biçimlendirmesi için merkezi modül. Çoklu locale desteği (tr/en/ar/de/ru), RBAC izin bazlı tutar maskeleme ve otomatik birim dönüşümü (kg↔g, Lt↔ml) sağlar.
- **Kütüphaneler:** Intl API (native), next-intl
- **Bağlantılar:** [[Frontend_Hooks]], [[Frontend_POS]], [[Frontend_Sales]], [[Internationalization]], [[Inventory]]

---

## Fonksiyonlar

### Para Birimi

| Fonksiyon | Açıklama | Örnek (tr) |
|-----------|----------|------------|
| `formatCurrency(value, locale?)` | Tutar, 2 ondalık, sembol ekli | `1234.56` → `"₺1.234,56"` |
| `formatAmount(value, canView)` | **Birincil API** — izin yoksa mask, varsa `formatCurrency` | İzin yok → `"***"` |

**Geriye uyumluluk (deprecated):** `formatCurrencyIfAllowed`, `formatLiraIfAllowed` → `formatAmount` ile aynı; yeni kodda yalnızca `formatAmount` kullanın.

`formatMoney` diye ayrı bir fonksiyon **yoktur** (eski wiki kaydı hatalıydı).

### Tutar Maskeleme

`AMOUNT_DISPLAY_MASK = "***"` — `financial.view_amount` izni olmayan kullanıcılara gösterilir.

### Miktar & Birim

| Fonksiyon | Açıklama | Örnek |
|-----------|----------|-------|
| `formatQuantity(value)` | 2 ondalık miktar | `3.5` → `"3,50"` |
| `formatUnitMultiplier(value)` | 3 ondalık birim çarpanı | `0.001` → `"0,001"` |
| `formatQuantityWithUnit(value, unit)` | Otomatik birim dönüşümlü | `0.003, "kg"` → `"3 g"` |

### Otomatik Birim Dönüşümü

Değer 1'den küçükse büyük birimden küçük birime dönüştürülür:

| Büyük Birim | Küçük Birim | Çarpan |
|-------------|-------------|--------|
| `kg` | `g` | ×1000 |
| `Lt` | `ml` | ×1000 |

### Genel Sayı & Tarih

| Fonksiyon | Açıklama |
|-----------|----------|
| `formatNumber(value, decimals?, locale?)` | Genel sayı biçimlendirmesi |
| `formatDate(date, options?, locale?)` | Locale-uyumlu tarih biçimlendirmesi |
| `paymentMethodLabelTr(code)` | Ödeme yöntemi Türkçe etiket (`CASH`→`"Nakit"`) |

### Locale Çözümleme

```typescript
resolveLocaleTag("tr")  // → "tr-TR"
resolveLocaleTag("en")  // → "en-US"
resolveLocaleTag("ar")  // → "ar-SA"
```

### Convenience Hook

```typescript
const { formatCurrency, formatDate } = useLocalizedFormatters();
// Aktif next-intl locale'ini otomatik kullanır
```

### Depo modülü yardımcıları

| Dosya | Fonksiyon | Açıklama |
|-------|-----------|----------|
| `features/warehouse/utils/kitchenClosingDisplay.ts` | `formatKitchenClosingNotes` | Gün sonu fire notlarındaki `Teorik: 19.000000` gibi ham ondalıkları locale-uyumlu okunur metne çevirir (eski DB kayıtları dahil) |

Depo sekmelerinde ham `quantity` gösterimi yerine `formatQuantity` / `formatQuantityWithUnit` kullanımı: [[Kitchen_Closing]], [[Frontend_Warehouse]] (`KitchenClosingTab`, `WasteReportsTab`, `StockCountingDetailModal`, `ReturnCancelDetailModal`, `PurchaseOrdersTab`).

---

## Kaynak Dosyalar

- [`formatters.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/lib/formatters.ts)
- [`kitchenClosingDisplay.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/features/warehouse/utils/kitchenClosingDisplay.ts)
