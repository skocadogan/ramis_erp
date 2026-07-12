# Ramis ERP — Ajan / geliştirici rehberi

Bu dosya, kod tabanında çalışan ajanlar ve geliştiriciler için kısa bir operasyonel haritadır. Ayrıntılı mimari ve modül notları **`docs/wiki`** içindedir.

---

## Sanal ortam (backend)

- **Birincil:** `backend/venv`
- **Yedek:** `backend/env` (venv yoksa)

Örnek:

```bash
# Proje kökünden
source backend/venv/bin/activate   # veya: backend/env/bin/activate

cd backend
python manage.py migrate
python manage.py test
```

Diğer Python komutlarını da aynı venv ile çalıştır.

---

## Depo yapısı (yüksek seviye)

| Yol | İçerik |
|-----|--------|
| `backend/` | Django REST API, modeller, Celery, WebSocket |
| `frontend/` | Next.js (App Router), React 19, Tailwind, `next-intl` |
| `docs/wiki/` | Mimari ve modül wiki’si (Obsidian tarzı bağlantılar) |
| `wiki_schema.md` | Wiki üretim/güncelleme kuralları (**INGEST** vb.) |

---

## Frontend

- Dizin: `frontend/`
- Geliştirme: `npm run dev` (Turbopack)
- Kalite: `npm run lint`, `npm run build`

API ile konuşma genelde ortak axios katmanı ve feature altındaki servisler üzerinden yapılır; ayrıntı için wiki: **`docs/wiki/API_Client.md`**, **`docs/wiki/Frontend_Architecture.md`**.

- Ortam değişkenleri (`frontend/.env.local`, `/etc/ramis/frontend.env`): **`docs/wiki/Frontend_Environment.md`**
- IP / API URL (rebuild gerektirmeden): **`docs/wiki/Runtime_Config.md`**

---

## Backend

- Ayarlar mimarisi (özet): **`docs/wiki/Django_Settings.md`**
- Ortam değişkenleri tam referansı (`backend/.env`, `/etc/ramis/backend.env`, ölçeklendirme): **`docs/wiki/Backend_Environment.md`**
- Kapasite / Locust test env: **`docs/wiki/Load_Testing.md`**
- Yetkilendirme: **`docs/wiki/RBAC.md`**
- Şube / erişim kapsamı: **`docs/wiki/Branch_Scope.md`**

**Yumuşak silme:** Çoğu `BaseModel` türevi `delete()` ile `is_active=False` olur; listeleme/API sorgularında pasif kayıtların süzülüp süzülmediğini her ViewSet/serviste kontrol et. Özet: **`docs/wiki/BaseModel.md`**.

---

## Wiki kullanımı (`docs/wiki`)

- **Bilgi eksikse veya mimari soru varsa:** Önce **`docs/wiki/Index.md`**, ardından ilgili modül sayfalarını oku.
- **`wiki_schema.md`:** Özellikle wiki sayfası *üretirken veya güncellerken* geçerlidir (INGEST kuralları, Obsidian `[[Bağlantılar]]`, kod değiştirmeme uyarısı vb.).
- Normal **kod görevleri** için öncelik kaynak koddur; wiki bazen geride kalabilir — çelişki varsa kodu esas al ve gerekirse wiki’yi güncelle.

---

## Önerilen çalışma sırası

1. İlgili wiki başlıklarına göz at (`Index.md` → modül).
2. Değişecek feature/API için kaynak dosyaları oku.
3. Backend’de venv ile test veya migrate çalıştır.
4. Kullanıcı istemedikçe kapsamı büyütme; mevcut stile uy.

---

## Dil ve kullanıcı tercihi

Projede Türkçe kullanıcı iletişimi tercih ediliyor; UI metinleri `next-intl` mesaj dosyaları üzerinden yönetiliyor (`docs/wiki/Internationalization.md`).


## SKILL Kullanımı

Projeye özel olarak dışarıdan dahil edilen kurallar, standartlar ve yetenek (skill) setleri **`docs/skills/`** dizini altında tutulmaktadır (Örneğin: `docs/skills/react-best-practices`). 

Ajanlar olarak görevleri yerine getirirken:
1. **İlgili Skill'leri Kontrol Edin:** Geliştirme yapacağınız teknoloji ile ilgili (örneğin React) bu klasörde bir yetenek seti olup olmadığını kontrol edin.
2. **Kuralları Okuyun:** Eğer varsa, kod yazmaya başlamadan önce o yeteneğe ait olan `SKILL.md` veya `AGENTS.md` dosyalarını (örn: `docs/skills/react-best-practices/SKILL.md`) mutlaka okuyun.
3. **Uygulayın:** İlgili skill dosyalarında belirtilen tüm tasarım kalıplarına (design patterns), dosya yapısına ve kod standartlarına katı bir şekilde uyun. İstisnai bir durum olmadıkça o kuralların dışına çıkmayın. Sonrasına projenin genel yapısına uygun olarak kod yazmaya başlayın. 

Örnek workflow:
- Task: "React component yaz" -> wiki_schema.md'yi oku -> Agent bakıyor -> "Ah, `docs/skills/react-best-practices` var. Okuyayım." -> Kuralları anladım -> Proje yapısını öğrendim. -> Kod yazmaya başlıyor.
