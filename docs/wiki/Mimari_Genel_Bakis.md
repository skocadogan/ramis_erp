# Mimari Genel Bakış

> **Özet:** Ramis ERP, Django 6 backend (ASGI/Daphne) ve Next.js 16 frontend katmanından oluşan tam yığın (full-stack) bir restoran ERP sistemidir. PostgreSQL, Redis ve Celery ile desteklenir.
> **Kütüphaneler:** Django 6, Next.js 16, PostgreSQL 16, Redis 7, Celery, Daphne (ASGI), Docker Compose
> **Bağlantılar:** [[Tech_Stack]], [[Deployment]], [[Django_Settings]], [[Frontend_Architecture]], [[WebSocket_Architecture]]

---

## Katmanlı Mimari

```
┌───────────────────────────────────────┐
│         Frontend (Next.js 16)         │
│  React 19 · TailwindCSS 4 · Zustand  │
│  Serwist (PWA) · Axios · TanStack    │
└──────────────┬────────────────────────┘
               │ REST API (JSON) + WebSocket
┌──────────────▼────────────────────────┐
│        Backend (Django 6 / DRF)       │
│  Daphne ASGI · JWT Auth (Cookie)     │
│  Django Channels (WS) · RBAC        │
│  Celery (Async Tasks)                │
└──────┬──────────┬──────────┬─────────┘
       │          │          │
┌──────▼──┐ ┌────▼────┐ ┌───▼────────┐
│PostgreSQL│ │ Redis   │ │ Filesystem │
│  16      │ │ 7       │ │ (media/)   │
└──────────┘ └─────────┘ └────────────┘
```

## Proje Dizin Yapısı

```
ramis_erp/
├── backend/              # Django projesi
│   ├── config/           # settings, urls, asgi, wsgi, celery
│   ├── core/             # BaseModel, branch_scope, ws_metrics
│   ├── rbac/             # Rol Bazlı Erişim Kontrolü modülü
│   ├── apps/             # 18 uygulama modülü
│   │   ├── branches/     # Şube, bölge, masa, istasyon
│   │   ├── users/        # Kullanıcı ve kimlik doğrulama
│   │   ├── menu/         # Ürün, kategori, varyant
│   │   ├── orders/       # Sipariş yönetimi
│   │   ├── sales/        # Satış ve ödeme
│   │   ├── inventory/    # Stok ve tedarikçi
│   │   ├── warehouse/    # Depo operasyonları
│   │   ├── recipes/      # Reçete ve maliyet
│   │   ├── shifts/       # Vardiya ve kasa
│   │   ├── invoices/     # Faturalama
│   │   ├── reservations/ # Rezervasyonlar
│   │   ├── pos_display/  # Müşteri ekranı
│   │   ├── production_planning/ # Üretim planlama
│   │   ├── prep/         # Mutfak hazırlık
│   │   ├── printing/     # Yazıcı yönetimi
│   │   ├── reporting/    # Rapor şablonları
│   │   ├── search/       # Genel arama
│   │   └── dashboard/    # Panel verileri
│   └── requirements/     # Python bağımlılıkları
├── frontend/             # Next.js projesi
│   └── src/
│       ├── app/          # App Router (sayfa rotaları)
│       ├── components/   # UI ve shell bileşenleri
│       ├── features/     # Modül bazlı feature dizinleri
│       ├── hooks/        # Custom React hook'ları
│       ├── lib/          # API client, WS, utils
│       ├── store/        # Zustand state yönetimi
│       └── types/        # TypeScript tip tanımları
├── system_utils/         # Masaüstü yardımcı araçları
│   ├── ramis_monitor/    # Servis izleyici (GTK4)
│   └── backup_restore/   # Yedekleme aracı (GTK4)
├── docker-compose.yml    # PostgreSQL + Redis
├── install.sh            # Tam veya backend-only kurulum betiği
├── update.sh             # Güncelleme betiği
└── uninstall.sh          # Kaldırma betiği
```

## Veri Akışı

1. **Kullanıcı** → Frontend (tarayıcı/PWA)
2. **Frontend** → Axios ile `api/v1/` REST endpoint'lerine istek
3. **Backend** → DRF ViewSet → Service → Model → DB
4. **Gerçek Zamanlı** → Django Channels (WebSocket) ile KDS, POS, masa durumları ve depo stok bildirimleri; üretimde 1–4 Daphne süreci + nginx `least_conn` ([[WebSocket_Architecture]], [[Deployment]])
5. **Arka Plan** → Celery ile stok rezervasyon temizliği ve hazırlık şablon çalıştırma
6. **Cache** → Redis (Channel Layer + Django Cache + Celery Broker)

## API Versiyonlama

Tüm API endpoint'leri `/api/v1/` altında tanımlıdır. Bkz: [[Django_Settings]] `config/urls.py`.
