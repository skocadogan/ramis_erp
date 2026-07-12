# Printing (Yazıcı Yönetimi)

> **Özet:** ESC/POS termal yazıcı tanımları. Ağ (Ethernet/WiFi) ve USB bağlantı desteği. Mutfak ve POS/kasa kullanım alanları. Asenkron iş kuyruğu (`PrintJob`) + idempotency.
> **Kütüphaneler:** Django ORM, python-escpos, pyusb, Celery, Redis
> **Bağlantılar:** [[Branches]], [[Reporting]], [[ReceiptTemplate]], [[Frontend_POS]], [[Frontend_Tables]], [[Frontend_Sales]]

---

## Konum
- `backend/apps/printing/models.py` — `Printer`, `KitchenStation`, `PrintJob`
- `backend/apps/printing/views.py` — `PrinterViewSet` ve aksiyonlar
- `backend/apps/printing/serializers.py` — doğrulama (NETWORK ↔ USB alan kontrolü)
- `backend/apps/printing/locks.py` — `printer_escpos_lock`
- `backend/apps/printing/tasks.py` — `execute_receipt_print_job` Celery görevi
- `backend/apps/printing/services/escpos_driver.py` — düşük seviyeli ESC/POS driver

---

## Model: Printer

| Alan | Tip | Açıklama |
|------|-----|----------|
| `branch` | `FK → Branch` | Şube |
| `name` | `CharField` | Yazıcı adı |
| `connection_type` | `TextChoices` | `NETWORK` / `USB` |
| `ip_address` / `port` | `GenericIPAddressField` / `Integer` | Ağ ayarları (NETWORK için zorunlu) |
| `device_path` | `CharField` | USB cihaz yolu (USB için zorunlu) |
| `printer_type` | `TextChoices` | `EPSON` / `STAR` / `BIXOLON` / `GENERIC` |
| `usage_type` | `TextChoices` | `KITCHEN` / `POS` |
| `kitchen_station` | `FK → KitchenStation (null)` | **KITCHEN** yazıcıları için zorunlu istasyon |
| `receipt_template_slug` | `SlugField (null)` | **KITCHEN** yazıcılarında kullanılacak fiş şablonu (`ReceiptTemplate.slug`) |
| `paper_width_mm` | `SmallIntegerField` | 58 / 80 (varsayılan 80) |
| `is_active` | `BooleanField` | Soft-delete |
| `last_seen` | `DateTimeField (null)` | Son `sync_status` zamanı |
| `status_info` | `CharField` | Son durum mesajı (örn. `online`, `offline`, `error: timeout`) |

### Serializer kuralları
`PrinterSerializer.validate`:
- `connection_type=NETWORK` ise `ip_address` zorunludur.
- `connection_type=USB` ise `device_path` zorunludur ve `ip_address`/`port` boşaltılır.
- `usage_type=KITCHEN` ise `kitchen_station` ve `receipt_template_slug` zorunludur; istasyon şube ile eşleşmelidir.
- `usage_type=POS` ise `kitchen_station` ve `receipt_template_slug` null yapılır.
- Aksi durumda `ValidationError` döner.

## Model: KitchenStation
Menü kategorileri (`Category.station`) ve mutfak yazıcıları bu istasyona bağlanır. Her **KITCHEN** yazıcısı tek bir `kitchen_station` ile eşleştirilir; sipariş baskısı ürünün kategori istasyonuna göre ilgili yazıcıya yönlendirilir ([[Frontend_POS]]).

## Model: PrintJob

| Alan | Tip | Açıklama |
|------|-----|----------|
| `template` | `FK → ReceiptTemplate` | Hangi şablon |
| `printer` | `FK → Printer` | Hangi yazıcı |
| `context` | `JSONField` | Render bağlamı |
| `status` | `TextChoices` | `PENDING`, `RUNNING`, `COMPLETED`, `FAILED` |
| `idempotency_key` | `CharField (unique, null)` | Çift fiş önleme |
| `attempts` | `PositiveSmallIntegerField` | Yeniden deneme sayacı |
| `last_error` | `TextField` | Hata mesajı |
| `created_at` / `started_at` / `finished_at` | `DateTimeField` | Akış damgaları |

`idempotency_key` benzersizdir; tekrar eden istek aynı `print_job_id`yi döndürür, yeni iş yaratmaz.

---

## Endpoint'ler

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/printing/printers/` | Liste |
| POST | `/printing/printers/` | Oluştur |
| GET/PATCH/DELETE | `/printing/printers/{id}/` | Detay |
| POST | `/printing/printers/{id}/test_print/` | Test sayfası bas (varsayılan POS şablonuyla) |
| POST | `/printing/printers/{id}/sync_status/` | Anlık durum sorgu (TCP/USB ping); `last_seen` ve `status_info` günceller |
| GET | `/printing/kitchen-stations/` | İstasyonlar |
| GET | `/printing/print-jobs/` | İş kuyruğu listesi |

### `test_print`
Varsayılan `POS_RECEIPT` şablonuyla örnek bağlam (`SAMPLE_CONTEXTS["POS_RECEIPT"]`) gönderir. `printer_escpos_lock` altında çalışır.

### `sync_status`
Yazıcı tipine göre TCP soket bağlantısı (NETWORK) veya USB cihaz handle açılışı (USB) deneyerek erişilebilirliği test eder; başarılıysa `status_info="online"` ve `last_seen=now`, aksi durumda hata mesajı yazılır.

---

## `printer_escpos_lock`

`apps.printing.locks.printer_escpos_lock(printer_id, timeout=30)` — context manager.

| Ortam | Mekanizma |
|-------|-----------|
| `DEBUG=True` veya Redis yapılandırılmamış | `threading.Lock` (her process içi yerel) |
| `REDIS_LOCK_URL=redis://...` üretim | `redis.lock.Lock` (cluster-safe, cache DB — broker'dan ayrı) |

ESC/POS bağlantısı tek bir socket/USB handle istediğinden bu kilit zorunludur. `timeout` aşılırsa `LockTimeout` yükselir; çağıran kod `PrintJob.status=FAILED` olarak işaretler.

---

## Asenkron Akış: `print_thermal`

Frontend → `POST /reporting/receipts/{slug}/print_thermal/`
Body: `{ printer_id: int, context?: object, idempotency_key?: string }`

1. Şablon ve yazıcı bulunur (`is_active=True`).
2. `idempotency_key` varsa daha önceki `PrintJob` aranır → varsa aynı `print_job_id` ile `202` döner.
3. Yeni `PrintJob` (status=PENDING) oluşturulur.
4. **`settings.PRINT_THERMAL_SYNC=True`** ise (DEBUG'da varsayılan) — `execute_receipt_print_job.run(job_id)` doğrudan çağrılır:
   - Başarı → `200 OK`, status=`COMPLETED`.
   - Hata → `500`, status=`FAILED`, `last_error` doldurulur.
5. **Üretim (PRINT_THERMAL_SYNC=False)** — `enqueue_print_job` → `execute_receipt_print_job.delay(job_id)` ile Celery **printing** kuyruğuna gönderilir → `202 Accepted`, status=`PENDING`.
6. Celery dispatch hatası → `503`, iş `PENDING` kalır (Beat `maintain_print_job_queue` eski PENDING kayıtları yeniden dener).

### Çok istasyonlu sipariş
Tek sipariş birden fazla istasyon yazıcısına gidebilir; frontend her yazıcı için ayrı `print_thermal` çağrısı yapar. Her çağrı ayrı `PrintJob` + ayrı Celery görevi üretir; **farklı yazıcılar paralel**, **aynı yazıcı seri** (`printer_escpos_lock`) işlenir.

`execute_receipt_print_job(job_id)` adımları:
- `Printer.is_active=True` ve cihaz erişilebilir mi?
- `printer_escpos_lock(printer.id)` altında ESC/POS device aç → `ReceiptRenderer.render_to_escpos(layout, context, device)` → kapat.
- Başarı → `status=COMPLETED`, `finished_at=now`.
- Hata → `attempts += 1`, `last_error` doldurulur, hata türüne göre yeniden denenebilir.

### Permission Matrix
- `printing.view_printer`, `printing.manage_printer` — yazıcı CRUD
- `printing.test_print` — `test_print` aksiyonu
- `printing.direct_print` — `print_thermal` (POS / ödeme akışı)
- `reporting.generate_report` — `print_thermal` (raporlama yetkisi)

---

## Frontend Bağlantısı
- `features/admin/services/adminApi.ts` — `getPrinters`, `testPrint`, `syncPrinterStatus`, `printReceiptThermal`.
- POS sayfası canlı durumu `features/pos/components/PrinterStatusIndicator.tsx` ile gösterir; her 30 saniyede `getPrinters()` ile yenilenir, manuel sync ve test print aksiyonları menüden erişilir.
- Otomatik fiş baskısı [[Frontend_POS]] (sipariş gönderimi) ve [[Frontend_Tables]] (ödeme) akışlarında `printReceiptThermal(slug, printerId, context, idempotencyKey)` ile tetiklenir.
- **Manuel yeniden baskı:** [[Frontend_Tables]] `TableOrderModal` — mutfak fişi (KITCHEN yazıcıları) ve sipariş fişi (POS `paymentPrinters` veya [[Frontend_Sales]] satış detayında anlık yazıcı seçimi). Baskı seçimi `OrderReceiptPrintChoiceDialog` aracılığıyla dokunmatik dostu bir diyalog üzerinden yönetilir. Mutfak yeniden baskılarında iptal edilmeyen tüm kalemler (teslim edilenler — `DELIVERED` dahil) basılır. Geçmiş satış baskısında `date`/`time` sipariş tarihine override edilir (`buildReceiptDateTimeContext`). Idempotency öneki `reprint:{uuid}:…` otomatik baskıdan ayrılır; aynı adisyon tekrar yazdırılabilir.
- Ortak istemci katmanı: `features/pos/lib/dispatchReceiptPrints.ts` (paralel kuyruk + toast), `buildKitchenReprintJobsFromOrders.ts` (istasyon bazlı mutfak işleri; iptal edilmeyen tüm kalemleri — teslim edilenler dahil — kapsar).
