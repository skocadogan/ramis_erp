# Branches (Şube Yönetimi)

> **Özet:** Çok şubeli restoran yapısının temelini oluşturan modül. Şube, bölge, masa, mutfak istasyonu tanımları ve personel atamaları (garson, aşçı, müdür) bu modülde yönetilir.
> **Kütüphaneler:** Django ORM, Django Channels (WebSocket)
> **Bağlantılar:** [[Branch_Scope]], [[Users]], [[Menu]], [[Orders]], [[Warehouse]], [[Shifts]], [[POS_Display]], [[WebSocket_Architecture]], [[Frontend_Tables]], [[Frontend_POS]], [[Smart_Firing_v2]]

---

## Konum

`backend/apps/branches/`

## Modeller

### Branch
Temel şube tanımı.

| Alan | Tip | Açıklama |
|------|-----|----------|
| `name` | `CharField` | Şube adı |
| `code` | `CharField(unique)` | Şube kodu |
| `address` | `TextField` | Adres |
| `phone` | `CharField` | Telefon |
| `currency` | `CharField(3)` | Para birimi (varsayılan: TRY) |
| `tax_rate` | `DecimalField` | Vergi oranı (%) |
| `invoice_prefix` | `CharField` | Fatura ön eki |
| `table_cleaning_duration_minutes` | `PositiveSmallIntegerField` | Ödeme sonrası otomatik temizlik süresi (dk, 1–60, varsayılan 5) |
| `email` | `EmailField` | Şube e-posta (mig 0021) |
| `website` | `URLField` | Şube web sitesi (mig 0021) |
| `logo` | `ImageField` | Şube logosu (mig 0021 — [[ReceiptTemplate]] `branch_logo` bloğu ile fişe basılır) |
| `tax_office` | `CharField` | Vergi dairesi (mig 0021) |
| `tax_number` | `CharField` | Vergi numarası (mig 0021) |
| `registry_no` | `CharField` | Ticaret sicil no (mig 0021) |
| `mersis_no` | `CharField` | MERSİS no (mig 0021) |
| `members` | `M2M → User` | Şube üyeleri |

### Zone (Bölge)
Şube içindeki fiziksel alanlar (Teras, Ana Salon vb.)

| Alan | Tip | Açıklama |
|------|-----|----------|
| `branch` | `FK → Branch` | Bağlı şube |
| `name` | `CharField` | Bölge adı |
| `color` | `CharField` | Renk kodu |
| `is_takeaway` | `BooleanField` | Paket sipariş bölgesi mi? |
| `sort_order` | `PositiveIntegerField` | Sıralama |

### Table (Masa)
Fiziksel masa tanımı.

| Alan | Tip | Açıklama |
|------|-----|----------|
| `zone` | `FK → Zone` | Bağlı bölge |
| `name` | `CharField` | Masa adı (T1, B2) |
| `table_number` | `PositiveSmallIntegerField` | Masa numarası |
| `capacity` | `PositiveIntegerField` | Kapasite |
| `size` | `TextChoices` | SMALL / MEDIUM / LARGE / EXTRA_LARGE |
| `shape` | `TextChoices` | ROUND / SQUARE / RECTANGLE |
| `status` | `TextChoices` | FREE / OCCUPIED / RESERVED / **CLEANING** / OUT_OF_SERVICE |
| `cleaning_started_at` | `DateTimeField` | Temizlik başlangıcı (CLEANING iken dolu) |
| `position_x/y` | `PositiveSmallIntegerField` | Düzen koordinatları |
| `reservation_info` | `TextField` | Rezervasyon bilgisi |
| `reservation_scheduled_at` | `DateTimeField` | Planlanan geliş saati |

### KitchenStation (Mutfak İstasyonu)
Fiziksel mutfak istasyonu (Bar, Pastane, Ana Mutfak vb.)

| Alan | Tip | Açıklama |
|------|-----|----------|
| `branch` | `FK → Branch` | Bağlı şube |
| `name` | `CharField` | İstasyon adı |
| `code` | `SlugField` | Kod (bar, pastane) |
| `color` | `CharField` | Renk |
| `warehouse` | `FK → Warehouse` | Bağlı depo |
| `smart_firing_extra_buffer_minutes` | `PositiveSmallIntegerField` | Smart Firing v2: istasyon bazlı ek dakika (kuyruk buffer’ına eklenir; [[Smart_Firing_v2]]) |

**Bağlam:** Ürün kategorileri istasyonlara bağlanarak sipariş kalemleri doğru KDS ekranına yönlendirilir.

### Personel Atamaları

| Model | İlişki | Açıklama |
|-------|--------|----------|
| `WaiterBranchAssignment` | User + Branch + Zones + Tables | Garson hizmet alanı |
| `CookStationAssignment` | User + Branch + Stations | Aşçı istasyon ataması |
| `ManagerBranchAssignment` | User + Branch | Müdür şube yetkisi |

Tüm atamalarda `(user, branch)` çifti tekil olarak kısıtlanmıştır.

## Paket (takeaway) sanal masalar

POS fizik masa tanımı olmadan paket siparişleri yönetir. Selector: `takeaway_virtual_tables_payload()` — `selectors.py`.

| Endpoint | Açıklama |
|----------|----------|
| `GET /api/v1/tables/takeaway_virtual/?branch_id=` | Sanal masa listesi (`TableListSerializer` uyumlu) |

Sanal satır türleri (`virtual_kind`):

| `virtual_kind` | `id` öneki | Açıklama |
|----------------|------------|----------|
| `new_slot` | `tw-new__{zone_id}` | Yeni paket siparişi başlat (`name`: `__NEW_TAKEAWAY_SLOT__`) |
| `takeaway_order` | `tw-ord__{order_id}` | Açık `TAKEAWAY` siparişi (`table` null, PENDING/PREPARING/READY) |

`pos_occupied_flow`: bekleyen mutfak kalemi varsa `KITCHEN`, aksi halde `SETTLE` — POS [[Frontend_POS]] `TableCard` renk mantığı ile hizalı.

RBAC: `takeaway.view_takeaway`, `takeaway.manage_takeaway`. Paket bölgesine toplu masa eklenemez (`TableService.bulk_create_for_zone`).

## WebSocket

| Dosya | Consumer / rota |
|-------|-----------------|
| `consumers.py` | `PosSyncConsumer` → `/ws/pos/sync/` |
| | `StaffNotificationConsumer` → `/ws/staff/notifications/` |
| | `WaiterCallConsumer` → `/ws/waiter/calls/` |
| `routing.py` | URL tanımları |
| `signals.py` | `broadcast_table_change` → `pos_sync_{branch}` + `pos_sync_global` |
| `services.py` | Hedefli `user_notify_{user_id}` bildirimleri |

**PosSyncConsumer:** Masa (`table_update`), vardiya (`shift_event`), sipariş tetikleyicileri (`orders_updated`). Terminal bağlantıları Redis cache `pos_connections_{terminal_id}` ile izlenir — bkz. [[POS_Connected_Users]].

**Personel / garson kanalları** mutfak (`/ws/kitchen/notifications/`) ve POS sync'ten **ayrı** tutulur; yoğun KDS trafiği garson ekranını kilitlemez.

Bkz: [[WebSocket_Architecture]], [[Waiter_Call_Dismiss]].

## Services

- `services.py` — `TableService`: `open_table`, `close_table`, **`start_cleaning`**, **`finish_cleaning`**, rezervasyon ve hizmet dışı geçişleri
- `table_cleaning.py` — Süre clamp (1–60 dk), `cleaning_until` hesabı, Celery ETA planlama/iptal, serializer yardımcıları
- `tasks.py` — `release_table_from_cleaning` (ETA), `sweep_stale_cleaning_tables` (Beat yedek)
- `signals.py` — Otomatik tetiklemeler

### Masa temizlik döngüsü (CLEANING)

Ödeme tamamlandığında (`complete_order` / `complete_table`) masa doğrudan `FREE` olmaz; **`start_cleaning`** ile `CLEANING` durumuna geçer. Şube ayarı `table_cleaning_duration_minutes` kadar sonra Celery **`finish_cleaning`** ile masayı `FREE` yapar.

| Geçiş | Tetikleyici |
|-------|-------------|
| `FREE` → `CLEANING` | Ödeme sonrası otomatik; garson/POS/masa yönetiminden manuel `POST .../start_cleaning/` |
| `CLEANING` → `FREE` | Celery ETA; manuel `POST .../finish_cleaning/` (erken hazır) |
| `CLEANING` → `OUT_OF_SERVICE` | Hizmet dışı; zamanlayıcı iptal edilir |

`open_table` yalnızca `FREE` / `RESERVED` masalarda çalışır; **`CLEANING` masada sipariş açılamaz.**

**API (TableViewSet):**

- `POST /api/tables/{id}/start_cleaning/`
- `POST /api/tables/{id}/finish_cleaning/`

**Serializer alanları:** `cleaning_started_at`, `cleaning_until`, `cleaning_remaining_seconds` — WebSocket `table_update` yükünde de taşınır ([[WebSocket_Architecture]]). Bölge özeti: `cleaning_tables` sayacı.

Bkz. [[Orders]], [[Celery_Tasks]], [[Frontend_Tables]], [[Frontend_POS]], [[Mobile_Waiter_App]].

## Masa listesi API (`pos_occupied_flow`)

`TableListSerializer` (ve WebSocket `table_update` yükü) şu alanı içerir:

| Alan | Değerler | Anlamı |
|------|-----------|--------|
| `pos_occupied_flow` | `null` (masa boş değilken uygulanmaz), `KITCHEN`, `SETTLE` | Sadece `Table.status === OCCUPIED`: üst sipariş kalemlerinde (`parent_item` yok) hâlâ `PENDING` / `PREPARING` / `READY` varsa **`KITCHEN`** (POS/masa yönetiminde turuncu “bekleyen”); tümü mutfak sürecini bitirmişse **`SETTLE`** (hesap/ödeme — kırmızı). |

N+1 önleme: `get_tables_with_active_orders` aktif siparişleri ve üst kalemleri `Prefetch` ile yükler. Detay: `backend/apps/branches/serializers.py` (`compute_pos_occupied_flow`).
