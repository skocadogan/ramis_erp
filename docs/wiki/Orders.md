# Orders (Sipariş Yönetimi)

> **Özet:** Masa ve paket sipariş akışı. Her sipariş kalemine istasyon, porsiyon çarpanı ve Smart Firing zamanlaması atanır. WebSocket ile KDS'e gerçek zamanlı bildirim yapılır. **Smart Firing v2** (opsiyonel): kuyruk buffer’ı, EMA, KDS/POS genişlemeleri — bkz. [[Smart_Firing_v2]].
> **Kütüphaneler:** Django ORM, Django Channels
> **Bağlantılar:** [[Branches]], [[Menu]], [[Sales]], [[Inventory]], [[POS_Display]], [[WebSocket_Architecture]], [[Frontend_POS]], [[Frontend_Tables]], [[Smart_Firing_v2]], [[Recipes]]

---

## Konum
`backend/apps/orders/`

## Modeller

### Order
| Alan | Tip | Açıklama |
|------|-----|----------|
| `branch` | `FK → Branch` | Şube |
| `table` | `FK → Table` | Masa (null = paket siparişi) |
| `takeaway_zone` | `FK → Zone` | Paket bölgesi (`is_takeaway=True`; TABLE siparişlerinde null) |
| `user` | `FK → User` | İşlemi yapan |
| `order_type` | `TextChoices` | TABLE / TAKEAWAY |
| `status` | `TextChoices` | PENDING → PREPARING → READY → DELIVERED → COMPLETED / CANCELLED |
| `total_amount` | `DecimalField(12,4)` | Toplam tutar |
| `discount_amount` | `DecimalField` | İndirim tutarı |
| `discount_type` | `CharField` | ORDER / ITEM |
| `discount_by` | `FK → User` | İndirimi uygulayan |

### OrderItem
| Alan | Tip | Açıklama |
|------|-----|----------|
| `order` | `FK → Order` | Sipariş |
| `product` | `FK → Product` | Ürün |
| `variant` | `FK → ProductVariant` | Varyant |
| `quantity` | `PositiveIntegerField` | Adet |
| `portion_multiplier` | `DecimalField` | Porsiyon çarpanı (birim) |
| `unit_price` | `DecimalField` | Birim fiyat |
| `status` | `TextChoices` | Kalem bazlı durum |
| `scheduled_start_time` | `DateTimeField` | Smart Firing zamanı |
| `firing_forced_at` | `DateTimeField` | Operatör `force-now` (v2); KDS `firing_state` |
| `station` | `FK → KitchenStation` | İstasyon snapshot'ı |
| `parent_item` | `FK → self` | Birleşik ürün ana kalemi |

### ProductStationTimingStats (Smart Firing v2)
Şube × ürün × istasyon için gözlemlenen hazırlık süresi özeti (`ema_minutes`, `sample_count`). Rollup: `rollup_product_station_timing` yönetim komutu / Celery görevi. Detay: [[Smart_Firing_v2]].

### OrderItemModifier
Sipariş kalemine eklenen modifier'lar.

## Sipariş Akışı
```
PENDING → PREPARING → READY → DELIVERED → COMPLETED
                                        ↘ CANCELLED
```

## Smart Firing v1 / v2
- **v1 (her zaman):** Sipariş oluşturma sırasında reçete `prep_time_per_serving + cook_time_per_serving` ile lead time; kalemler ortak bitiş zamanına göre geri yayılır. Reçete yoksa veya süre 0 ise zamanlama yapılmaz (KDS: hemen gönder).
- **v2 (`ENABLE_SMART_FIRING_V2`):** İstasyon kuyruğu buffer’ı, istasyon alanı `smart_firing_extra_buffer_minutes`, isteğe bağlı EMA; API ve KDS/POS davranışları. Ayrıntı: [[Smart_Firing_v2]].
- **Birleşik ürün (parent reçetesiz):** Alt bileşen reçete süreleri **toplanır**; her bileşen kendi istasyonunda ayrı `OrderItem` ve `scheduled_start_time` alır. Parent reçetesi varsa yalnızca parent kalemi oluşur — bkz. `combined_order_items.py`, [[Menu#Birleşik ürün]].

## Services
`services.py` — Sipariş oluşturma, güncelleme, iptal, stok düşüm mantığı ve `force_close` (asılı kalan siparişleri temizleme).

**Masa kapatma (`complete_table`):** Masadaki tüm aktif siparişleri tek istekte tamamlar. İsteğe bağlı `payments[]` ile bölünmüş ödeme desteklenir; tutarlar sipariş tutarlarına orantılı dağıtılır (bkz. [[Sales]]). Tek sipariş tamamlama (`complete_order`) aynı `payments[]` sözleşmesini kullanır.

**Satır kilidi:** `complete_table` siparişleri `select_for_update(nowait=True)` ile kilitler. Tekil `complete_order` / `cancel_order` / `force_close` aynı kilidi `_lock_order_row` ile alır (çağıran nesne `refresh_from_db` ile güncellenir). Kilidi alınamayan istek [[API_Responses]] `ROW_LOCKED` 409. Liste API: `OrderViewSet` / `OrderItemViewSet` varsayılan queryset `is_active=True` (Recycle Bin ayrı endpoint).

**Ödeme sonrası masa durumu:** Başarılı `complete_order` / `complete_table` sonunda `TableService.close_table` yerine **`start_cleaning`** çağrılır; masa `CLEANING` olur ve Celery ETA ile otomatik `FREE`'ye döner ([[Branches]]). Idempotency: masa zaten `FREE` veya `CLEANING` ve aktif sipariş yoksa tekrar istek başarılı kabul edilir.

## WebSocket
Sipariş oluşturulduğunda / durumu değiştiğinde KDS ve POS ekranlarına anlık bildirim.

**Backend yayın:** `apps/orders/ws_broadcast.py`

| Fonksiyon | Kanallar | Not |
|-----------|----------|-----|
| `broadcast_kds_refresh` | `kitchen_notifications_*` + `pos_sync_*` | Tek olay tipi: `orders_updated` (4× `group_send`) |
| `broadcast_kitchen_order_status_changed` | Mutfak + POS sync | Durum geçişi |
| `broadcast_kds_stats` | Yalnız mutfak | OrderItem signal; **2 sn throttle** (`core/ws_throttle.py`) |
| `broadcast_kitchen_stock_low_alert` | Yalnız mutfak | Düşük stok |

**Signal tetikleyiciler:** `apps/orders/signals.py` — her OrderItem kaydında masa snapshot + (throttle'lı) istasyon istatistiği.

Detay: [[WebSocket_Architecture]], [[Frontend_KDS]], [[Frontend_POS]].

## KDS geri çağır

Servise gönderilmiş sipariş kalemlerinin mutfağa geri alınması (POS / garson / mobil iptal akışıyla uyumlu).

| Bileşen | Konum |
|---------|--------|
| Liste API | `GET /orders/main/kds-recall/?station_id=&branch_id=` |
| Geri çağır | `POST /orders/items/{id}/recall/` → kalem `PENDING` (masada yeni sipariş gibi KDS’de görünür) |
| Kalem iptali | `POST /orders/items/{id}/cancel/` (`reason_code`, `reason_text`, `cancel_source`) |
| Sipariş iptali | `POST /orders/main/{id}/cancel/` |

**Akıllı Masa (Smart Table) İptal Akışı:**
Akıllı masa üzerinden gönderilen kalem iptal isteklerinde `cancel_source = "smart_table"` parametresi gönderilir. Backend tarafında istemci rolü `'Smart Table'` veya `'Akıllı Masa'` olarak doğrulanırsa, gerekçe metni otomatik olarak `"Müşteri Smart Table üzerinden iptal etti"` olarak atanır ve central audit trail sisteminde iptal kaynağı olarak kayıt altına alınır.

**Liste kriterleri (`get_kds_recallable_items_qs`):**
- Durum: `READY` veya `DELIVERED` (üst kalem, `parent_item` null)
- `updated_at` son `KDS_RECALL_WINDOW_MINUTES` dakika içinde
- Siparişte `sale` yok; sipariş `COMPLETED` / `CANCELLED` değil
- İstasyon filtresi: `kds_active` ile aynı (`station_id` veya `NULL` ortak kalemler)

**Yetki:** `orders.view_kds` (liste, recall, iptal); istasyon ataması `user_may_kds_line_item_by_assignment`.

**Frontend:** `KdsBottomBand`, `KdsRecallDrawer`, `useKdsRecall` — [[Frontend_KDS]].

## Masa kartı: `pos_occupied_flow`

**OrderItem.status** (üst kalem: `parent_item` boş) siparişin mutfak ve teslim aşamalarını taşır. Şube **masa listesi** (`TableListSerializer`, WebSocket `table_update`) bu kalemlerden türetilen **`pos_occupied_flow`** alanını döner:

| Değer | Koşul (özet) | UI |
|--------|----------------|-----|
| `KITCHEN` | Dolu masada en az bir üst kalem `PENDING`, `PREPARING` veya (görülmemiş) `READY` | POS / [[Frontend_Tables]] — turuncu “bekleyen” |
| `SETTLE` | İlgili üst kalemler teslim/iptal/tamam; **pakette** `READY` + `waiter_acknowledged_at` de SETTLE | Kırmızı (rose) |

Ayrıntı ve serializer: [[Branches]]. POS görünümü: [[Frontend_POS]].
