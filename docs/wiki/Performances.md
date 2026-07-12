# Performances (Performans Yönetimi)

> **Özet:** Garson çağrı geçmişi ve yanıt sürelerinin kaydı ile analitik raporlama modülü. Çağrı/dismiss akışına yan etkisiz (fire-and-forget) log yazar; listeleme, personel özeti, Excel/PDF export sunar.
> **Kütüphaneler:** Django ORM, Django REST Framework, openpyxl, WeasyPrint (via [[Reporting]])
> **Bağlantılar:** [[Branches]], [[Waiter_Call_Dismiss]], [[Branch_Scope]], [[RBAC]], [[Reporting]], [[Frontend_Performances]]

---

## Konum
`backend/apps/performances/`

## Model: WaiterCallLog

Analitik amaçlı kalıcı kayıt; `BaseModel` soft-delete kullanılmaz. PK = çağrı anında üretilen `call_id` (WebSocket payload ile aynı UUID).

| Alan | Tip | Açıklama |
|------|-----|----------|
| `id` | `UUIDField` (PK) | Çağrı kimliği |
| `branch` | `FK → Branch` | Şube |
| `table` | `FK → Table` (nullable) | Masa referansı |
| `table_name`, `zone_name` | `CharField` | Anlık görüntü (masa silinse bile rapor okunur) |
| `source` | `CharField` | Örn. `smart_button` |
| `status` | `TextChoices` | `PENDING` / `DISMISSED` |
| `notified_count` | `PositiveIntegerField` | Bildirilen garson sayısı |
| `called_at` | `DateTimeField` | Çağrı zamanı |
| `dismissed_at` | `DateTimeField` | Görüldü zamanı |
| `dismissed_by` | `FK → User` | Görüldü yapan personel |
| `response_seconds` | `PositiveIntegerField` | `dismissed_at - called_at` (sn) |

**İndeksler:** `(branch, called_at)`, `(branch, status, called_at)`, `(dismissed_by, called_at)`.

## Kayıt Servisi (`services.py`)

Ana çağrı/dismiss akışını **asla bloklamaz**; hatalar loglanır ve yutulur (`_safe` decorator).

| Fonksiyon | Tetikleyici | Davranış |
|-----------|-------------|----------|
| `record_waiter_call()` | Başarılı `POST /call-waiter/` sonrası | `PENDING` satır INSERT |
| `record_waiter_call_dismiss()` | `dismiss_waiter_calls()` sonrası | Bekleyen kayıtları `DISMISSED` yapar; `response_seconds` hesaplar |

Geçersiz UUID içeren `call_id` değerleri sessizce atlanır (geriye dönük uyumluluk).

### Entegrasyon noktaları
- `backend/apps/branches/call_waiter.py` — çağrı başarılı olunca `record_waiter_call()`
- `backend/apps/branches/waiter_call_sync.py` — dismiss yayınından sonra `record_waiter_call_dismiss()`

## API (RBAC: `performances.view_performance`)

Base path: `/api/v1/performances/waiter-calls/`

| Endpoint | Açıklama |
|----------|----------|
| `GET /` | Sayfalı çağrı geçmişi + `totals` |
| `GET /analytics/` | Personel bazlı performans özeti + `totals` |
| `GET /export/excel/` | Excel (max 5000 satır) |
| `GET /export/pdf/` | PDF (max 1000 satır) |

**Ortak query parametreleri:** `branch_id`, `start_date`, `end_date`, `staff_id`, `status` — şube kapsamı [[Branch_Scope]] `branch_filter_qs` ile uygulanır.

**Sayfalama:** `page`, `page_size` (varsayılan 200, max 500).

### Totals alanları (özet)
`total_calls`, `dismissed_calls`, `pending_calls`, `avg_response_seconds`, `median_response_seconds`.

## Selectors & Filtreler

- `query_filters.py` — tarih/şube filtre yardımcıları ([[Sales]] iptaller sekmesi ile aynı kalıp)
- `selectors.py` — `get_waiter_call_logs_queryset`, `aggregate_waiter_call_totals`, `staff_waiter_call_performance`

## Raporlama

[[Reporting]] altyapısı kullanılır:
- `ExcelExportService` — Excel export
- `PDFExportService` + `ReportRenderer` — `templates/reports/waiter_calls_report.html`

## RBAC

`seed_rbac` kategorisi: `performances`
- `performances.view_performance` — listeleme/analitik/export
- `performances.manage_performance` — yönetim (ileride genişletilebilir)

Manager rolüne varsayılan olarak eklenir.

## Test

`backend/apps/performances/tests/test_waiter_call_log.py` — servis, call/dismiss entegrasyonu, API yetki ve export uçları.
