# Reservations (Rezervasyon Sistemi)

> **Özet:** Masa bazlı müşteri rezervasyon sistemi. Durumlu akış ile bekleyen, onaylanan, oturan ve tamamlanan/iptal edilen rezervasyonlar takip edilir.
> **Kütüphaneler:** Django ORM
> **Bağlantılar:** [[Branches]], [[Users]]

---

## Konum
`backend/apps/reservations/`

## Model: Reservation
| Alan | Tip | Açıklama |
|------|-----|----------|
| `branch` | `FK → Branch` | Şube |
| `table` | `FK → Table` | Masa |
| `customer_name/phone/email` | `CharField` | Müşteri bilgileri |
| `party_size` | `PositiveSmallIntegerField` | Kişi sayısı |
| `scheduled_date/time` | `DateField/TimeField` | Tarih ve saat |
| `duration_minutes` | `PositiveSmallIntegerField` | Süre (varsayılan 120dk) |
| `status` | `TextChoices` | PENDING→CONFIRMED→SEATED→COMPLETED / CANCELLED / NO_SHOW |

## Services
`services.py` — Rezervasyon oluşturma, onaylama, iptal ve çakışma kontrolü.

## Rezervasyon Bildirimleri
Rezervasyon saati geldiğinde ve misafir oturduğunda gerçek zamanlı uyarılar gönderilir. Ayrıntılar: [[Reservation_Alerts]].

### Rezervasyon saati geldi
- Celery Beat her dakika `notify_due_reservations` çalıştırır.
- Onaylı/bekleyen rezervasyonlar için POS ve garson istemcilerine uyarı düşer (`WaiterCallLog.source = reservation_due`).

### Misafir geldi
- `POST .../seat/` veya POS'ta rezerve masayı açma (`TableService.open_table`).
- Bekleyen saati-geldi uyarısı kapanır; `reservation_arrived` yayınlanır.
- Garson mobil uygulama ve POS garson çağrı panelinde görünür ([[Waiter_Call_Dismiss]] altyapısı).

## Misafir Geldi Bildirimi (Guest Arrival) — legacy not
Önceki sürümde yalnızca `send_to_waiters_of_table` kullanılıyordu; güncel akış [[Reservation_Alerts]] ile garson çağrı kanalına taşındı.
