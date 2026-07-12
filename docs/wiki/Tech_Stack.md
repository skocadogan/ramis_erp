# Tech Stack

> **Özet:** Ramis ERP'nin kullandığı tüm teknolojiler, kütüphaneler ve araçların detaylı listesi. Backend Python/Django, Frontend TypeScript/Next.js ekosistemi üzerine kuruludur.
> **Kütüphaneler:** Django, Next.js, PostgreSQL, Redis, Celery, Docker
> **Bağlantılar:** [[Mimari_Genel_Bakis]], [[Deployment]], [[Django_Settings]], [[WebSocket_Architecture]]

---

## Backend

| Teknoloji | Versiyon | Kullanım |
|-----------|----------|----------|
| Python | 3.x | Ana dil |
| Django | 6.0 | Web framework |
| Django REST Framework | - | REST API |
| Daphne | - | ASGI sunucu (üretimde `DAPHNE_INSTANCES` 1–4, nginx `least_conn`) |
| Django Channels | - | WebSocket — bkz. [[WebSocket_Architecture]] |
| channels_redis | - | WS channel layer |
| SimpleJWT | - | JWT kimlik doğrulama |
| Celery | - | Arka plan görevler |
| PostgreSQL | 16 | Veritabanı |
| Redis | 7 | Cache, WS layer, Celery broker |
| WeasyPrint | - | PDF oluşturma (fatura) |
| openpyxl | - | Excel raporlama |
| python-escpos / pyusb | - | ESC/POS termal yazıcı |
| Jinja2 | - | Şablon motoru (raporlar) |
| Pillow | - | Görsel işleme |
| django-cors-headers | - | CORS yönetimi |
| django-filter | - | QuerySet filtreleme |
| psycopg2-binary | - | PostgreSQL sürücü |

## Frontend

| Teknoloji | Versiyon | Kullanım |
|-----------|----------|----------|
| TypeScript | 5.x | Ana dil |
| Next.js | 16.2 | React framework (App Router) |
| React | 19.2 | UI kütüphanesi |
| TailwindCSS | 4.x | Stil sistemi |
| Zustand | 5.x | State yönetimi |
| TanStack React Query | 5.x | Sunucu state / veri çekme |
| Axios | - | HTTP istemci |
| Shadcn/ui + Radix UI | - | UI bileşen kütüphanesi |
| Lucide React | - | İkon seti |
| Recharts | 3.x | Grafik / chart |
| Sonner | - | Toast bildirimleri |
| Serwist | 9.x | PWA / Service Worker |
| Zod | 4.x | Şema doğrulama |
| date-fns | 4.x | Tarih işleme |
| dnd-kit | - | Sürükle-bırak |
| TipTap | 3.x | Zengin metin editörü |
| class-variance-authority | - | Bileşen varyant yönetimi |
| fast-deep-equal | - | Derin eşitlik kontrolü |
| React Intersection Observer | - | Lazy loading |

## Altyapı

| Teknoloji | Kullanım |
|-----------|----------|
| Docker Compose | PostgreSQL + Redis yerel geliştirme |
| systemd | Production servis yönetimi |
| Nginx | Reverse proxy (production) |
| GTK4 / Libadwaita | Masaüstü yardımcı araçları |
| crontab | Otomatik yedekleme zamanlama |

## Geliştirici Araçları

| Araç | Kullanım |
|------|----------|
| ESLint | Kod kalitesi (frontend) |
| pytest | Backend testleri |
| Turbopack | Next.js hızlı geliştirme modu |
| React Compiler (babel-plugin) | Otomatik memoization |
