# Dashboard (Yönetim Paneli)

> **Özet:** Satış, envanter ve operasyonel özetleri sunan dashboard API. Şube bazlı verileri toplar ve frontend panel sayfasına sunar.
> **Kütüphaneler:** Django ORM, DRF
> **Bağlantılar:** [[Branches]], [[Sales]], [[Inventory]], [[Branch_Scope]], [[Menu_Engineering]]

---

## Konum
`backend/apps/dashboard/`

## İşlev
- Günlük / haftalık / aylık satış özetleri
- Ödeme yöntemi dağılımları
- Stok kritik seviye uyarıları
- Şube performans metrikleri
- Menü mühendisliği analitiği (`menu-engineering`, `menu-engineering-actual`) ve stok sapma özeti

## Menü mühendisliği
- Ana selector: `get_menu_engineering_analytics(...)`
- Endpoint'ler:
  - `GET /api/v1/dashboard/menu-engineering/`
  - `GET /api/v1/dashboard/menu-engineering-actual/`
- Response aynı payload içinde iki görünüm taşır:
  - `summary` → tahmini maliyet / marj
  - `actual_summary` → ledger kapsamalı gerçek maliyet / marj
- Ayrıntılı veri akışı: [[Menu_Engineering]]

## Akıllı Anomali Tespiti (v2)
- **Kural:** Seçili şube(ler) için bugünkü kategori satışları, son 4 haftanın aynı günündeki (weekday) hareketli ortalamasıyla kıyaslanır.
- **Eşik (Threshold):** Ortalama satış hacmi > 100 TL olan kategorilerde, %35 ve üzeri düşüşler anomali kabul edilir.
- **UI:** Dashboard üst bandında sarı uyarı kartı olarak belirir. Yardım ikonu ile detaylı kural açıklaması sunulur.
- **Selector:** `get_dashboard_anomalies(branch_ids)`

## Hedef Takip Sistemi (v2)
- **Model:** `BranchTarget` (Şube, Ay, Yıl, Hedef Ciro).
- **Mantık:** Cari ayın başından bugüne (`paid_at__date__gte=first_day`) olan toplam ciro, tanımlanan hedefle kıyaslanır.
- **UI:** Dashboard KPI kartları arasında **Progress Bar** (İlerleme Çubuğu) ile görselleştirilir.
- **Selector:** `get_target_stats(branch_ids)`

## En Çok Satanlar (Best Sellers)
- **Hesaplama:** Ürün satış miktarları hesaplanırken sadece adet değil, porsiyon çarpanları da (`portion_multiplier`) dikkate alınır. Örn: 1 adet yarım porsiyon satışı, listeye 0.5 adet olarak yansır.
- **Selector:** `get_top_selling_products(branch_ids, limit, start_date, end_date)`
