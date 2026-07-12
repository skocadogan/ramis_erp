# DB_Maintenance (Veritabanı Bakımı)

> **Özet:** GTK4/Adwaita tabanlı PostgreSQL bakım uygulaması. Sistem performansını korumak için `VACUUM ANALYZE`, `REINDEX` ve `ANALYZE` işlemlerini görsel arayüz üzerinden çalıştırır.
> **Kütüphaneler:** Python, Gtk4, Libadwaita, PostgreSQL (psql)
> **Bağlantılar:** [[Ramis_Monitor]], [[Backup_Restore]], [[User_Emergency_Admin]]

---

## Konum
- `system_utils/db_maintenance/db_maintenance.py` — Ana uygulama dosyası.
- `system_utils/db_maintenance/run_maintenance.sh` — Uygulamayı başlatan betik.

## Özellikler
1. **Vakum ve Analiz (VACUUM ANALYZE)**: Ölü satırları (dead tuples) temizler, disk alanını geri kazandırır ve sorgu planlayıcısı için tablo istatistiklerini günceller.
2. **İndeksleri Yenile (REINDEX)**: Veritabanındaki tüm indeksleri yeniden oluşturur. Parçalanmış (fragmented) indeksleri düzeltir ve sorgu hızını artırır.
3. **İstatistikleri Güncelle (ANALYZE)**: Sadece istatistikleri günceller. Daha hızlıdır ve tablo kilitlenmelerini minimumda tutar.

## Çalışma Mantığı
Uygulama arka planda `/etc/ramis/backend.env` dosyasını `pkexec` yetkisiyle okuyarak veritabanı bağlantı bilgilerini (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, vb.) alır ve `psql` komutlarıyla belirtilen işlemleri asenkron olarak (Thread içinde) yürütür. Kullanıcı, arayüzdeki "İşlem Kayıtları" (log) panelinden durumu anlık olarak takip edebilir.
