# RBAC Modülü - Birleşik Kurulum ve Case Study Kılavuzu

Bu doküman, projedeki güncel `rbac` modülünü tek kaynakta anlatır:

- Kurulum ve entegrasyon
- View, template ve komut satırı kullanımı
- Rol hiyerarşisi, cache ve audit log
- Gerçek bir case study ile uçtan uca uygulama

## İçindekiler

1. Gereksinimler
2. Modül Mimarisi
3. Projeye Entegrasyon
4. User Model Entegrasyonu
5. İzin Kontrolü Kullanımı (CBV/FBV)
6. Template Kullanımı
7. Yönetim Komutları
8. Yardımcı Fonksiyonlar
9. Rol Hiyerarşisi
10. Cache Mimarisi
11. Audit Log
12. Case Study: E-Ticaret
13. Production Kontrol Listesi
14. Sorun Giderme
15. Hızlı Başlangıç

---

## 1. Gereksinimler

- Python 3.10+
- Django 4.x / 5.x / 6.x
- Custom user model (önerilir, bu projede mevcut)

---

## 2. Modül Mimarisi

Temel modeller:

- `PermissionCategory`: İzin kategorisi (`product`, `order`, `report`)
- `RolePermission`: İzin kaydı (`product.view_product`)
- `Role`: Kullanıcıya atanabilen rol
- `Role.parent_role`: Rol mirası (hiyerarşi)
- `RBACAuditLog`: RBAC değişiklik kayıtları

Temel bileşenler:

- `RBACUserMixin`: User modeline `has_permission`, `get_all_permissions`
- `PermissionRequiredMixin`: Class-based view yetki koruması
- Decorator'lar:
  - `permission_required` (OR)
  - `permission_required_all` (AND)
  - `permission_forbidden` (NOT)
  - `role_required`
- `RBACMiddleware`: `request.user_permissions`, `request.has_permission`
- Context processor: template için `user_permissions`, `user_roles`
- Yönetim komutları: `register_permissions`, `rbac_manage`

---

## 3. Projeye Entegrasyon

## 3.1 Dosyaları Ekle

`rbac` klasörünü Django projesi köküne ekle:

```text
myproject/
  manage.py
  myproject/
  apps/
  rbac/
```

## 3.2 `INSTALLED_APPS`

`rbac`, custom user app'inden önce olmalı:

```python
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    'rbac',
    'app.user',
    'app.home',
]
```

## 3.3 Middleware

```python
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'rbac.middlewares.RBACMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
```

## 3.4 Template Context Processor

```python
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'rbac.context_processors.user_permissions',
            ],
        },
    },
]
```

## 3.5 Ayarlar

```python
AUTH_USER_MODEL = 'user.CustomUser'
RBAC_SCAN_EXCLUDE_APPS = ['rbac', 'admin']
RBAC_CACHE_TTL = 300
```

Opsiyonel cache örneği:

```python
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'rbac-default',
    }
}
```

## 3.6 Migration

```bash
python manage.py makemigrations
python manage.py migrate
```

---

## 4. User Model Entegrasyonu

User model `RBACUserMixin` içermeli ve `roles` alanı taşımalı:

```python
from django.contrib.auth.models import AbstractUser
from django.db import models
from rbac.mixins import RBACUserMixin


class CustomUser(RBACUserMixin, AbstractUser):
    roles = models.ManyToManyField(
        'rbac.Role',
        blank=True,
        related_name='users',
        verbose_name='Roller'
    )
```

Mixin şu davranışı sağlar:

- `has_permission(permission_code)`
- `get_all_permissions()`
  - Superuser ise tüm izinleri döner
  - Değilse aktif roller + parent rollerin izinlerini hesaplar
  - Cache kullanır

---

## 5. İzin Kontrolü Kullanımı (CBV/FBV)

## 5.1 Class-Based View: `PermissionRequiredMixin`

### OR (varsayılan)

```python
class ProductListView(PermissionRequiredMixin, ListView):
    permission_required = ['product.view_product', 'product.export_product']
```

### AND

```python
class ProductUpdateView(PermissionRequiredMixin, UpdateView):
    required_all_permissions = ['product.view_product', 'product.change_product']
```

### NOT

```python
class ProductDeleteView(PermissionRequiredMixin, DeleteView):
    permission_required = 'product.delete_product'
    permission_forbidden = ['product.locked_operator']
```

## 5.2 Function-Based View Decorator

```python
from rbac.permissions import (
    permission_required,
    permission_required_all,
    permission_forbidden,
    role_required,
)


@permission_required('order.view_order')
def order_detail(request, pk):
    ...


@permission_required_all(['order.view_order', 'order.refund_order'])
def refund_order(request, pk):
    ...


@permission_forbidden('order.read_only')
def edit_order(request, pk):
    ...


@role_required('FinanceManager')
def finance_dashboard(request):
    ...
```

Notlar:

- `role_required` superuser için bypass eder.
- `permission_description`, `register_permissions` tarafından izin açıklaması üretiminde kullanılabilir.

---

## 6. Template Kullanımı

Context processor sayesinde:

- `user_permissions`
- `user_roles`

şablona eklenir.

```django
{% if 'product.view_product' in user_permissions %}
  <a href="{% url 'product:list' %}">Ürünler</a>
{% endif %}

{% if 'FinanceManager' in user_roles %}
  <a href="{% url 'finance:dashboard' %}">Finans</a>
{% endif %}
```

---

## 6.5 API / Django REST Framework Kullanımı

RBAC, Django REST Framework (DRF) ile uyumludur. Token, JWT veya Session authentication ile çalışır.

### Kurulum

```bash
pip install djangorestframework
```

```python
# settings.py
INSTALLED_APPS = [
    # ...
    'rest_framework',
    'rbac',
]
```

### DRF Permission Sınıfları

`rbac.drf` modülü DRF için hazır permission sınıfları sağlar:

| Sınıf | Mantık | Kullanım |
|-------|--------|----------|
| `RBACPermission` | OR | Herhangi bir izin yeterli |
| `RBACPermissionAll` | AND | Tüm izinler gerekli |
| `RBACPermissionForbidden` | NOT | Yasaklı izinlere sahip olmamalı |
| `RBACRoleRequired` | Rol | Belirli role sahip olmalı |

### Örnek API View

```python
# views.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rbac.drf import RBACPermission, RBACPermissionAll, RBACRoleRequired

class ProductListAPI(APIView):
    permission_classes = [RBACPermission]
    permission_codes = ['product.view_product']

    def get(self, request):
        return Response({'data': []})

class ProductEditAPI(APIView):
    permission_classes = [RBACPermissionAll]
    permission_codes = ['product.view_product', 'product.change_product']

    def put(self, request, pk):
        return Response({'status': 'ok'})

class AdminDashboardAPI(APIView):
    permission_classes = [RBACRoleRequired]
    required_role = 'Admin'

    def get(self, request):
        return Response({'dashboard': {}})
```

### ViewSet ile Kullanım

```python
from rest_framework import viewsets
from rbac.drf import RBACPermission

class ProductViewSet(viewsets.ModelViewSet):
    permission_classes = [RBACPermission]
    permission_codes = ['product.view_product']
    # create/update/delete için ayrı izinler:
    # get_permissions() override edilebilir
```

### Önemli Notlar

- **RBACMiddleware** tüm isteklere (API dahil) uygulanır; `request.has_permission()` ve `request.user_permissions` API view'larda da kullanılabilir.
- DRF authentication (Token, JWT, Session) `request.user`'ı ayarlar; RBAC bu kullanıcı üzerinden çalışır.
- İzin reddedildiğinde DRF standart 403 JSON yanıtı döner.

---

## 7. Yönetim Komutları

## 7.1 `register_permissions`

View içindeki `permission_required` tanımlarını tarar, eksik izin kayıtlarını üretir.

```bash
python manage.py register_permissions
python manage.py register_permissions --app product
python manage.py register_permissions --dry-run
python manage.py register_permissions --dry-run --json
python manage.py register_permissions --force
python manage.py register_permissions --add-custom "product.export_product:Dışa Aktarma"
python manage.py register_permissions --reset --yes
python manage.py register_permissions --reset-perms-only --yes
```

Argümanlar:

- `--dry-run`: yazmadan rapor gösterir
- `--json`: dry-run çıktısını JSON üretir
- `--app`: tek uygulama tarar
- `--force`: mevcut rol izin açıklamalarını günceller
- `--add-custom`: manuel izin ekleme
- `--reset`, `--reset-perms-only`, `--yes`: sıfırlama işlemleri

## 7.2 `rbac_manage`

RBAC nesnelerini CLI üzerinden yönetir:

```bash
python manage.py rbac_manage category product "Ürün Yönetimi" --description="Ürün izinleri"
python manage.py rbac_manage permission product view_product "Ürün Görüntüleme"
python manage.py rbac_manage crud product product
python manage.py rbac_manage create_role "ProductEditor"
python manage.py rbac_manage create_role "ProductManager" --parent "ProductEditor"
python manage.py rbac_manage assign "ProductEditor" product.view_product product.change_product
python manage.py rbac_manage user_role sedat "ProductEditor"
python manage.py rbac_manage list categories
python manage.py rbac_manage list permissions --category=product
python manage.py rbac_manage list roles --json
```

Alt komutlar:

- `category`
- `permission`
- `crud`
- `assign`
- `create_role`
- `user_role`
- `list`

---

## 8. Yardımcı Fonksiyonlar

`rbac.utils`:

- `scan_project_permissions_from_views(app_name=None)`
- `scan_project_permissions_from_db(app_name=None)`
- `create_permission_code(category_code, action)`
- `create_default_permissions(category_code, model_name, category_instance=None)`
- `create_default_roles()`

Örnek:

```python
from rbac.utils import scan_project_permissions_from_views, create_default_roles

scanned = scan_project_permissions_from_views()
admin_role, user_role = create_default_roles()
```

---

## 9. Rol Hiyerarşisi

`Role.parent_role` ile inheritance sağlar.

Örnek:

- `Editor`: `product.view_product`
- `Manager`: parent `Editor` + `product.change_product`

Sonuç:

- `Manager` kullanıcısı hem `view` hem `change` iznini alır.

Bu hesaplama `Role.get_inherited_permission_codes()` ile yapılır.

---

## 10. Cache Mimarisi

`RBAC_CACHE_TTL` saniye cinsinden kullanıcı izin cache ömrünü belirler.

- `> 0`: cache aktif
- `0`: cache kapalı

Signal'lar rol/izin değişimlerinde ilgili kullanıcıların cache'ini invalid eder.

Öneri:

- Çoklu instance üretimde Redis/Memcached kullan.

---

## 11. Audit Log

`RBACAuditLog` kayıtları admin üzerinden izlenebilir.

Tutulan alanlar:

- işlemi yapan kullanıcı
- aksiyon (`create`, `update`, `delete`, `assign`, `revoke`)
- hedef tip/id/özet
- değişiklik detayları (JSON)
- tarih

---

## 12. Case Study: E-Ticaret (Ürün + Sipariş)

Amaç:

- Katalog, operasyon ve finans ekiplerine ayrık yetki seti
- Menü ve endpoint seviyesinde net yetki sınırı
- Audit ve izlenebilir değişiklik geçmişi

## 12.1 Kategoriler

- `product`
- `order`

## 12.2 İzinler

`product`:

- `product.view_product`
- `product.add_product`
- `product.change_product`
- `product.delete_product`
- `product.export_product`

`order`:

- `order.view_order`
- `order.change_order`
- `order.refund_order`
- `order.cancel_order`

## 12.3 Roller

- `CatalogViewer`
- `CatalogEditor`
- `CatalogManager` (parent: `CatalogEditor`)
- `OrderViewer`
- `FinanceManager`

## 12.4 Rol-İzin Matrisi

- `CatalogViewer`: `product.view_product`
- `CatalogEditor`: `product.view_product`, `product.add_product`, `product.change_product`
- `CatalogManager`: `CatalogEditor` mirası + `product.export_product`
- `OrderViewer`: `order.view_order`
- `FinanceManager`: `order.view_order`, `order.refund_order`

## 12.5 Uygulama Adımları

1. View’lara permission mixin/decorator ekle
2. `register_permissions` ile izin kayıtlarını üret
3. `rbac_manage` ile roller oluştur
4. Rolleri kullanıcılara ata
5. Template menülerini `user_permissions` ile koşullandır
6. Audit log ile değişiklikleri izle

---

## 13. Production Kontrol Listesi

- `DJANGO_SECRET_KEY` env üzerinden veriliyor
- `DJANGO_DEBUG=False`
- `DJANGO_ALLOWED_HOSTS` dolu
- Merkezi cache backend kullanılıyor
- Admin erişimi güvenli ağ ile sınırlandı
- RBAC değişiklikleri periyodik denetleniyor

---

## 14. Sorun Giderme

### `user_permissions` boş geliyor

Kontrol et:

- `RBACMiddleware` sırası doğru mu?
- Context processor eklendi mi?
- User model `RBACUserMixin` + `roles` içeriyor mu?

### Sürekli 403 dönüyor

Kontrol et:

- İzin kodu `app.codename` formatında mı?
- Rol aktif mi?
- Kullanıcıya rol atandı mı?
- Rol izin ilişkisi doğru mu?

### Parent izinleri gelmiyor

Kontrol et:

- `parent_role` doğru role bağlı mı?
- Parent rol aktif mi?

---

## 15. Hızlı Başlangıç (10 Dakika)

1. `rbac` app'ini ekle
2. middleware + context processor ayarla
3. user modeli `RBACUserMixin` ile güncelle
4. migration çalıştır
5. view korumalarını ekle
6. `register_permissions` çalıştır
7. `rbac_manage` ile rol/izin atamalarını yap

---

Bu dosya, önceki kurulum dokümanı ile case study kılavuzunun birleştirilmiş güncel sürümüdür.
