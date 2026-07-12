#!/usr/bin/env python3
"""
Kullanılmayan/boş msgstr'leri doldurur (en, bg, sq).
Kullanım: python scripts/translate_empty.py
"""

from pathlib import Path
import polib

BASE = Path(__file__).resolve().parent.parent / "locale"

# =============================================================================
# İngilizce (en) çeviriler — Turkish → English
# =============================================================================
EN_TRANSLATIONS = {
    "Smart Table": "Smart Table",
    "Derecelendirme": "Rating",
    "Evet / Hayır": "Yes / No",
    "Seçenek": "Option",
    "Genel": "General",
    "NPS": "NPS",
    "Yemek": "Food",
    "Servis": "Service",
    "İncelendi": "Reviewed",
    "Smart Table üzerinde aktif": "Active on Smart Table",
    "Anket": "Survey",
    "Anketler": "Surveys",
    "Soru": "Question",
    "Cevap tipi": "Answer Type",
    "Analitik rol": "Analytics Role",
    "Zorunlu": "Required",
    "Yer tutucu": "Placeholder",
    "Maks puan": "Max Score",
    "Anket sorusu": "Survey Question",
    "Anket soruları": "Survey Questions",
    "Soru seçeneği": "Question Option",
    "Soru seçenekleri": "Question Options",
    "Oturum anahtarı": "Session Key",
    "Anket oturum durumu": "Survey Session Status",
    "Anket oturum durumları": "Survey Session Statuses",
    "Hız puanı": "Speed Score",
    "İlgi notu": "Interest Note",
    "Anket yanıtı": "Survey Response",
    "Seçilen seçenek": "Selected Option",
    "Puan": "Score",
    "Soru yanıtı": "Question Answer",
    "NPS soruları yalnızca derecelendirme tipinde olabilir.": "NPS questions can only be of rating type.",
    "{index + 1}. soru için en az bir seçenek gerekli.": "At least one option is required for question {index + 1}.",
    "{index + 1}. soruda seçenekler yalnızca Seçenek tipi için tanımlanabilir.": "Options can only be defined for Option type in question {index + 1}.",
    "Evet": "Yes",
    "Hayır": "No",
    "Satır Maliyet Snapshot": "Line Cost Snapshot",
    "Sipariş Ingredient Maliyet Kaydı": "Order Ingredient Cost Record",
    "Sipariş Ingredient Maliyet Kayıtları": "Order Ingredient Cost Records",
    "UYARI": "WARNING",
    "İADE": "RETURN",
    "İPTAL": "CANCEL",
    "İMHA": "DISPOSAL",
    "Menü Etiketi": "Menu Tag",
    "Menü Etiketleri": "Menu Tags",
    "Etiketsiz filtresi": "Untagged Filter",
    "True ise yalnızca etiketsiz ürün ve kategoriler gösterilir.": "If true, only untagged products and categories are shown.",
    "Menü Katalog Ayarı": "Menu Catalog Setting",
    "Etiketsiz": "Untagged",
    "Etiketler": "Tags",
    "Kalori (kCal)": "Calories (kcal)",
    "Ürün kendisini öneremez.": "A product cannot recommend itself.",
    "Aynı ürün birden fazla kez önerilemez.": "The same product cannot be recommended more than once.",
    "Müşteri Smart Table üzerinden iptal etti": "Customer cancelled via Smart Table",
    "Yıldız": "Star",
    "Bulmaca": "Puzzle",
    "Köpek": "Dog",
    "Ingredient mod": "Ingredient Mode",
    "Product mod": "Product Mode",
    "Karma mod": "Mixed Mode",
    "Ürün bazlı sapma yok": "No product-based variance",
    "Yalnızca stok bazlı sapma": "Stock-based variance only",
    "Menü Mühendisliği Raporu": "Menu Engineering Report",
    "Ürün bazlı tahmini kârlılık ve menü sınıflandırma raporu.": "Product-based estimated profitability and menu classification report.",
    "Gerçek Brüt Kar": "Actual Gross Profit",
    "Tahmini Brüt Kar": "Estimated Gross Profit",
    "Gerçek Marj %": "Actual Margin %",
    "Yıldız:": "Star:",
    "Bulmaca:": "Puzzle:",
    "At:": "Plow Horse:",
    "Köpek:": "Dog:",
    "Tam kapsanan:": "Full Coverage:",
    "Kısmi kapsanan:": "Partial Coverage:",
    "Gerçek Kar": "Actual Profit",
    "Marj %": "Margin %",
    "Toplam stok sapma maliyeti:": "Total Stock Variance Cost:",
    "Fire:": "Waste:",
    "KAPALI": "CLOSED",
    "%(model)s kaydı (%(record)s)": "%(model)s record (%(record)s)",
    "ve %(count)s kayıt daha": "and %(count)s more record",
    "ve %(count)s kayıt daha_plural": "and %(count)s more records",
    "Kayıt silinemiyor. Şu kayıtlarda kullanılıyor: %(refs)s.": "Cannot delete record. It is used in: %(refs)s.",
    "Örnek bağımlılıklar: %(refs)s.": "Example dependencies: %(refs)s.",
    "Zorla silme limiti (%(limit)s kayıt) aşıldı.": "Force delete limit (%(limit)s records) exceeded.",
    "Bağımlılık zinciri çok derin; zorla silme iptal edildi.": "Dependency chain too deep; force delete cancelled.",
    "Kayıt kalıcı olarak silindi: %(target)s. Birlikte silinen bağımlı kayıtlar: %(deps)s.": "Record permanently deleted: %(target)s. Deleted dependent records: %(deps)s.",
}

# =============================================================================
# Bulgarca (bg) çeviriler — Turkish → Bulgarian
# =============================================================================
BG_TRANSLATIONS = {
    "Smart Table": "Smart Table",
    "Derecelendirme": "Оценка",
    "Evet / Hayır": "Да / Не",
    "Seçenek": "Опция",
    "Genel": "Общо",
    "NPS": "NPS",
    "Yemek": "Храна",
    "Servis": "Обслужване",
    "İncelendi": "Прегледано",
    "Smart Table üzerinde aktif": "Активен на Smart Table",
    "Anket": "Анкета",
    "Anketler": "Анкети",
    "Soru": "Въпрос",
    "Cevap tipi": "Тип на отговора",
    "Analitik rol": "Аналитична роля",
    "Zorunlu": "Задължително",
    "Yer tutucu": "Заместител",
    "Maks puan": "Макс. точки",
    "Anket sorusu": "Въпрос от анкета",
    "Anket soruları": "Въпроси от анкета",
    "Soru seçeneği": "Опция на въпрос",
    "Soru seçenekleri": "Опции на въпрос",
    "Oturum anahtarı": "Ключ на сесия",
    "Anket oturum durumu": "Статус на сесия за анкета",
    "Anket oturum durumları": "Статуси на сесия за анкета",
    "Hız puanı": "Оценка за скорост",
    "İlgi notu": "Бележка за интерес",
    "Anket yanıtı": "Отговор на анкета",
    "Seçilen seçenek": "Избрана опция",
    "Puan": "Точки",
    "Soru yanıtı": "Отговор на въпрос",
    "NPS soruları yalnızca derecelendirme tipinde olabilir.": "NPS въпросите могат да бъдат само от тип оценка.",
    "{index + 1}. soru için en az bir seçenek gerekli.": "Необходима е поне една опция за въпрос {index + 1}.",
    "{index + 1}. soruda seçenekler yalnızca Seçenek tipi için tanımlanabilir.": "Опции могат да се дефинират само за тип Опция във въпрос {index + 1}.",
    "Evet": "Да",
    "Hayır": "Не",
    "Satır Maliyet Snapshot": "Моментна снимка на разход за ред",
    "Sipariş Ingredient Maliyet Kaydı": "Запис на разход за съставка в поръчка",
    "Sipariş Ingredient Maliyet Kayıtları": "Записи на разход за съставка в поръчка",
    "UYARI": "ПРЕДУПРЕЖДЕНИЕ",
    "İADE": "ВРЪЩАНЕ",
    "İPTAL": "ОТМЯНА",
    "İMHA": "УНИЩОЖАВАНЕ",
    "Menü Etiketi": "Етикет на меню",
    "Menü Etiketleri": "Етикети на меню",
    "Etiketsiz filtresi": "Филтър без етикет",
    "True ise yalnızca etiketsiz ürün ve kategoriler gösterilir.": "Ако е True, се показват само продукти и категории без етикет.",
    "Menü Katalog Ayarı": "Настройка на каталог на меню",
    "Etiketsiz": "Без етикет",
    "Etiketler": "Етикети",
    "Kalori (kCal)": "Калории (kcal)",
    "Ürün kendisini öneremez.": "Продукт не може да препоръчва себе си.",
    "Aynı ürün birden fazla kez önerilemez.": "Един и същ продукт не може да бъде препоръчан повече от веднъж.",
    "Müşteri Smart Table üzerinden iptal etti": "Клиентът отмени чрез Smart Table",
    "Yıldız": "Звезда",
    "Bulmaca": "Пъзел",
    "Köpek": "Куче",
    "Ingredient mod": "Режим на съставки",
    "Product mod": "Режим на продукти",
    "Karma mod": "Смесен режим",
    "Ürün bazlı sapma yok": "Няма отклонение на база продукт",
    "Yalnızca stok bazlı sapma": "Само отклонение на база наличност",
    "Menü Mühendisliği Raporu": "Доклад по меню инженеринг",
    "Ürün bazlı tahmini kârlılık ve menü sınıflandırma raporu.": "Доклад за прогнозна рентабилност на база продукт и класификация на меню.",
    "Gerçek Brüt Kar": "Реален брутен приход",
    "Tahmini Brüt Kar": "Прогнозен брутен приход",
    "Gerçek Marj %": "Реален марж %",
    "Yıldız:": "Звезда:",
    "Bulmaca:": "Пъзел:",
    "At:": "Работен кон:",
    "Köpek:": "Куче:",
    "Tam kapsanan:": "Пълно покритие:",
    "Kısmi kapsanan:": "Частично покритие:",
    "Gerçek Kar": "Реална печалба",
    "Marj %": "Марж %",
    "Toplam stok sapma maliyeti:": "Обща цена на отклонение в наличността:",
    "Fire:": "Отпадък:",
    "KAPALI": "ЗАТВОРЕН",
    "%(model)s kaydı (%(record)s)": "%(model)s запис (%(record)s)",
    "ve %(count)s kayıt daha": "и още %(count)s запис",
    "ve %(count)s kayıt daha_plural": "и още %(count)s записа",
    "Kayıt silinemiyor. Şu kayıtlarda kullanılıyor: %(refs)s.": "Записът не може да бъде изтрит. Използва се в: %(refs)s.",
    "Örnek bağımlılıklar: %(refs)s.": "Примерни зависимости: %(refs)s.",
    "Zorla silme limiti (%(limit)s kayıt) aşıldı.": "Лимитът за принудително изтриване (%(limit)s записа) е надвишен.",
    "Bağımlılık zinciri çok derin; zorla silme iptal edildi.": "Веригата на зависимости е твърде дълбока; принудителното изтриване е отменено.",
    "Kayıt kalıcı olarak silindi: %(target)s. Birlikte silinen bağımlı kayıtlar: %(deps)s.": "Записът е окончателно изтрит: %(target)s. Изтрити зависими записи: %(deps)s.",
}

# =============================================================================
# Arnavutça (sq) çeviriler — Turkish → Albanian
# =============================================================================
SQ_TRANSLATIONS = {
    "Smart Table": "Smart Table",
    "Derecelendirme": "Vlerësim",
    "Evet / Hayır": "Po / Jo",
    "Seçenek": "Opsion",
    "Genel": "Përgjithshëm",
    "NPS": "NPS",
    "Yemek": "Ushqim",
    "Servis": "Shërbim",
    "İncelendi": "Shqyrtuar",
    "Smart Table üzerinde aktif": "Aktiv në Smart Table",
    "Anket": "Anketë",
    "Anketler": "Anketa",
    "Soru": "Pyetje",
    "Cevap tipi": "Lloji i përgjigjes",
    "Analitik rol": "Rol analitik",
    "Zorunlu": "I detyrueshëm",
    "Yer tutucu": "Vendmbajtës",
    "Maks puan": "Pikët maksimale",
    "Anket sorusu": "Pyetje ankete",
    "Anket soruları": "Pyetje ankete",
    "Soru seçeneği": "Opsion pyetjeje",
    "Soru seçenekleri": "Opsione pyetjesh",
    "Oturum anahtarı": "Çelës sesioni",
    "Anket oturum durumu": "Status i sesionit të anketës",
    "Anket oturum durumları": "Statuse të sesionit të anketës",
    "Hız puanı": "Pikët e shpejtësisë",
    "İlgi notu": "Shënim interesi",
    "Anket yanıtı": "Përgjigje ankete",
    "Seçilen seçenek": "Opsioni i zgjedhur",
    "Puan": "Pikë",
    "Soru yanıtı": "Përgjigje pyetjeje",
    "NPS soruları yalnızca derecelendirme tipinde olabilir.": "Pyetjet NPS mund të jenë vetëm të llojit të vlerësimit.",
    "{index + 1}. soru için en az bir seçenek gerekli.": "Të paktën një opsion kërkohet për pyetjen {index + 1}.",
    "{index + 1}. soruda seçenekler yalnızca Seçenek tipi için tanımlanabilir.": "Opsionet mund të përcaktohen vetëm për llojin Opsion në pyetjen {index + 1}.",
    "Evet": "Po",
    "Hayır": "Jo",
    "Satır Maliyet Snapshot": "Foto e kostos së rreshtit",
    "Sipariş Ingredient Maliyet Kaydı": "Regjistër i kostos së përbërësve të porosisë",
    "Sipariş Ingredient Maliyet Kayıtları": "Regjistra të kostos së përbërësve të porosisë",
    "UYARI": "PARALAJMËRIM",
    "İADE": "KTHIM",
    "İPTAL": "ANULIM",
    "İMHA": "ASGJËSIM",
    "Menü Etiketi": "Etiketë menuje",
    "Menü Etiketleri": "Etiketa menuje",
    "Etiketsiz filtresi": "Filtër pa etiketë",
    "True ise yalnızca etiketsiz ürün ve kategoriler gösterilir.": "Nëse True, shfaqen vetëm produktet dhe kategoritë pa etiketë.",
    "Menü Katalog Ayarı": "Cilësim i katalogut të menusë",
    "Etiketsiz": "Pa etiketë",
    "Etiketler": "Etiketa",
    "Kalori (kCal)": "Kalori (kcal)",
    "Ürün kendisini öneremez.": "Një produkt nuk mund të rekomandojë veten.",
    "Aynı ürün birden fazla kez önerilemez.": "I njëjti produkt nuk mund të rekomandohet më shumë se një herë.",
    "Müşteri Smart Table üzerinden iptal etti": "Klienti anuloi përmes Smart Table",
    "Yıldız": "Yll",
    "Bulmaca": "Puzzle",
    "Köpek": "Qen",
    "Ingredient mod": "Modalitet i përbërësve",
    "Product mod": "Modalitet i produkteve",
    "Karma mod": "Modalitet i përzier",
    "Ürün bazlı sapma yok": "Pa devijim bazuar në produkt",
    "Yalnızca stok bazlı sapma": "Vetëm devijim bazuar në stok",
    "Menü Mühendisliği Raporu": "Raport i inxhinierisë së menusë",
    "Ürün bazlı tahmini kârlılık ve menü sınıflandırma raporu.": "Raport i përfitueshmërisë së parashikuar bazuar në produkt dhe klasifikimit të menusë.",
    "Gerçek Brüt Kar": "Fitimi Bruto Aktual",
    "Tahmini Brüt Kar": "Fitimi Bruto i Parashikuar",
    "Gerçek Marj %": "Marzhi Aktual %",
    "Yıldız:": "Yll:",
    "Bulmaca:": "Puzzle:",
    "At:": "Kalë pune:",
    "Köpek:": "Qen:",
    "Tam kapsanan:": "Mbulim i plotë:",
    "Kısmi kapsanan:": "Mbulim i pjesshëm:",
    "Gerçek Kar": "Fitimi Aktual",
    "Marj %": "Marzhi %",
    "Toplam stok sapma maliyeti:": "Kosto totale e devijimit të stokut:",
    "Fire:": "Humbje:",
    "KAPALI": "MBYLLUR",
    "%(model)s kaydı (%(record)s)": "Regjistrim %(model)s (%(record)s)",
    "ve %(count)s kayıt daha": "dhe %(count)s regjistrim tjetër",
    "ve %(count)s kayıt daha_plural": "dhe %(count)s regjistrime të tjera",
    "Kayıt silinemiyor. Şu kayıtlarda kullanılıyor: %(refs)s.": "Regjistrimi nuk mund të fshihet. Përdoret në: %(refs)s.",
    "Örnek bağımlılıklar: %(refs)s.": "Shembull varësish: %(refs)s.",
    "Zorla silme limiti (%(limit)s kayıt) aşıldı.": "Limiti i fshirjes së detyruar (%(limit)s regjistrime) u tejkalua.",
    "Bağımlılık zinciri çok derin; zorla silme iptal edildi.": "Zinxhiri i varësisë është shumë i thellë; fshirja e detyruar u anulua.",
    "Kayıt kalıcı olarak silindi: %(target)s. Birlikte silinen bağımlı kayıtlar: %(deps)s.": "Regjistrimi u fshi përgjithmonë: %(target)s. Regjistrime të varura të fshira: %(deps)s.",
}


def update_po(lang: str, translations: dict) -> None:
    po_path = BASE / lang / "LC_MESSAGES" / "django.po"
    if not po_path.exists():
        print(f"[{lang}] .po dosyası bulunamadı: {po_path}")
        return

    po = polib.pofile(str(po_path))
    updated = 0
    not_found = 0

    for entry in po:
        if entry.obsolete or not entry.msgid:
            continue
        if entry.msgstr:
            continue  # zaten çevrilmiş

        key = entry.msgid
        # Plural form için
        if entry.msgid_plural:
            plural_key = f"{key}_plural"

        if key in translations:
            entry.msgstr = translations[key]
            updated += 1
        elif entry.msgid_plural and plural_key in translations:
            entry.msgstr = translations[key]  # singular
            entry.msgstr_plural = [translations[key], translations[plural_key]]
            updated += 1
        else:
            not_found += 1
            print(f"[{lang}] Çeviri bulunamadı: {key}")

    po.save(str(po_path))
    print(f"[{lang}] Güncellendi: {updated} çeviri eklendi, {not_found} atlandı.")


def main() -> None:
    update_po("en", EN_TRANSLATIONS)
    update_po("bg", BG_TRANSLATIONS)
    update_po("sq", SQ_TRANSLATIONS)

    # .mo derlemesi
    print("\n=== .mo derlemesi ===")
    for po_path in sorted(BASE.glob("*/LC_MESSAGES/django.po")):
        lang = po_path.parent.parent.name
        if lang not in ("en", "bg", "sq"):
            continue
        po = polib.pofile(str(po_path))
        mo_path = po_path.with_suffix(".mo")
        po.save_as_mofile(str(mo_path))
        print(f"  Wrote {mo_path}")

    print("\nTüm işlem tamamlandı.")


if __name__ == "__main__":
    main()
