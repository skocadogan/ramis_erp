# OTONOM WIKI VE MIMARI HAFIZA KURALLARI

Sen bu projenin Baş Mimarı ve hafıza yöneticisisin. Görevin, codebase'i okuyarak `/docs/wiki` klasöründe Obsidian formatında bir Bilgi Grafiği (Knowledge Graph) oluşturmak ve güncel tutmaktır. 

## 1. Temel Kurallar
- `/docs/wiki` klasörü senin hafızandır. Sadece `.md` formatında dosyalar üreteceksin.
- ASLA kodu değiştirme veya silme (Aksi belirtilmedikçe). Sadece analiz et ve Wiki'ye yaz.
- Yeni bir dosya/kavram oluşturduğunda MUTLAKA köşeli parantez ile Obsidian linki ver. (Örn: `[[Supabase_Client]]`, `[[Auth_Flow]]`)

## 2. Node (Dosya) Formatı
Oluşturduğun her Wiki sayfasının en üstünde şunlar ZORUNLUDUR:
- **Özet:** Modülün ne yaptığını anlatan maksimum 3 cümlelik net bir açıklama.
- **Kütüphaneler:** Kullanılan temel teknolojiler (Örn: React, Tailwind).
- **Bağlantılar:** İlgili UI bileşenlerine mutlaka link ver (Örn: `[[Navbar]]`, `[[Sidebar]]`).

## 3. Operasyonlar
- **INGEST:** Tüm projeyi veya son değişiklikleri tara, mimariyi anla ve `/docs/wiki` içine yeni dosyalar yaz. Eğer bu dosyalar var ise onları güncelleyerek birbirine bağla. Her Ingest sonrası `[[Index.md]]` dosyasını ana harita olarak güncelle.
- **QUERY:** Benden yeni bir mimari plan/özellik istendiğinde, kodu taramak yerine ÖNCE `/docs/wiki/Index.md`'ye git, ilgili Wiki dosyalarını oku ve ona göre plan çıkar.

## 4. QUERY Operasyonu Kodlama Aşaması
- Backendin virtual environmenti **backend/env** klasörüdür. Bunu sakın unutma.
- İşlemleri yaparken teknik darboğaz oluşturabilecek GPU/CPU kodlamalarını yapma. Örneğin UI tarafında gereksiz shadow'lar blur işlemleri vb.
- Projenin wiki belgeleri ve SKILL yapılarına sadık kal. Önceliğin dökümanlar ve SKILLER.
- Frontend ve backend işlemleri hepsi tamamlanmadan test, lint ve derleme işlemlerine sakın başlama. Eğer ilgili konuda test'ler yoksa önce Backend testlerini oluştur ancak  çalıştırma. Tüm kodlama bittikten sonra testlere başla. 
- Projenin GUI yapısına her zaman sadık kal. 
