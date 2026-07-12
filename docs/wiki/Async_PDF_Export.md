# Async PDF Export (Asenkron PDF Dışa Aktarım)

> **Özet:** Modül raporları ve fatura PDF'lerini Celery kuyruğunda asenkron üreten sistem. Gunicorn worker blokajını sıfırlar; kullanıcı anında "hazırlanıyor" yanıtı alır, PDF hazır olunca indirir.
> **Kütüphaneler:** Celery, Redis Cache, WeasyPrint, reportlab
> **Bağlantılar:** [[Reporting]], [[Invoices]], [[Celery_Tasks]], [[Celery_Beat_Sync]], [[Deployment]]

---

## Konum

| Katman | Dosya | Açıklama |
|--------|-------|----------|
| **Async servis** | `backend/apps/reporting/async_service.py` | Cache tabanlı polling flow: `enqueue_pdf_export()`, `get_pdf_export_status()` |
| **Celery task** | `backend/apps/reporting/tasks.py` | `generate_report_pdf_async` — modül raporu PDF üretimi (retry, hata yönetimi) |
| **Celery task** | `backend/apps/invoices/tasks.py` | `generate_invoice_pdf` — fatura PDF üretimi |
| **ViewSet** | `backend/apps/reporting/module_views.py` | `ModuleReportViewSet.generate()` — `?async=true` desteği + `export_status()` polling endpoint |
| **Frontend** | `frontend/src/lib/pdfExport.ts` | `fetchAsyncPdf()` — polling helper (2sn interval, 10dk timeout) |
| **Frontend** | `frontend/src/components/AsyncPdfExportButton.tsx` | Reusable buton (loading → polling → download/retry) |

---

## Mimari

```
Kullanıcı "PDF İndir" tıklar
  │
  ├─ Frontend: AsyncPdfExportButton → fetchAsyncPdf()
  │     POST /reporting/module-reports/{slug}/generate/?async=true
  │
  ├─ Backend: ModuleReportViewSet.generate()
  │     enqueue_pdf_export() → cache'e {status: "processing"} yazar
  │     → generate_report_pdf_async.delay() → pdf_export kuyruğuna atar
  │     → 202 {task_id, cache_key, status: "processing"}
  │
  ├─ Celery Worker (ramis-worker-pdf):
  │     WeasyPrint ile HTML → PDF üretir
  │     → cache'e {status: "completed", download_url, filename} yazar
  │
  └─ Frontend: 2 saniyede bir GET /export-status/?cache_key=...
        → "completed" gelince downloadBlob() ile indirir
```

**Neden cache, Celery result backend değil?** `CELERY_TASK_IGNORE_RESULT=True` olduğu için `AsyncResult.get()` kullanılamaz. Redis cache polling ile aynı işlev sağlanır.

---

## API Endpoint'leri

| Endpoint | Açıklama |
|---------|----------|
| `POST /reporting/module-reports/{slug}/generate/?async=true` | Asenkron PDF talebi → `202 {task_id, cache_key, status}` |
| `POST /reporting/module-reports/{slug}/generate/?async=false` | Senkron PDF (mevcut davranış, default) |
| `GET /reporting/module-reports/export-status/?cache_key=...` | PDF durum sorgulama |

### Yanıt formatları

**Async başlatma (202):**
```json
{"task_id": "abc123", "cache_key": "pdf:export:user_id:slug:hash", "status": "processing"}
```

**Polling — işleniyor:**
```json
{"status": "processing"}
```

**Polling — tamamlandı:**
```json
{"status": "completed", "download_url": "data:application/pdf;base64,...", "filename": "sales-list.pdf", "size_bytes": 245760}
```

**Polling — hata:**
```json
{"status": "failed", "error": "...", "retry_allowed": false}
```

**Polling — cache expire:**
```json
{"status": "not_found"}
```

---

## Fatura PDF (Invoice)

Fatura oluşturma akışı değişti:

**Önce:** `InvoiceService.create_invoice()` → `_build_pdf_bytes()` → `inv.pdf_file.save()` (senkron, request döngüsünde)

**Şimdi:** `InvoiceService.create_invoice()` → `Invoice.objects.create()` → `transaction.on_commit(lambda: generate_invoice_pdf.delay(id))`

`InvoiceSerializer` yeni `pdf_status` alanı döner:

| Değer | Anlam |
|-------|-------|
| `"ready"` | PDF mevcut, `pdf_url` dolu |
| `"pending"` | Fatura yeni (5dk içinde), PDF henüz üretilmedi |
| `"failed"` | 5dk geçti, PDF hala yok → "Yeniden oluştur" butonu gösterilir |

---

## Celery Kuyruğu

| Servis | Kuyruk | Concurrency | Görev |
|--------|--------|-------------|-------|
| `ramis-worker-pdf.service` | `pdf_export` | 2 (`CELERY_PDF_EXPORT_WORKER_CONCURRENCY`) | `generate_report_pdf_async`, `generate_invoice_pdf` |

WeasyPrint CPU yoğun olduğu için concurrency 2-4 arası önerilir. `--max-tasks-per-child=20` ile worker bellek sızıntısı önlenir.

---

## Ortam Değişkenleri

| Anahtar | Varsayılan | Açıklama |
|---------|-----------|----------|
| `PDF_EXPORT_ASYNC_ENABLED` | `true` | `false` yapılırsa tüm PDF'ler eski senkron modda çalışır |
| `PDF_EXPORT_CACHE_TTL` | `600` | Async PDF sonucunun cache'te kalma süresi (sn). Bu sürede indirilmeyen PDF expire olur |
| `PDF_EXPORT_CACHE_MAX_BYTES` | `20971520` (20MB) | Bu boyutun üstündeki PDF'ler cache yerine `MEDIA_ROOT/reports/` altına dosya olarak yazılır |
| `CELERY_PDF_EXPORT_WORKER_CONCURRENCY` | `2` | `ramis-worker-pdf.service` eşzamanlı iş sayısı |

---

## Frontend

`AsyncPdfExportButton` 18 modül raporu bileşenine entegre edildi. Props:

| Prop | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| `reportSlug` | `string` | ✅ | Modül raporu slug'ı (örn: `"sales-list"`) |
| `params` | `Record<string, unknown>` | ❌ | Rapor parametreleri |
| `filename` | `string` | ❌ | İndirilen dosya adı |
| `variant` | `"default" \| "outline" \| "ghost"` | ❌ | Buton stili |
| `size` | `"default" \| "sm" \| "lg" \| "icon"` | ❌ | Buton boyutu |

Buton 4 durum gösterir: **idle** (Download ikonu) → **processing** (Loader2 spinner, "PDF hazırlanıyor...") → **completed** (otomatik indirme) → **failed** (RefreshCw ikonu, "Tekrar dene").

Direkt view PDF'ler (`sales/export/pdf/`, `customers/export/pdf/` vb.) henüz async desteğine sahip değil — backend'de `direct:` prefix ile Phase 3'te eklenecek.

---

## ⚠️ Sınırlamalar

1. **Celery worker olmadan çalışmaz** — `ramis-worker-pdf.service` çalışmıyorsa task'ler kuyrukta birikir, PDF üretilmez
2. **Cache TTL 600sn** — kullanıcı 10 dakika içinde indirmezse "PDF export expired" hatası alır
3. **Direkt view PDF'ler henüz async değil** — sadece modül raporları ve fatura async
4. **Büyük PDF'ler (>20MB)** cache yerine dosyaya yazılır → download URL'si `MEDIA_URL` üzerinden sunulur

---

## 🔧 Celery Worker'da Request Stub

Rapor sınıfları (`BaseModuleReport`) `self.request.user` ve `self.request.LANGUAGE_CODE` üzerinden kullanıcı bağlamına erişir. Celery worker'da gerçek bir HTTP request olmadığı için `_build_pdf()` bir **request stub** oluşturur:

```python
from types import SimpleNamespace
User = get_user_model()
user = User.objects.get(id=user_id)
stub_request = SimpleNamespace(user=user, LANGUAGE_CODE=language, query_params={})
report_instance = report_class(request=stub_request, **clean_params)
```

Bu sayede rapor sınıfları `self.request.user` ile şube kapsamı (`Branch_Scope`), depo erişimi (`user_accessible_warehouse_id_strings`) gibi kontrolleri sorunsuz yapar.

Ayrıca frontend'den gelen `null`/`""` parametreler `_build_pdf` içinde temizlenir — rapor sınıflarına sadece anlamlı değerler iletilir.

## RBAC İzinleri

| Action | İzin Kodu |
|--------|----------|
| `list` | `reporting.view_report_template` |
| `generate` | `reporting.generate_report` |
| `export_status` | `reporting.generate_report` (generate ile aynı — rapor üretebilen durumunu da sorgulayabilir) |
