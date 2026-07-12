# Kitchen Closing (Gün Sonu Mutfak Kapanışı)

> **Özet:** Mutfak deposunda gün sonu sayımı yaparak sistemdeki teorik stok ile fiziksel sayımı karşılaştırır; eksik miktarı otomatik fire (WASTE) hareketi olarak kaydeder. Operasyonel arayüz depo modülündeki `kitchen_closing` sekmesindedir; Stock Man mobil uygulamasında henüz ayrı ekran yoktur.
> **Kütüphaneler:** Django ORM, React, TanStack Query
> **Bağlantılar:** [[Warehouse]], [[Inventory]], [[Frontend_Warehouse]], [[Core_Utilities]], [[Frontend_Formatters]], [[Stock_Man_App]]

---

## Konum

| Katman | Yol |
|--------|-----|
| Backend servis | `backend/apps/inventory/services/kitchen_service.py` → `KitchenClosingService` |
| API | `StockMovementViewSet` — `kitchen-closing-items`, `submit-kitchen-closing` |
| Frontend sekme | `frontend/src/features/warehouse/components/KitchenClosingTab.tsx` |
| Not biçimlendirme (UI) | `frontend/src/features/warehouse/utils/kitchenClosingDisplay.ts` |

---

## İş akışı

```
1. Depo seç (öncelik: warehouse_type=KITCHEN)
       ↓
2. GET kitchen-closing-items?warehouse_id=...
   → Bugün hareket gören kalemler + teorik miktar
       ↓
3. Aşçı sayılan miktarları girer (boş bırakılan satır teorik kabul edilir)
       ↓
4. POST submit-kitchen-closing { warehouse_id, items[] }
       ↓
5. Her kalem: fark = teorik − sayılan
   fark > 0 → InventoryService.deduct_stock (WASTE)
   fark ≤ 0 → fire kaydı yok
```

### Liste kapsamı

`get_daily_active_items` yalnızca **bugün (00:00'dan itibaren) stok hareketi olan** kalemleri döndürür. Hareket görmeyen ürünler sayım listesine girmez.

### Fire kaydı metadata

| Alan | Değer |
|------|-------|
| `movement_type` | `WASTE` |
| `reference` | `Gün Sonu Kapanış Sayımı` |
| `notes` | `Teorik: 19, Sayılan: 17, Fire: 2` (okunur biçim; bkz. [[Core_Utilities#5. Miktar Gösterim Biçimlendirme]]) |

---

## API

| Metot | Endpoint | Açıklama |
|-------|----------|----------|
| GET | `/api/v1/inventory/stock-movements/kitchen-closing-items/?warehouse_id=` | Sayım listesi |
| POST | `/api/v1/inventory/stock-movements/submit-kitchen-closing/` | Sayım gönderimi |

**Branch scope:** `user_accessible_warehouse_id_strings` — yetkisiz depo → 403.

**İstek gövdesi (submit):**

```json
{
  "warehouse_id": "uuid",
  "items": [
    { "stock_item_id": "uuid", "counted_quantity": 17 }
  ]
}
```

---

## Miktar gösterimi (EPIC — okunabilirlik)

Stok alanları ORM'de `decimal_places=6` tutulur; ham `str(Decimal)` çıktısı `19.000000` gibi yanıltıcı görünürdü.

| Katman | Çözüm |
|--------|--------|
| Backend (yeni kayıtlar) | `core.quantity_format.format_quantity_display` — gün sonu notları, sayım hareket notları, sayım düzeltmesi referansı |
| Frontend (tüm kayıtlar) | `formatQuantityWithUnit`, `formatKitchenClosingNotes` — geçmiş fire tablosu ve fire raporları |

Eski veritabanı kayıtlarındaki not metni değiştirilmez; UI eski `Teorik: 19.000000` metinlerini `formatKitchenClosingNotes` ile okunur hale getirir.

**Test:** `core/tests/test_quantity_format.py`

---

## Frontend bileşenleri

| Bileşen | Rol |
|---------|-----|
| `KitchenClosingTab` | Depo seçici, sayım tablosu, kaydet, geçmiş fire listesi |
| `useKitchenClosingItems` | Liste sorgusu |
| `useSubmitKitchenClosing` | Gönderim mutation |
| `inventoryApi.getKitchenClosingItems` / `submitKitchenClosing` | REST istemcisi |

Geçmiş paneli: `movement_type=WASTE`, `search=Gün Sonu Kapanış` ile son 50 hareket.

**i18n:** `warehouse.kitchenClosing.*` (`tr` etiket: «Gün Sonu Kapanış»)

---

## İlişkili kavramlar

- **Vardiya kapanışı** — kasa mutabakatı; farklı modül → [[Shifts]]
- **Stok sayımı** — tam sayım belgesi, fark nedenleri ve onay akışı → [[Warehouse]] (`StockCountingService`)
- **Fire raporları** — depo sekmesi `waste_reports`; gün sonu kayıtları burada da görünür
