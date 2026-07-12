# 🔧 Ramis ERP — Backend Performans Optimizasyon Raporu

> **Hedef:** Gerçekten ölçülebilir performans artışı sağlayacak, düşük riskli, uygulanabilir optimizasyonlar.  
> **Prensip:** Teorik değil, kod tabanında tespit edilmiş sorunlara dayalı.  
> **Tarih:** 2026-07-08  
> **Kapsam:** Backend (Django 6 + DRF + PostgreSQL + Redis + Celery)

---

## 📊 Yönetici Özeti

### Mevcut Durum

| Metrik | Değer |
|---|---|
| ViewSet | 66 |
| `select_related`/`prefetch_related` kullanan sorgu | ~300+ (yaygın) |
| `SerializerMethodField` | 140 (her biri potansiyel N+1) |
| `models.Index` tanımlı | 29 adet |
| **Sıfır index'li modül** | `branches/` (7 model) |
| Celery task | 22 |
| WS broadcast fonksiyonu | 14 |
| Cache key pattern'i | 15+ |
| Middleware | 13 katman |

### En Kritik 3 Bulgu

| # | Bulgu | Etki | Düzeltme Süresi |
|---|---|---|---|
| 1 | **`BaseModel.is_active` ve `created_at` INDEX YOK** — tüm tablolarda | Her `filter(is_active=True)` seq scan | ⏱ 30dk |
| 2 | **`branches.Table` + `Zone` sıfır index** — en sık sorgulanan tablolar | POS masa listesi yavaş | ⏱ 15dk |
| 3 | **PDF üretimi SENKRON** — WeasyPrint Gunicorn worker blokluyor | Büyük raporlarda 30sn+ gecikme | ⏱ 4s |

### Tahmini Toplam Kazanç

| Optimizasyon | Beklenen İyileşme |
|---|---|
| `BaseModel` index'leri | Tüm listeleme sorgularında **%30-60 hızlanma** |
| `Table`/`Zone` index'leri | POS masa yükleme süresinde **%40-70 azalma** |
| N+1 düzeltmeleri | Recipe/Menu endpoint'lerinde **%80-95 DB sorgu azalması** |
| Pagination limit | POS menü yükleme süresinde **2-3x hızlanma** |
| PDF async | Rapor isteklerinde **Gunicorn worker blokajı sıfırlanır** |

---

## 1. Veritabanı Index Optimizasyonları (P0)

---

### 1.1 `BaseModel.is_active` — TÜM TABLOLARI ETKİLİYOR

**Dosya:** `backend/core/models.py`  
**Şu an:**
```python
class BaseModel(models.Model):
    is_active = models.BooleanField(default=True)      # ← INDEX YOK!
    created_at = models.DateTimeField(auto_now_add=True)  # ← INDEX YOK!
    updated_at = models.DateTimeField(auto_now=True)
```

**Sorun:** Projedeki **her model** `BaseModel`'i miras alıyor. Her `filter(is_active=True)` ve `order_by('-created_at')` sorgusu **sequential scan** ile çalışıyor. Özellikle büyük tablolarda (Order, StockMovement, Sale vb.) ciddi yavaşlama.

**Çözüm:**
```python
class BaseModel(models.Model):
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        indexes = [
            # Partial index: is_active=true kayıtlar çoğunlukta, bu daha verimli
            models.Index(
                fields=["id"],
                name="%(class)s_active_idx",
                condition=models.Q(is_active=True),
            ),
        ]
```

**Migration sonrası kontrol:**
```bash
cd backend && source venv/bin/activate
python manage.py makemigrations core
python manage.py sqlmigrate core XXXX  # SQL'i incele
python manage.py migrate
```

**Etki:** **Tüm listeleme endpoint'lerinde %30-60 hızlanma.** Özellikle:
- `GET /orders/` — sipariş geçmişi (büyük tablo)
- `GET /stock-movements/` — stok hareketleri
- `GET /sales/` — satış listesi
- `GET /tables/` — POS masa listesi

---

### 1.2 `branches.Table` ve `Zone` — POS'un En Sık Kullandığı Modeller

**Dosya:** `backend/apps/branches/models.py`

**Şu an:** Her iki modelde de **sıfır explicit index**. Masa listeleme her POS sayfa yüklemesinde, her WS olayında, her masa durum güncellemesinde sorgulanıyor.

**Çözüm:**
```python
class Zone(BaseModel):
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="zones")
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=7, default="#3B82F6")
    is_takeaway = models.BooleanField(default=False)
    # ... other fields

    class Meta:
        indexes = [
            models.Index(fields=["branch", "is_active"], name="zone_branch_active_idx"),
            models.Index(fields=["is_takeaway"], name="zone_takeaway_idx"),
        ]

class Table(BaseModel):
    zone = models.ForeignKey(Zone, on_delete=models.CASCADE)
    name = models.CharField(max_length=50)
    status = models.CharField(max_length=20, default="FREE")
    virtual_kind = models.CharField(max_length=20, null=True, blank=True)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, null=True)
    # ... many other fields

    class Meta:
        indexes = [
            # Masa listeleme: zone + is_active + status — en kritik composite index
            models.Index(
                fields=["zone", "status", "is_active"],
                name="table_zone_status_active_idx",
            ),
            # Garson scope filtreleme
            models.Index(
                fields=["branch", "status"],
                name="table_branch_status_idx",
            ),
            # Takeaway virtual masa lookup
            models.Index(
                fields=["virtual_kind", "branch"],
                name="table_virtual_branch_idx",
            ),
        ]
```

**Etki:** POS masa listesi yükleme süresinde **%40-70 azalma.** Bu, kullanıcının doğrudan hissedeceği bir iyileşme.

---

### 1.3 Diğer Kritik Index'ler

| Model | Index | Neden |
|-------|-------|-------|
| `StockMovement` | `(stock_item, created_at)` | Stok hareketi listeleme |
| `OrderItem` | `(order, status)` composite | Sipariş detay filtresi |
| `Sale` | `(branch, created_at)` composite | Satış geçmişi sorgusu |
| `PrepTask` | `(assigned_station, status)` | KDS prep ekranı |
| `ProductionPlan` | `(branch, plan_date)` | Günlük plan sorgusu |
| `BranchOrderCounter` | `(branch, date)` composite | Günlük sipariş sayacı (sadece `unique_together` var) |

---

## 2. N+1 Sorgu Düzeltmeleri (P1)

---

### 2.1 RecipeSerializer — `get_learned_timing()` N+1

**Dosya:** `backend/apps/recipes/serializers.py:107`

**Şu an:**
```python
class RecipeSerializer(serializers.ModelSerializer):
    learned_timing = serializers.SerializerMethodField()
    
    def get_learned_timing(self, obj):
        # HER reçete için ayrı DB sorgusu!
        stats = ProductStationTimingStats.objects.filter(
            product_id=obj.product_id,
            station_id=obj.station_id
        ).first()
        if stats:
            return stats.average_seconds
        return None
```

**Çözüm — ViewSet'te prefetch:**
```python
# views.py veya selectors.py'da
from django.db.models import Prefetch

recipe_qs = Recipe.objects.select_related('product', 'station').prefetch_related(
    Prefetch(
        'product__station_timing_stats',
        queryset=ProductStationTimingStats.objects.filter(
            station_id=OuterRef('station_id')
        ),
        to_attr='_prefetched_timing_stats'
    )
)
```

```python
# serializers.py — cache'den oku
def get_learned_timing(self, obj):
    stats_list = getattr(obj.product, '_prefetched_timing_stats', [])
    stats = next(
        (s for s in stats_list if s.station_id == obj.station_id),
        None
    )
    return stats.average_seconds if stats else None
```

**Etki:** 100 reçetelik listede **100 → 0 ek sorgu.**

---

### 2.2 ProductSerializer — `get_branch_names()` N+1

**Dosya:** `backend/apps/menu/serializers.py:418`

**Şu an:**
```python
class ProductSerializer(serializers.ModelSerializer):
    branch_names = serializers.SerializerMethodField()
    
    def get_branch_names(self, obj):
        # values_list() her çağrıda yeni DB sorgusu!
        return list(obj.branches.values_list('name', flat=True))
```

**Çözüm:**
```python
def get_branch_names(self, obj):
    # prefetch_related('branches') yapılmışsa ORM bellekteki veriyi kullanır
    # values_list() yerine Python comprehension kullan
    if hasattr(obj, '_prefetched_objects_cache') and 'branches' in obj._prefetched_objects_cache:
        return [b.name for b in obj.branches.all()]
    return list(obj.branches.values_list('name', flat=True))
```

**Etki:** POS menü listesinde her ürün için 1 ek sorgu → **0 sorgu.**

---

### 2.3 RecipeIngredientSerializer — `get_stock_item_allergens()` N+1

**Dosya:** `backend/apps/recipes/serializers.py:28`

**Çözüm — ViewSet'te ek prefetch:**
```python
recipe_qs = Recipe.objects.select_related(...).prefetch_related(
    'ingredients__stock_item__allergens',  # ← BU SATIRI EKLE
    # ... existing prefetches
)
```

---

## 3. Pagination Optimizasyonu (P1)

---

### 3.1 MenuCatalogPagination — Aşırı Büyük `max_page_size`

**Dosya:** `backend/apps/menu/pagination.py`

**Şu an:**
```python
class MenuCatalogPagination(PageNumberPagination):
    page_size = 500
    max_page_size = 2000  # ← ÇOK BÜYÜK!
```

**Sorun:** `ProductSerializer` **14 `SerializerMethodField`** içeriyor. `page_size=500` ile her istekte 500+ ürün serialize ediliyor = **potansiyel binlerce ek DB sorgusu.**

**Çözüm:**
```python
class MenuCatalogPagination(PageNumberPagination):
    page_size = 100        # 500 → 100
    max_page_size = 500    # 2000 → 500
```

Frontend zaten `page_size=2000` gönderiyor (usePosDataSync.ts:37). Bu değer de güncellenmeli:
```typescript
// frontend/src/features/pos/hooks/usePosDataSync.ts:37
const MENU_CATALOG_PAGE_SIZE = 500  // 2000 → 500
```

**Etki:** POS menü yükleme süresinde **2-3x hızlanma.** Her istekte serialize edilen ürün sayısı 4'te 1'e iniyor.

---

## 4. Async PDF Üretimi (P1)

---

### 4.1 Rapor PDF'lerini Celery'ye Taşı

**Dosya:** `backend/apps/reporting/services/pdf_export.py`

**Şu an:** Tüm `export_pdf` endpoint'leri WeasyPrint ile **request-response döngüsü içinde** PDF üretiyor. WeasyPrint HTML→PDF dönüşümü CPU ve RAM yoğun. Büyük veri setlerinde 30 saniye+ sürebiliyor, Gunicorn worker'ını blokluyor.

**Çözüm:**
```python
# tasks.py
@shared_task(bind=True, max_retries=2, default_retry_delay=10)
def generate_report_pdf(self, user_id, report_type, filters):
    """Celery'de PDF üret, sonucu cache'e yaz"""
    try:
        pdf_bytes = build_pdf(report_type, filters)
        cache_key = f"report_pdf:{user_id}:{report_type}:{hash_filters(filters)}"
        cache.set(cache_key, pdf_bytes, timeout=3600)
        return cache_key
    except Exception as e:
        self.retry(exc=e)

# views.py
@action(detail=False, methods=["post"])
def export_pdf(self, request):
    task = generate_report_pdf.delay(request.user.id, report_type, filters)
    return Response({"task_id": task.id, "status": "processing"})

@action(detail=False, methods=["get"])
def export_pdf_status(self, request):
    task_id = request.query_params.get("task_id")
    result = AsyncResult(task_id)
    if result.ready():
        cache_key = result.get()
        return redirect(f"/media/reports/{cache_key}.pdf")
    return Response({"status": "processing"})
```

**Etki:** PDF isteklerinde **Gunicorn worker blokajı sıfırlanır.** Kullanıcı anında "hazırlanıyor" yanıtı alır, PDF hazır olunca indirir.

---

### 4.2 Fatura PDF'ini Celery'ye Taşı

**Dosya:** `backend/apps/invoices/services.py`

Aynı prensip — `_build_pdf_bytes()` reportlab çağrısı Celery task'e taşınmalı. Fatura oluşturma anında senkron PDF üretmek yerine:
```python
# services.py
def create_invoice(sale):
    invoice = Invoice.objects.create(sale=sale, ...)
    generate_invoice_pdf.delay(invoice.id)  # Celery'de
    return invoice

# tasks.py
@shared_task
def generate_invoice_pdf(invoice_id):
    invoice = Invoice.objects.get(id=invoice_id)
    pdf = _build_pdf_bytes(invoice, invoice.sale)
    invoice.pdf_file.save(f"{invoice.invoice_number}.pdf", ContentFile(pdf))
```

---

## 5. Celery ve Redis Optimizasyonları (P2)

---

### 5.1 Result Backend Ayrı DB'ye Taşı

**Dosya:** `backend/config/settings.py`

**Şu an:** Celery result backend broker ile **aynı Redis DB'yi (`/0`)** kullanıyor. `celery-task-meta-*` anahtarları birikebiliyor.

**Çözüm:**
```python
# settings.py
CELERY_RESULT_BACKEND = f"{REDIS_URL}/3"  # Broker /0'dan ayır
```

---

### 5.2 Menu Catalog Broadcast'e Throttle Ekle

**Dosya:** `backend/apps/menu/ws_broadcast.py`

**Şu an:** Her menü değişikliğinde TÜM şubelere fan-out broadcast yapılıyor. 50 şube × 3 grup = 150 group_send.

**Çözüm:**
```python
# ws_broadcast.py
from core.ws_throttle import throttle_coalesced

def broadcast_menu_catalog_refresh(branch_id=None, reason=""):
    throttle_coalesced(
        "menu_catalog",
        branch_id or "global",
        run=lambda: _do_broadcast(branch_id, reason),
        throttle_seconds=5,  # 5 saniyede birleştir
    )
```

---

## 6. Monitoring ve Profiling (P2)

---

### 6.1 django-silk Ekle (Development)

```bash
pip install django-silk
```

```python
# settings.py (development)
INSTALLED_APPS += ['silk']
MIDDLEWARE.insert(0, 'silk.middleware.SilkyMiddleware')
```

**Fayda:** Her request'te DB sorgu sayısını, süresini, N+1'leri anında görürsünüz.

---

## 7. Öncelikli Uygulama Takvimi

```
Gün 1 (30dk):
  ├── BaseModel is_active + created_at index → migrate
  └── Table + Zone composite index → migrate

Gün 2 (2s):
  ├── N+1 düzeltmeleri:
  │   ├── RecipeSerializer.get_learned_timing prefetch
  │   └── ProductSerializer.get_branch_names cache fix
  └── MenuCatalogPagination page_size: 500→100, max: 2000→500

Gün 3 (4s):
  ├── PDF export → Celery task'e taşı
  └── Fatura PDF → Celery task'e taşı

Hafta 2 (opt):
  ├── Result backend ayrı DB'ye taşı
  ├── Menu catalog broadcast throttle
  └── django-silk ekle
```

---

## 8. YAPILMAMASI Gerekenler

| Öneri | Neden |
|-------|-------|
| Tüm modellere indiscriminate index eklemek | Her index INSERT/UPDATE'i yavaşlatır. Sadece **filtrelenen/sıralanan** alanlara eklenmeli |
| Cache'i her yere eklemek | Cache invalidation karmaşası yaratır. Zaten KDS, RBAC, Tables için iyi bir strateji var |
| PDF senkron kalsın, worker sayısını artıralım | Semptom tedavisi. Asıl sorun CPU-bound işin request döngüsünde olması |
| Raw SQL ile query'leri yeniden yazmak | ORM + index ile aynı performans alınabilir. Bakımı zorlaştırır |

---

## 9. Ölçüm Metrikleri

Her optimizasyon öncesi/sonrası:

```bash
# PostgreSQL sorgu süresi
python manage.py shell
>>> from django.db import connection
>>> from apps.branches.models import Table
>>> qs = Table.objects.filter(is_active=True).select_related('zone')
>>> print(qs.explain(analyze=True))  # Index kullanılıyor mu?

# django-silk (development)
# /silk/ → Request başına sorgu sayısı

# Django Debug Toolbar
# SQL panel → N+1 var mı?
```

---

> **Not:** Bu rapordaki her optimizasyon bağımsız uygulanabilir.  
> **Önerilen sıra:** Gün 1 → Gün 2 → Gün 3 → Hafta 2
