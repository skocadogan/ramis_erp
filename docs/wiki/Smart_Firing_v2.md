# Smart Firing v2 (Mutfak iş yükü & zamanlama)

> **Özet:** Sipariş oluştururken kalemlere atan `scheduled_start_time` mantığını, istasyon kuyruk derinliği ve isteğe bağlı öğrenilmiş süre (EMA) ile genişletir. `ENABLE_SMART_FIRING_V2` kapalıyken davranış v1 ile aynı kalır. KDS’de planlı/gecikmiş görsel ipuçları; POS’ta yoğun mutfak bilgilendirme toast’u; `OrderItem` için operatör `force-now` / `snooze` aksiyonları.
> **Kütüphaneler:** Django ORM, Celery (isteğe bağlı beat), DRF
> **Bağlantılar:** [[Orders]], [[Branches]], [[Recipes]], [[Frontend_KDS]], [[Frontend_POS]], [[WebSocket_Architecture]], [[Celery_Tasks]], [[Django_Settings]]

---

## Özellik bayrağı ve ortam değişkenleri

| Ortam / ayar | Açıklama |
|----------------|----------|
| `ENABLE_SMART_FIRING_V2` | `true` / `1` / `yes` — v2 hesaplamaları ve API genişlemeleri |
| `SMART_FIRING_QUEUE_DEPTH_THRESHOLD` | Kuyruk “yoğun” sayılma eşiği (varsayılan **8** aktif kalem) |
| `SMART_FIRING_BACKLOG_MINUTE_FACTOR` | Eşik üstü her kalem için buffer çarpanı (varsayılan **2** dk) |
| `SMART_FIRING_QUEUE_BUFFER_CAP` | Kuyruktan gelen ek buffer üst sınırı (varsayılan **30** dk) |
| `SMART_FIRING_LEARNED_MIN_SAMPLES` | EMA kullanımı için minimum örnek (varsayılan **5**) |
| `SMART_FIRING_UI_BUSY_THRESHOLD` | POS/mobil kehribar gönder butonu ve sipariş sonrası toast eşiği (varsayılan **15** dk, aralık 1–120) |

Kaynak: `backend/config/settings.py`.

---

## Backend modül yapısı

| Dosya / bileşen | Rol |
|-----------------|-----|
| `apps/orders/smart_firing.py` | Kuyruk metriği, buffer, `effective_lead_minutes`, `resolve_combined_static_lead_minutes`, `effective_combined_lead_minutes`, `compute_firing_state`, POS `kitchen_queue_notice_for_cart` |
| `apps/orders/services/order_core_service.py` | `create_order`: v2 açıkken `effective_lead_minutes` / birleşik menü `effective_combined_lead_minutes`; sipariş nesnesine `_kitchen_queue_notice` |
| `apps/orders/services/combined_order_items.py` | Parent reçetesi yoksa alt kalemlerin istasyon bazlı `scheduled_start_time` hesabı |
| `apps/orders/models.py` | `OrderItem.firing_forced_at`; `ProductStationTimingStats` (şube × ürün × istasyon EMA) |
| `apps/orders/serializers.py` | `kitchen_queue_notice` (sipariş yanıtı); `firing_state`, `queue_hint`, `timing_meta` (kalem, v2 açıkken) |
| `apps/orders/views.py` | `kds_active` context’e `station_queue_metrics`; `OrderItemViewSet`: `firing/force-now/`, `firing/snooze/` |
| `apps/orders/tasks.py` | `roll_up_product_station_timing_stats` → yönetim komutunu çağırır |
| `apps/orders/management/commands/rollup_product_station_timing.py` | Tamamlanmış kalemlerden EMA rollup (idempotent) |
| `apps/recipes/serializers.py` | `RecipeSerializer`: `learned_timing` alanı (istasyon bazlı EMA özeti) |
| `apps/branches/models.py` | `KitchenStation.smart_firing_extra_buffer_minutes` |

---

## Davranış özeti

### Lead time (v2 açık)

1. Statik süre: reçete `prep_time_per_serving + cook_time_per_serving` × miktar (toplam `prep_time_minutes` / `cook_time_minutes` **hesaba katılmaz**).
2. **Öğrenilmiş süre:** `ProductStationTimingStats` yeterli örnekteyse `max(statik, EMA)`.
3. **Kuyruk buffer’ı:** istasyon başına sabit ek (`smart_firing_extra_buffer_minutes`) + eşik üstü aktif kalem sayısına göre monoton ek (cap’li).
4. Aynı sipariş içinde **maksimum** lead, ortak `target_completion_time` üzerinden geri yayılır.
5. **Reçete yok veya porsiyon süresi 0:** lead time **0** → `scheduled_start_time` atanmaz → `firing_state` = `late` (KDS: **HEMEN GÖNDER**).

### Birleşik ürün (menü) zamanlaması

Parent’ın **kendi reçetesi yoksa** (yalnızca KDS istasyon yönlendirmesi için açılan paket menüler):

| Katman | Davranış |
|--------|----------|
| Ana satır lead | Alt bileşenlerin **statik reçete sürelerinin toplamı** (+ v2’de bileşen istasyonlarından **max kuyruk buffer**) |
| Alt bileşen `scheduled_start_time` | Ortak `target_completion_time` − bileşenin kendi statik süresi |
| Reçetesiz bileşen | Zamanlama yok → hemen gönder |
| Parent’ın reçetesi **varsa** | Alt `OrderItem` oluşmaz; yalnızca parent reçete süresi kullanılır (stok çift sayımı önlenir) |

Kaynak: `smart_firing.resolve_combined_static_lead_minutes`, `effective_combined_lead_minutes`; test: `test_combined_order_items.py` (Senaryo 5–6).

### `firing_state` (salt okunur, serializer)

| Değer | Koşul (özet) |
|-------|----------------|
| `scheduled` | `PENDING`, `now` planlı başlangıçtan **>60 sn** önce |
| `due` | `PENDING`, ±60 sn penceresi |
| `late` | `PENDING`, planlı başlangıç **>60 sn** geçmiş **veya** `scheduled_start_time` yok (hemen gönder) |
| `forced_start` | `PREPARING` ve `firing_forced_at` dolu |

### POS bildirimi

`POST /api/v1/orders/main/` yanıtında opsiyonel:

```json
"kitchen_queue_notice": {
  "show": true,
  "extra_minutes": 8,
  "message_key": "kitchen_busy_eta"
}
```

Koşul: sepetteki istasyonların max kuyruk buffer’ı ≥ `SMART_FIRING_UI_BUSY_THRESHOLD` (varsayılan 15 dk).

`POST .../orders/main/check_station_stock/` yanıtında `smart_firing_stats.busy_threshold_minutes` aynı eşiği döner; web POS ve mobil garson kehribar buton kararında bunu kullanır.

### KDS API

- `GET .../orders/main/kds_active/` — serializer context’inde istasyon bazlı `station_queue_metrics` (v2 açıkken).
- `POST .../orders/items/{id}/firing/force-now/` — `PENDING` → `PREPARING`, `scheduled_start_time` şimdi, `firing_forced_at` set.
- `POST .../orders/items/{id}/firing/snooze/` — gövde `{ "minutes": 1..60 }`.
- Yetki (DRF): `orders.manage_order` **veya** `orders.manage_smart_firing` (OR). Ek kural: **`orders.view_kds`** varsa kalemin istasyonunda cook ataması (`user_may_kds_line_item_by_assignment`). Yalnız `orders.manage_smart_firing` olan kullanıcıda `orders.view_kds` yoksa bu uçlar reddedilir; genel sipariş yönetimi için `orders.manage_order` gerekir. Seed rol **Mutfak Personeli**: `orders.manage_smart_firing` atanır.

---

## Frontend

- **KDS:** `OrderCard.tsx` — planlı (amber) / gecikmiş (rose) **üst kenar accent bar** (v2 görsel hiyerarşi); sol accent çizgisi; yoğunluk satırı; overflow menü ile force/snooze (`kdsApi`).
- **POS:** `CartSidebar.tsx` — başarılı sipariş sonrası `kitchen_queue_notice` ile `toast.info`. **Ek olarak:** Sipariş gönderilmeden önce debounced `check_station_stock` ile mutfak yoğunsa (`max_buffer_minutes` ≥ `busy_threshold_minutes`) gönder butonu **amber** renge döner. Eşik backend ortam değişkeni `SMART_FIRING_UI_BUSY_THRESHOLD`.
- **Admin:** `RecipeFormModal.tsx` — zamanlama sekmesinde mutfaktan öğrenilen gerçek (EMA) süreler için tooltip/bilgi rozeti.
- Tipler: `frontend/src/features/kds/types/index.ts`; `frontend/src/features/recipes/types/index.ts`; servis: `features/kds/services/kdsApi.ts`.

---

## Operasyon notları

- Migration’lar: `orders/0013_smart_firing_v2`, `branches/0017_kitchenstation_smart_firing_extra_buffer`.
- EMA rollup: `python manage.py rollup_product_station_timing` veya Celery `apps.orders.tasks.roll_up_product_station_timing_stats` (beat’e manuel eklenir — bkz. [[Celery_Tasks]]).
- Uygulama planı ve UI ilkeleri: `implement_docs/1_12_smart_firing_v2_mutfak_is_yuku_dengeleme_ui_ux_ve_implementasyon.md`.
