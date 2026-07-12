# RBAC Modülü Kullanıcı Kılavuzu (Case Study)

Bu doküman, bu projedeki `rbac` modülünü başka bir Django projesine nasıl entegre edeceğini ve gerçek bir senaryoda nasıl kullanacağını adım adım anlatır.

## 1. Modülün Kısa Özeti

Bu RBAC modülü, Django'nun klasik `Group/Permission` yapısına ek olarak uygulama seviyesinde daha okunabilir bir rol-yetki modeli sağlar.

Temel bileşenler:

- `PermissionCategory`: İzinleri modül/kategori bazında gruplar (`product`, `order`, `report` gibi)
- `RolePermission`: Uygulama izin kayıtları (`product.view_product`, `order.refund_order` gibi)
- `Role`: Kullanıcıya atanabilen roller; rol hiyerarşisi (`parent_role`) destekler
- `RBACUserMixin`: User modeline `has_permission()` ve `get_all_permissions()` ekler
- `PermissionRequiredMixin` ve decorator'lar: View seviyesinde yetki kontrolü
- `RBACMiddleware`: `request.user_permissions` ve `request.has_permission()` sağlar
- `register_permissions`: View'ları tarayıp eksik izinleri üretir
- `rbac_manage`: kategori/izin/rol atamalarını CLI’dan yönetir
- `RBACAuditLog`: kritik RBAC değişikliklerini kaydeder
- Cache katmanı: kullanıcı izinlerini TTL ile önbelleğe alır, sinyallerle temizler

---

## 2. Entegrasyon Adımları

## 2.1 Dosyaları Projeye Ekle

`rbac` klasörünü Django projesi köküne taşı:

```text
myproject/
  manage.py
  myproject/
  apps/
  rbac/
```

## 2.2 `INSTALLED_APPS` Ayarı

`rbac`, user app’inden önce tanımlanmalı:

```python
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    'rbac',           # önce
    'app.user',       # custom user app
    'app.home',
]
```

## 2.3 Middleware ve Template Context

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

## 2.4 Custom User Model Entegrasyonu

User modelin `RBACUserMixin` içermeli ve `roles` alanı olmalı:

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

`settings.py`:

```python
AUTH_USER_MODEL = 'user.CustomUser'
```

## 2.5 Migration

```bash
python manage.py makemigrations
python manage.py migrate
```

---

## 3. View Seviyesinde Yetki Kullanımı

## 3.1 Class-Based View

### OR (varsayılan)

```python
from django.views.generic import ListView
from rbac.permissions import PermissionRequiredMixin


class ProductListView(PermissionRequiredMixin, ListView):
    model = Product
    permission_required = ['product.view_product', 'product.export_product']
    permission_description = 'Ürün listeleme veya export'
```

### AND

```python
class ProductUpdateView(PermissionRequiredMixin, UpdateView):
    model = Product
    required_all_permissions = ['product.view_product', 'product.change_product']
    permission_description = 'Ürün güncelleme için hem görüntüleme hem değiştirme gerekir'
```

### NOT

```python
class ProductDeleteView(PermissionRequiredMixin, DeleteView):
    model = Product
    permission_required = 'product.delete_product'
    permission_forbidden = ['product.locked_operator']
```

## 3.2 Function-Based View Decorator

```python
from rbac.permissions import (
    permission_required,
    permission_required_all,
    permission_forbidden,
    role_required,
)


@permission_required('order.view_order', permission_description='Sipariş görüntüleme')
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

Not:

- `role_required` içinde superuser bypass edilir.
- Decorator’lar için `permission_description`, `register_permissions` komutu tarafından izin açıklaması üretiminde kullanılır.

---

## 4. Şablonlarda Kullanım

Middleware + context processor sayesinde:

- `user_permissions`
- `user_roles`

context'e gelir.

```django
{% if 'product.view_product' in user_permissions %}
  <a href="{% url 'product:list' %}">Ürünler</a>
{% endif %}

{% if 'FinanceManager' in user_roles %}
  <a href="{% url 'finance:dashboard' %}">Finans</a>
{% endif %}
```

---

## 5. Komutlar ile Yönetim

## 5.1 View Taramadan İzin Üretme

```bash
# Tüm app'leri tara
python manage.py register_permissions

# Sadece belirli app
python manage.py register_permissions --app product

# Dry-run
python manage.py register_permissions --dry-run

# JSON dry-run
python manage.py register_permissions --dry-run --json

# Mevcutları force güncelle
python manage.py register_permissions --force

# Özel izin ekle
python manage.py register_permissions --add-custom "product.export_product:Dışa Aktarma"
```

Reset komutları:

```bash
python manage.py register_permissions --reset --yes
python manage.py register_permissions --reset-perms-only --yes
```

## 5.2 RBAC CRUD Komutları

```bash
# Kategori oluştur / güncelle
python manage.py rbac_manage category product "Ürün Yönetimi" --description="Ürün izinleri"

# Tek izin oluştur / güncelle
python manage.py rbac_manage permission product view_product "Ürün Görüntüleme"

# CRUD izinleri üret
python manage.py rbac_manage crud product product

# Rol oluştur
python manage.py rbac_manage create_role "ProductEditor" --description="Ürün editörü"

# Parent rol ile oluştur
python manage.py rbac_manage create_role "ProductManager" --parent "ProductEditor"

# Role izin ata
python manage.py rbac_manage assign "ProductEditor" product.view_product product.change_product

# Kullanıcıya rol ata
python manage.py rbac_manage user_role sedat "ProductEditor"

# Listele
python manage.py rbac_manage list categories
python manage.py rbac_manage list permissions --category=product
python manage.py rbac_manage list roles

# JSON liste
python manage.py rbac_manage list roles --json
```

---

## 6. Rol Hiyerarşisi

`Role.parent_role` ile alt rol, üst rol izinlerini miras alır.

Örnek:

- `Editor` izinleri: `product.view_product`
- `Manager` parent: `Editor`, ek izni: `product.change_product`

`Manager` rolündeki kullanıcı iki izni de alır.

Bu hesaplama `Role.get_inherited_permission_codes()` ve `RBACUserMixin.get_all_permissions()` ile yapılır.

---

## 7. Cache ve Performans

Ayar:

```python
RBAC_CACHE_TTL = 300
```

- Kullanıcı izinleri cache’de tutulur.
- Rol/izin değişimlerinde signal'lar cache temizliği yapar.
- `RBAC_CACHE_TTL = 0` yaparsan cache devre dışı kalır.

Öneri:

- Üretimde Redis/Memcached gibi paylaşımlı cache backend kullan.
- Çok worker’lı deployment’larda `LocMemCache` yerine merkezi cache tercih et.

---

## 8. Audit Log

`RBACAuditLog` modeli değişiklik kayıtlarını tutar:

- işlem (`create`, `update`, `delete`, `assign`, `revoke`)
- hedef tipi (`role`, `permission`, `category`, `user_role`)
- hedef id/özet
- değişiklik detayları (`JSON`)
- işlem zamanı

Admin panelinden doğrudan izlenebilir.

---

## 9. Case Study: E-Ticaret Ürün + Sipariş Modülü

Amaç:

- Operasyon, içerik ve finans ekiplerinin farklı yetki sınırları olsun
- Tek kod tabanında görünür ve denetlenebilir yetki matrisi kurulsun

## 9.1 Roller

- `CatalogViewer`
- `CatalogEditor`
- `CatalogManager` (parent: `CatalogEditor`)
- `OrderViewer`
- `FinanceManager`

## 9.2 İzin Tasarımı

Kategori `product`:

- `product.view_product`
- `product.add_product`
- `product.change_product`
- `product.delete_product`
- `product.export_product`

Kategori `order`:

- `order.view_order`
- `order.change_order`
- `order.refund_order`
- `order.cancel_order`

## 9.3 Rol-İzin Matrisi

- `CatalogViewer`: `product.view_product`
- `CatalogEditor`: `product.view_product`, `product.add_product`, `product.change_product`
- `CatalogManager`: parent `CatalogEditor` + `product.export_product`
- `OrderViewer`: `order.view_order`
- `FinanceManager`: `order.view_order`, `order.refund_order`

## 9.4 Uygulama Akışı

1. İzinler view’lardan taranır: `register_permissions`
2. `rbac_manage` ile roller oluşturulur
3. Roller kullanıcılara atanır
4. View’larda decorator/mixin ile endpoint korumaları etkinleştirilir
5. Template’de menü butonları `user_permissions` ile koşullandırılır
6. Değişiklikler audit log’dan izlenir

## 9.5 Örnek View Kuralları

- Ürün listeleme: `permission_required('product.view_product')`
- Ürün güncelleme: `permission_required_all(['product.view_product', 'product.change_product'])`
- İptal ekranı: `permission_forbidden('order.read_only')`
- Finans paneli: `role_required('FinanceManager')`

---

## 10. Üretim Ortamı Kontrol Listesi

- `DJANGO_SECRET_KEY` environment variable set edildi
- `DJANGO_DEBUG=False`
- `DJANGO_ALLOWED_HOSTS` doğru tanımlandı
- Merkezi cache backend (Redis/Memcached) kullanılıyor
- Admin erişimi sadece güvenli ağ/VPN üzerinden
- Düzenli role/permission audit raporu alınıyor
- Yetki değişiklikleri CI/CD dışında manuel değiştiriliyorsa süreç onaylı

---

## 11. Sorun Giderme

### Sorun: `user_permissions` template’de boş

Kontrol:

- `RBACMiddleware`, `AuthenticationMiddleware` sonrasında mı?
- `rbac.context_processors.user_permissions` tanımlı mı?
- User model `RBACUserMixin` + `roles` alanını içeriyor mu?

### Sorun: Dekoratör sürekli 403 dönüyor

Kontrol:

- İzin kodu formatı `app.codename` mi?
- Rol aktif mi (`is_active=True`)?
- Kullanıcıya rol gerçekten atanmış mı?
- İzin rol üzerine atanmış mı?

### Sorun: Parent rol izinleri gelmiyor

Kontrol:

- `parent_role` doğru role bağlı mı?
- Parent rol `is_active=True` mi?

---

## 12. Hızlı Başlangıç (15 Dakika)

1. `rbac` app’i ekle, middleware/context ayarla
2. User modeline `RBACUserMixin` + `roles` ekle
3. `migrate` çalıştır
4. View’lara `permission_required`/`PermissionRequiredMixin` ekle
5. `register_permissions` ile izinleri üret
6. `rbac_manage` ile roller oluştur ve kullanıcıya ata
7. Template’de `user_permissions` ile menüleri filtrele

---

Bu kılavuz, projedeki güncel RBAC implementasyonuna göre hazırlanmıştır ve doğrudan uygulanabilir örnekler içerir.
