# Stok İptal ve İade (Depo)

> **Özet:** Depodaki stok kalemlerinin tedarikçiye iadesi veya neden belirterek iptali için stok hareketi tabanlı operasyon modülüdür. `RETURN` ve `CANCEL` hareket tipleri stok düşümü yapar; kayıtlar soft-delete ile geri alınabilir.
> **Kütüphaneler:** Django ORM, DRF, TanStack Query, TanStack Virtual, next-intl
> **Bağlantılar:** [[Inventory]], [[Warehouse]], [[Frontend_Warehouse]], [[Stock_Man_App]], [[RBAC]], [[Reporting]], [[Frontend_KDS]], [[BaseModel]]

---

## Konum

| Katman | Yol |
|--------|-----|
| Backend modeller | `backend/apps/inventory/models.py` — `StockMovementType.RETURN`, `CANCEL` |
| Servisler | `backend/apps/inventory/services/stock_movement_service.py` — `return_stock`, `cancel_stock` |
| İade/iptal servisi | `backend/apps/inventory/services/return_cancel_service.py` — `ReturnCancelService` (birim fiyat, PO doğrulama) |
| Akış servisi | `backend/apps/inventory/services/return_disposal_flow_service.py` |
| SKT otomatik aksiyon | `backend/apps/inventory/services/expiry_return_cancel_service.py` — `ExpiryReturnCancelService` |
| Neden kodları | `backend/apps/inventory/return_cancel_reasons.py` |
| API | `StockMovementViewSet` — filtre, oluşturma, soft-delete, Excel export |
| KDS API | `KitchenStationViewSet.record_return_cancel` |
| Frontend sekme | `frontend/src/features/warehouse/components/ReturnCancelReportsTab.tsx` |
| Mobil (Stock Man) | `mobile_app/stock_man/app/(main)/return-cancel/`, `src/components/return-cancel/`, `src/services/returnCancelService.ts` |
| Çeviriler | `frontend/src/i18n/messages/*/warehouse_return_cancel.json`, `mobile_app/stock_man/src/i18n/*.json` (`returnCancel.*`) |

## Stok Hareket Tipleri

| Tip | Anlam | Stok Etkisi |
|-----|-------|-------------|
| `RETURN` | Tedarikçiye / müşteri iadesi | Depodan düşer |
| `CANCEL` | Sipariş iptali, SKT geçmiş stok iptali vb. | Depodan düşer |
| `DISPOSAL` | İmha (SKT geçmiş — ayrı akış) | Depodan düşer |

`WASTE` (Fire/Zayi) ayrı sekmede kalır; KDS modalında üç mod bir arada: Fire/Zayi, İade, İptal.

## RBAC

| Kod | Açıklama |
|-----|----------|
| `inventory.view_return_cancel` | Liste, filtre, PDF/Excel export |
| `inventory.manage_return_cancel` | Kayıt oluşturma, soft-delete |
| `inventory.view_returndisposalflow` | İade/İmha akışı (satış entegrasyonu) |
| `inventory.manage_returndisposalflow` | Akış yönetimi |
| `branches.add_kds_return_cancel` | KDS üzerinden iade/iptal girişi |

**Şube Müdürü** rolüne tüm `inventory.*return*` ve `branches.add_kds_return_cancel` izinleri seed ile verilir.

## API

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/api/v1/inventory/stock-movements/` | GET | `movement_types=RETURN,CANCEL`, tarih, depo, neden, tedarikçi filtreleri |
| `/api/v1/inventory/stock-movements/` | POST | `movement_type`: RETURN veya CANCEL |
| `/api/v1/inventory/stock-movements/{id}/` | DELETE | Soft-delete + stok geri yükleme |
| `/api/v1/inventory/stock-movements/reason-codes/` | GET | Neden kodu listesi |
| `/api/v1/inventory/stock-movements/export/excel/` | GET | Excel export |
| `/api/v1/stations/{id}/record-return-cancel/` | POST | KDS iade/iptal |

## Frontend

- **Sekme:** `/warehouse?tab=return_cancel_reports`
- **Nav:** `WarehouseModuleNav` — `return_cancel_reports` (RotateCcw ikon)
- **Tablo:** `ReturnCancelTable` — sanallaştırma + infinite scroll (Sales modülü deseni)
- **Mobil:** [[Stock_Man_App]] — `(tabs)/return-cancel`, `ReturnCancelFilterBar`, `ReturnCancelTable`, `return-cancel/new`
- **Raporlama:** PDF → `stock-movement-list` modül raporu; Excel → dedicated export endpoint

## Soft Delete

`InventoryService.delete_movement()` stok miktarını geri yükler, ardından `BaseModel.delete()` ile `is_active=False` yapar. Listeleme `is_active=True` filtreler.

## ReturnDisposalFlow

Satış iadesi ve çok adımlı akışlar için `ReturnDisposalFlow` modeli kullanılır. `complete` aksiyonu onaylı akış kalemleri için ilgili stok hareketini oluşturur.

## ReturnCancelService — Birim Fiyat ve PO Doğrulama

`services/return_cancel_service.py` içindeki `ReturnCancelService`, `StockMovementCreateSerializer` ile birlikte çalışır:

- **Birim fiyat çözümü:** RETURN/CANCEL hareketlerinde `unit_price` verilmezse stok kaleminin geçmiş giriş hareketlerinden (IN) ağırlıklı ortalama maliyet hesaplanır.
- **PO doğrulama:** RETURN veya CANCEL tipi hareketlerde `purchase_order` alanı zorunlu kılınabilir (serializer-level validation).
- `StockMovementViewSet`, hareket oluştururken birim fiyat hesaplamasını bu servis üzerinden devreye sokar.

## SKT Otomatik İade/İptal

[[Inventory]] — `ExpiryWarningViewSet.auto_return_cancel` aksiyonu ile SKT geçmiş lot için doğrudan bu modülün RETURN/CANCEL hareketi oluşturulur. Ayrıntılar [[Inventory]] sayfasında.

## Tarih Filtreleme

`get_stock_movements` selektörü `start_date` / `end_date` parametrelerini ISO formatında doğrular; geçersiz tarih string'i hata yerine sessizce yoksayılır. `StockItemSelect` bileşeni depo ID değiştiğinde arama durumunu sıfırlar (kullanıcı deneyimi iyileştirmesi).
