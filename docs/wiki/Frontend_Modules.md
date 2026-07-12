# Frontend Modül Sayfaları

> **Özet:** Frontend feature modüllerinin toplu referans sayfası. Her modül `src/app/` altında sayfa ve `src/features/` altında iş mantığı bileşenlerinden oluşur.
> **Kütüphaneler:** React, TanStack Query, Zustand
> **Bağlantılar:** [[Frontend_Architecture]], [[Frontend_POS]], [[Frontend_KDS]], [[Frontend_Tables]], [[Recycle_Bin]]

---

## Modül Listesi

### [[Frontend_Dashboard]] — Restoran Özeti
**Sayfa:** `/dashboard` | **Feature:** (sayfa içi + `features/` parçaları)
Şube özet metrikleri ve yönetim kısayolları.

### [[Frontend_Tables]] — Masa Yönetimi
**Sayfa:** `/tables` | **Feature:** `features/tables/`
Masa grid/listesi, durum, aktif hesap özeti, `pos_occupied_flow` ile POS hizalı renkler.

### [[Frontend_Inventory]] — Stok Yönetimi
**Sayfa:** `/inventory` | **Feature:** `features/inventory/`
Stok kalemleri, kategoriler, birimler, tedarikçiler, stok hareketleri, FEFO raporu ve toplu giriş. SKT operasyonu envanterde sekme değil; `ExpiryRiskWidget` ile depo SKT sekmesine kısayol.

### [[Frontend_Warehouse]] — Depo Yönetimi
**Sayfa:** `/warehouse` | **Feature:** `features/warehouse/`
Depo tanımları, satın alma, mal kabul, transfer, sayım, eksik listeleri, satın alma önerileri ve **SKT Takibi** (`expiring_lots` sekmesi, EPIC-04).

### [[Frontend_Menu]] — Menü Düzenleme
**Sayfa:** `/menu-management` | **Feature:** `features/menu/`
Kategori, ürün, varyant, modifier, birim ve birleşik ürün yönetimi.

### [[Frontend_Admin]] — Yönetim
**Sayfa:** `/panel` (birincil); `/admin` → `/panel` yönlendirmesi | **Feature:** `features/admin/`
Kullanıcı, rol, izin yönetimi ve şube atamaları.

### [[Frontend_Shifts]] — Vardiyalar
**Sayfa:** `/shifts` | **Feature:** `features/shifts/`
Vardiya açma/kapama, kasa mutabakatı, gider ve nakit hareketi.

### [[Frontend_Sales]] — Satış Raporları
**Sayfa:** `/sales` | **Feature:** `features/sales/`
Satış listeleri, ödeme dağılımları ve filtreleme.

### [[Frontend_Invoices]] — Faturalar
**Sayfa:** `/invoices` | **Feature:** `features/invoices/`
Fatura oluşturma, listeleme ve PDF indirme.

### [[Frontend_Recipes]] — Reçeteler
**Sayfa:** `/recipes` | **Feature:** `features/recipes/`
Reçete oluşturma, malzeme ekleme ve maliyet hesaplama.

### [[Frontend_Reservations]] — Rezervasyonlar
**Sayfa:** `/reservations` | **Feature:** `features/reservations/`
Rezervasyon oluşturma, takip ve durum yönetimi.

### [[Frontend_Prep]] — Hazırlık Yönetimi
**Sayfa:** `/prep-management` | **Feature:** `features/prep/`
Hazırlık görevleri, şablonlar ve akıllı kurallar.

### [[Frontend_Production_Planning]] — Üretim Planlaması
**Sayfa:** `/production-planning` | **Feature:** `features/production-planning/`
Günlük üretim planları ve 86 listesi yönetimi.

### [[Frontend_Waiter]] — Garson Ekranı
**Sayfa:** `/waiter` | **Feature:** (POS alt bileşenleri)
Garson için sadeleştirilmiş sipariş alma ekranı.

### [[Recycle_Bin]] — Geri Dönüşüm Kutusu
**Sayfa:** `/recycle-bin` | **Feature:** `features/recycle-bin/`
Soft-delete kayıtları (süper kullanıcı): listeleme, geri yükleme, kalıcı silme.
