# Invoices (Fatura Yönetimi)

> **Özet:** Satış işlemlerine bağlı fatura oluşturma. Otomatik numara, müşteri bilgileri, vergi hesaplama ve Celery tabanlı asenkron PDF üretimi (reportlab).
> **Kütüphaneler:** Django ORM, reportlab, Celery, Redis Cache
> **Bağlantılar:** [[Sales]], [[Branches]], [[Reporting]], [[Async_PDF_Export]], [[Celery_Tasks]]

---

## Konum
`backend/apps/invoices/`

## Model: Invoice
| Alan | Tip | Açıklama |
|------|-----|----------|
| `sale` | `OneToOne → Sale` | Bağlı satış |
| `branch` | `FK → Branch` | Şube |
| `invoice_number` | `CharField(unique)` | Fatura numarası |
| `customer_name/tax_id/address` | `CharField/TextField` | Müşteri bilgileri |
| `subtotal/tax_amount/tax_rate/total_amount` | `DecimalField` | Mali alanlar |
| `pdf_file` | `FileField` | Oluşturulan PDF (async: başlangıçta NULL, Celery tamamlayınca dolar) |

## Services
`services.py` — Fatura oluşturma mantığı. `create_invoice()` artık `transaction.on_commit()` ile Celery `generate_invoice_pdf` task'ini tetikler; PDF request döngüsünde değil, worker'da üretilir.

`tasks.py` — `generate_invoice_pdf(invoice_id)` Celery task'i (retry: 3, queue: `pdf_export`).

## API

| Endpoint | Açıklama |
|---------|----------|
| `POST /invoices/` | Fatura oluştur (PDF async) |
| `GET /invoices/{pk}/download/` | PDF dosyasını indir |
| `POST /invoices/{pk}/retry-pdf/` | **Yeni** — Başarısız PDF'i yeniden oluştur |

## Serializer — pdf_status

`InvoiceSerializer` yeni `pdf_status` alanı döner:

| Değer | Anlam |
|-------|-------|
| `"ready"` | PDF mevcut, `pdf_url` dolu |
| `"pending"` | Fatura yeni oluşturuldu (5dk içinde), Celery henüz PDF'i üretmedi |
| `"failed"` | 5dk geçti, PDF hala yok — frontend "Yeniden oluştur" butonu gösterir |
