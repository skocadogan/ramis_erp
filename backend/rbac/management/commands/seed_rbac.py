"""
Seed RBAC data: categories, permissions, and default roles.
Usage:
    python manage.py seed_rbac
    python manage.py seed_rbac --reset
    python manage.py seed_rbac --lang en --update   # yalnızca mevcut izinlerin açıklaması (description)
    python manage.py seed_rbac --dry-run
"""
from django.core.management.base import BaseCommand
from rbac.models import PermissionCategory, RolePermission, Role


CATEGORIES = [
    {
        "code": "users",
        "name_tr": "Kullanıcı Yönetimi",
        "name_en": "User Management",
        "name_bg": "Управление на потребители",
        "name_sq": "Menaxhimi i Përdoruesve",
        "description_tr": "Kullanıcı hesapları ve profil yönetimi",
        "description_en": "User accounts and profile management",
        "description_bg": "Управление на потребителски акаунти и профили",
        "description_sq": "Menaxhimi i llogarive të përdoruesve dhe profileve"
    },
    {
        "code": "rbac",
        "name_tr": "Rol & İzin Yönetimi",
        "name_en": "Role & Permission Management",
        "name_bg": "Управление на роли и разрешения",
        "name_sq": "Menaxhimi i Roleve dhe Lejeve",
        "description_tr": "RBAC rol ve izin yapılandırması",
        "description_en": "RBAC role and permission configuration",
        "description_bg": "RBAC конфигурация на роли и разрешения",
        "description_sq": "Konfigurimi i roleve dhe lejeve RBAC"
    },
    {
        "code": "branches",
        "name_tr": "Şube Yönetimi",
        "name_en": "Branch Management",
        "name_bg": "Управление на клонове",
        "name_sq": "Menaxhimi i Degëve",
        "description_tr": "Şube, zone ve masa yönetimi",
        "description_en": "Branch, zone and table management",
        "description_bg": "Управление на клонове, зони и маси",
        "description_sq": "Menaxhimi i degëve, zonave dhe tavolinave"
    },
    {
        "code": "menu",
        "name_tr": "Menü Yönetimi",
        "name_en": "Menu Management",
        "name_bg": "Управление на меню",
        "name_sq": "Menaxhimi i Menysë",
        "description_tr": "Kategori, ürün, varyant ve modifier yönetimi",
        "description_en": "Category, product, variant and modifier management",
        "description_bg": "Управление на категории, продукти, варианти и модификатори",
        "description_sq": "Menaxhimi i kategorive, produkteve, varianteve dhe modifikuesve"
    },
    {
        "code": "orders",
        "name_tr": "Sipariş Yönetimi",
        "name_en": "Order Management",
        "name_bg": "Управление на поръчки",
        "name_sq": "Menaxhimi i Porosive",
        "description_tr": "Sipariş oluşturma, takip ve KDS",
        "description_en": "Order management, tracking and KDS",
        "description_bg": "Управление на поръчки, проследяване и KDS",
        "description_sq": "Menaxhimi i porosive, gjurmimi dhe KDS"
    },
    {
        "code": "inventory",
        "name_tr": "Stok Yönetimi",
        "name_en": "Inventory Management",
        "name_bg": "Управление на инвентар",
        "name_sq": "Menaxhimi i Inventarit",
        "description_tr": "Stok kalemleri, hareketler ve tedarikçiler",
        "description_en": "Inventory items, movements and suppliers",
        "description_bg": "Инвентарни артикули, движения и доставчици",
        "description_sq": "Artikujt e inventarit, lëvizjet dhe furnitorët"
    },
    {
        "code": "recipes",
        "name_tr": "Reçete Yönetimi",
        "name_en": "Recipe Management",
        "name_bg": "Управление на рецепти",
        "name_sq": "Menaxhimi i Recetave",
        "description_tr": "Reçeteler ve malzeme listeleri",
        "description_en": "Recipe and ingredient lists",
        "description_bg": "Рецепти и списъци със съставки",
        "description_sq": "Recetat dhe listat e përbërësve"
    },
    {
        "code": "sales",
        "name_tr": "Satış Yönetimi",
        "name_en": "Sales Management",
        "name_bg": "Управление на продажби",
        "name_sq": "Menaxhimi i Shitjeve",
        "description_tr": "Satış kayıtları, raporlama ve ödeme yönetimi",
        "description_en": "Sales records, reporting and payment management",
        "description_bg": "Продажбени записи, отчети и управление на плащания",
        "description_sq": "Regjistrimet e shitjeve, raportimi dhe menaxhimi i pagesave"
    },
    {
        "code": "pos",
        "name_tr": "Satış Noktası (POS)",
        "name_en": "Point of Sale (POS)",
        "name_bg": "Точка на продажба (POS)",
        "name_sq": "Pika e Shitjes (POS)",
        "description_tr": "Kasa / POS ekranı erişimi ve kasa üzerinden sipariş işlemleri",
        "description_en": "Register / POS screen access and register order operations",
        "description_bg": "Достъп до POS екран и операции с поръчки на каса",
        "description_sq": "Qasje në ekranin POS dhe operacione të porosive në arkë"
    },
    {
        "code": "takeaway",
        "name_tr": "Paket Yönetimi",
        "name_en": "Delivery Management",
        "name_bg": "Управление на доставки",
        "name_sq": "Menaxhimi i Dërgesave",
        "description_tr": "Paket siparişlerin yönetimi, takibi ve teslimatı",
        "description_en": "Delivery order management, tracking and delivery",
        "description_bg": "Управление на поръчки за доставка, проследяване и доставка",
        "description_sq": "Menaxhimi i porosive të dërgesës, gjurmimi dhe dërgesa"
    },
    {
        "code": "warehouse",
        "name_tr": "Depo Yönetimi",
        "name_en": "Warehouse Management",
        "name_bg": "Управление на склад",
        "name_sq": "Menaxhimi i Magazinës",
        "description_tr": "Depo tanımları, satın alma, mal kabul, transfer ve sayım yönetimi",
        "description_en": "Warehouse definitions, purchasing, receiving, transfer and inventory management",
        "description_bg": "Складова дефиниция, покупки, получаване, трансфер и инвентаризация",
        "description_sq": "Përcaktimi i magazinës, blerjet, marrja, transferimi dhe menaxhimi i inventarit"
    },
    {
        "code": "shifts",
        "name_tr": "Kasa / Vardiya",
        "name_en": "Cashier / Shift",
        "name_bg": "Каса / Смяна",
        "name_sq": "Arkë / Ndërrim",
        "description_tr": "Vardiya açma-kapatma, Z raporu ve kasa hareketleri",
        "description_en": "Shift opening-closing, Z report and register movements",
        "description_bg": "Отваряне-затваряне на смяна, Z отчет и касови операции",
        "description_sq": "Hapje-mbyllje e ndërrimit, raporti Z dhe lëvizjet e arkës"
    },
    {
        "code": "dashboard",
        "name_tr": "Dashboard",
        "name_en": "Dashboard",
        "name_bg": "Табло",
        "name_sq": "Paneli",
        "description_tr": "Yönetim özeti ve analitik grafikler",
        "description_en": "Management summary and analytical charts",
        "description_bg": "Управленско резюме и аналитични графики",
        "description_sq": "Përmbledhje menaxheriale dhe grafikë analitikë"
    },
    {
        "code": "invoices",
        "name_tr": "Faturalar",
        "name_en": "Invoices",
        "name_bg": "Фактури",
        "name_sq": "Faturat",
        "description_tr": "Satış faturaları ve PDF çıktısı",
        "description_en": "Sales invoices and PDF output",
        "description_bg": "Продажбени фактури и PDF изход",
        "description_sq": "Faturat e shitjeve dhe dalje PDF"
    },
    {
        "code": "reservations",
        "name_tr": "Rezervasyonlar",
        "name_en": "Reservations",
        "name_bg": "Резервации",
        "name_sq": "Rezervimet",
        "description_tr": "Masa rezervasyonu yönetimi",
        "description_en": "Table reservation management",
        "description_bg": "Управление на резервации за маси",
        "description_sq": "Menaxhimi i rezervimeve të tavolinave"
    },
    {
        "code": "credit",
        "name_tr": "Ödenmez",
        "name_en": "Store Credit",
        "name_bg": "Магазинен кредит",
        "name_sq": "Kredi i Dyqanit",
        "description_tr": "Müşteri kredisi (ödenmez) hesap yönetimi",
        "description_en": "Customer store credit account management",
        "description_bg": "Управление на клиентски магазинен кредит",
        "description_sq": "Menaxhimi i llogarisë së kreditit të klientit"
    },
    {
        "code": "financial",
        "name_tr": "Finansal Bilgi",
        "name_en": "Financial Info",
        "name_bg": "Финансова информация",
        "name_sq": "Informacion Financiar",
        "description_tr": "Tutar ve fiyat bilgilerinin görüntülenmesi",
        "description_en": "Display of amount and price information",
        "description_bg": "Показване на суми и ценова информация",
        "description_sq": "Shfaqja e informacionit të shumave dhe çmimeve"
    },
    {
        "code": "waiter",
        "name_tr": "Garson",
        "name_en": "Waiter",
        "name_bg": "Сервитьор",
        "name_sq": "Kamerier",
        "description_tr": "Garson sipariş ekranı ve masa alanı",
        "description_en": "Waiter order screen and table area",
        "description_bg": "Сервитьорски екран за поръчки и зона за маси",
        "description_sq": "Ekrani i porosive të kamerierit dhe zona e tavolinave"
    },
    {
        "code": "reporting",
        "name_tr": "Raporlama & Şablonlar",
        "name_en": "Reporting & Templates",
        "name_bg": "Отчети и шаблони",
        "name_sq": "Raportim dhe Shabllone",
        "description_tr": "Dinamik rapor ve çıktı şablonları yönetimi",
        "description_en": "Dynamic report and output template management",
        "description_bg": "Управление на динамични отчети и изходни шаблони",
        "description_sq": "Menaxhimi i raporteve dinamike dhe shablloneve të daljes"
    },
    {
        "code": "printing",
        "name_tr": "Yazdırma Yönetimi",
        "name_en": "Printing Management",
        "name_bg": "Управление на печат",
        "name_sq": "Menaxhimi i Shtypjes",
        "description_tr": "Fiziksel yazıcı ve çıktı yönetimi",
        "description_en": "Physical printer and output management",
        "description_bg": "Управление на физически принтери и изход",
        "description_sq": "Menaxhimi i printerëve fizikë dhe daljeve"
    },
    {
        "code": "production_planning",
        "name_tr": "Üretim Planlama & 86",
        "name_en": "Production Planning & 86",
        "name_bg": "Производствено планиране и 86",
        "name_sq": "Planifikimi i Prodhimit dhe 86",
        "description_tr": "Üretim planı, MRP tahmini ve Ürün Kalmadı (86) yönetimi",
        "description_en": "Production plan, MRP forecast and Out of Stock (86) management",
        "description_bg": "Производствен план, MRP прогноза и управление на изчерпани продукти (86)",
        "description_sq": "Plani i prodhimit, parashikimi MRP dhe menaxhimi i produkteve të mbaruara (86)"
    },
    {
        "code": "prep",
        "name_tr": "Hazırlık Yönetimi",
        "name_en": "Prep Management",
        "name_bg": "Управление на подготовка",
        "name_sq": "Menaxhimi i Përgatitjes",
        "description_tr": "Mutfak hazırlık listesi (Prep List) ve şablon yönetimi",
        "description_en": "Kitchen prep list and template management",
        "description_bg": "Кухненски списък за подготовка и управление на шаблони",
        "description_sq": "Lista e përgatitjes së kuzhinës dhe menaxhimi i shablloneve"
    },
    {
        "code": "performances",
        "name_tr": "Performans Yönetimi",
        "name_en": "Performance Management",
        "name_bg": "Управление на производителност",
        "name_sq": "Menaxhimi i Performancës",
        "description_tr": "Garson çağrı performansı ve operasyonel analitik",
        "description_en": "Waiter call performance and operational analytics",
        "description_bg": "Производителност на сервитьорски повиквания и оперативна аналитика",
        "description_sq": "Performanca e thirrjeve të kamerierëve dhe analitika operacionale"
    },
    {
        "code": "audit",
        "name_tr": "Denetim & Uyumluluk",
        "name_en": "Audit & Compliance",
        "name_bg": "Одит и съответствие",
        "name_sq": "Audit dhe Pajtueshmëri",
        "description_tr": "Uygulama genelinde operasyonel denetim izi ve log yönetimi",
        "description_en": "Application-wide operational audit trail and log management",
        "description_bg": "Оперативен одитен запис и управление на логове в приложението",
        "description_sq": "Gjurmë auditimi operacionale dhe menaxhim i regjistrave në të gjithë aplikacionin"
    },
    {
        "code": "customers",
        "name_tr": "Müşteri Yönetimi",
        "name_en": "Customer Management",
        "name_bg": "Управление на клиенти",
        "name_sq": "Menaxhimi i Klientëve",
        "description_tr": "Müşteri tanımları ve analizleri",
        "description_en": "Customer profiles and analytics",
        "description_bg": "Müşteri tanımları",
        "description_sq": "Müşteri tanımları"
    },
    {
        "code": "surveys",
        "name_tr": "Anket Yönetimi",
        "name_en": "Survey Management",
        "name_bg": "Управление на анкети",
        "name_sq": "Menaxhimi i Anketave",
        "description_tr": "Misafir anketleri ve sonuç yönetimi",
        "description_en": "Guest surveys and response management",
        "description_bg": "Управление на анкети за гости и резултати",
        "description_sq": "Menaxhimi i anketave të mysafirëve dhe rezultateve"
    },
]

# İsteğe bağlı description_tr / description_en: --update için kullanılır; yoksa name_{lang} yazılır.
PERMISSIONS = [
    # users
    {"code": "users.view_user", "name_tr": "Kullanıcı Görüntüleme", "name_en": "View User", "name_bg": "Преглед на потребител", "name_sq": "Shiko Përdorues", "category": "users"},
    {"code": "users.manage_user", "name_tr": "Kullanıcı Yönetimi", "name_en": "Manage User", "name_bg": "Управление на потребител", "name_sq": "Menaxho Përdorues", "category": "users"},
    # rbac
    {"code": "rbac.view_role", "name_tr": "Rol Görüntüleme", "name_en": "View Role", "name_bg": "Преглед на роля", "name_sq": "Shiko Rol", "category": "rbac"},
    {"code": "rbac.manage_role", "name_tr": "Rol & İzin Yönetimi", "name_en": "Manage Role & Permission", "name_bg": "Управление на роля и разрешение", "name_sq": "Menaxho Rol dhe Leje", "category": "rbac"},
    # branches
    {"code": "branches.view_branch", "name_tr": "Şube Görüntüleme", "name_en": "View Branch", "name_bg": "Преглед на клон", "name_sq": "Shiko Degë", "category": "branches"},
    {"code": "branches.manage_branch", "name_tr": "Şube Yönetimi", "name_en": "Manage Branch", "name_bg": "Управление на клон", "name_sq": "Menaxho Degë", "category": "branches"},
    {"code": "branches.view_zone", "name_tr": "Bölge Görüntüleme", "name_en": "View Zone", "name_bg": "Преглед на зона", "name_sq": "Shiko Zonë", "category": "branches"},
    {"code": "branches.manage_zone", "name_tr": "Bölge Yönetimi", "name_en": "Manage Zone", "name_bg": "Управление на зона", "name_sq": "Menaxho Zonë", "category": "branches"},
    {"code": "branches.view_table", "name_tr": "Masa Görüntüleme", "name_en": "View Table", "name_bg": "Преглед на маса", "name_sq": "Shiko Tavolinë", "category": "branches"},
    {"code": "branches.manage_table", "name_tr": "Masa Yönetimi", "name_en": "Manage Table", "name_bg": "Управление на маса", "name_sq": "Menaxho Tavolinë", "category": "branches"},
    {"code": "branches.view_station", "name_tr": "Mutfak İstasyonu Görüntüleme", "name_en": "View Kitchen Station", "name_bg": "Преглед на кухненска станция", "name_sq": "Shiko Stacion Kuzhine", "category": "branches"},
    {"code": "branches.manage_station", "name_tr": "Mutfak İstasyonu Yönetimi", "name_en": "Manage Kitchen Station", "name_bg": "Управление на кухненска станция", "name_sq": "Menaxho Stacion Kuzhine", "category": "branches"},
    {"code": "branches.manage_waiter_assignment", "name_tr": "Garson Bölge/Masa Ataması", "name_en": "Waiter Zone/Table Assignment", "name_bg": "Назначение на сервитьор към зона/маса", "name_sq": "Caktim i Kamerierit në Zonë/Tavolinë", "category": "branches"},
    {"code": "branches.manage_cook_assignment", "name_tr": "Aşçı İstasyon Ataması", "name_en": "Cook Station Assignment", "name_bg": "Назначение на готвач към станция", "name_sq": "Caktim i Gatuessit në Stacion", "category": "branches"},
    {"code": "branches.manage_manager_assignment", "name_tr": "Müdür Şube Ataması", "name_en": "Manager Branch Assignment", "name_bg": "Назначение на мениджър към клон", "name_sq": "Caktim i Menaxherit në Degë", "category": "branches"},
    {"code": "branches.change_kds_station", "name_tr": "KDS İstasyon Değiştirme", "name_en": "Change KDS Station", "name_bg": "Смяна на KDS станция", "name_sq": "Ndrysho Stacion KDS", "category": "branches"},
    {"code": "branches.add_kds_waste", "name_tr": "KDS Fire/Zayi Girişi", "name_en": "Add KDS Waste", "name_bg": "Добавяне на KDS отпадък", "name_sq": "Shto Mbetje KDS", "category": "branches"},
    {"code": "branches.add_kds_return_cancel", "name_tr": "KDS İptal/İade Girişi", "name_en": "Add KDS Return/Cancel", "name_bg": "Добавяне на KDS връщане/анулиране", "name_sq": "Shto Kthim/Anulim KDS", "category": "branches"},
    {"code": "branches.view_kds_warehouse", "name_tr": "KDS Bağlı Depo Görüntüleme", "name_en": "View Connected KDS Warehouse", "name_bg": "Преглед на свързан KDS склад", "name_sq": "Shiko Magazinë KDS të Lidhur", "category": "branches"},
    # menu
    {"code": "menu.view_category", "name_tr": "Kategori Görüntüleme", "name_en": "View Category", "name_bg": "Преглед на категория", "name_sq": "Shiko Kategori", "category": "menu"},
    {"code": "menu.manage_category", "name_tr": "Kategori Yönetimi", "name_en": "Manage Category", "name_bg": "Управление на категория", "name_sq": "Menaxho Kategori", "category": "menu"},
    {"code": "menu.view_product", "name_tr": "Ürün Görüntüleme", "name_en": "View Product", "name_bg": "Преглед на продукт", "name_sq": "Shiko Produkt", "category": "menu"},
    {"code": "menu.manage_product", "name_tr": "Ürün Yönetimi", "name_en": "Manage Product", "name_bg": "Управление на продукт", "name_sq": "Menaxho Produkt", "category": "menu"},
    {"code": "menu.view_product_variant", "name_tr": "Ürün Varyantı Görüntüleme", "name_en": "View Product Variant", "name_bg": "Преглед на вариант на продукт", "name_sq": "Shiko Variant Produkti", "category": "menu"},
    {"code": "menu.manage_product_variant", "name_tr": "Ürün Varyantı Yönetimi", "name_en": "Manage Product Variant", "name_bg": "Управление на вариант на продукт", "name_sq": "Menaxho Variant Produkti", "category": "menu"},
    {"code": "menu.view_modifier_group", "name_tr": "Düzenleyici Grup Görüntüleme", "name_en": "View Modifier Group", "name_bg": "Преглед на група модификатори", "name_sq": "Shiko Grup Modifikuesish", "category": "menu"},
    {"code": "menu.manage_modifier_group", "name_tr": "Düzenleyici Grup Yönetimi", "name_en": "Manage Modifier Group", "name_bg": "Управление на група модификатори", "name_sq": "Menaxho Grup Modifikuesish", "category": "menu"},
    {"code": "menu.view_modifier", "name_tr": "Düzenleyici Görüntüleme", "name_en": "View Modifier", "name_bg": "Преглед на модификатор", "name_sq": "Shiko Modifikues", "category": "menu"},
    {"code": "menu.manage_modifier", "name_tr": "Düzenleyici Yönetimi", "name_en": "Manage Modifier", "name_bg": "Управление на модификатор", "name_sq": "Menaxho Modifikues", "category": "menu"},
    {"code": "menu.manage_discount", "name_tr": "Menü İndirim Tanımlama", "name_en": "Define Menu Discount", "name_bg": "Дефиниране на отстъпка от меню", "name_sq": "Përcakto Zbritje Menuje", "category": "menu"},
    # orders
    {"code": "orders.view_order", "name_tr": "Sipariş Görüntüleme", "name_en": "View Order", "name_bg": "Преглед на поръчка", "name_sq": "Shiko Porosi", "category": "orders"},
    {"code": "orders.manage_order", "name_tr": "Sipariş Yönetimi", "name_en": "Manage Order", "name_bg": "Управление на поръчка", "name_sq": "Menaxho Porosi", "category": "orders"},
    {"code": "orders.manage_smart_firing", "name_tr": "Smart Firing (KDS zamanlama — şimdi / ertele)", "name_en": "Smart Firing (KDS timing — now / delay)", "name_bg": "Smart Firing (KDS време — сега / отложи)", "name_sq": "Smart Firing (koha KDS — tani / vonesë)", "category": "orders"},
    {"code": "orders.view_kds", "name_tr": "KDS Görüntüleme", "name_en": "View KDS", "name_bg": "Преглед на KDS", "name_sq": "Shiko KDS", "category": "orders"},
    # inventory
    {"code": "inventory.view_stock_item", "name_tr": "Stok Kalemi Görüntüleme", "name_en": "View Stock Item", "name_bg": "Преглед на складова позиция", "name_sq": "Shiko Artikull Magazine", "category": "inventory"},
    {"code": "inventory.manage_stock_item", "name_tr": "Stok Kalemi Yönetimi", "name_en": "Manage Stock Item", "name_bg": "Управление на складова позиция", "name_sq": "Menaxho Artikull Magazine", "category": "inventory"},
    {"code": "inventory.view_stock_movement", "name_tr": "Stok Hareketi Görüntüleme", "name_en": "View Stock Movement", "name_bg": "Преглед на складова операция", "name_sq": "Shiko Lëvizje Magazine", "category": "inventory"},
    {"code": "inventory.manage_stock_movement", "name_tr": "Stok Hareketi Yönetimi", "name_en": "Manage Stock Movement", "name_bg": "Управление на складова операция", "name_sq": "Menaxho Lëvizje Magazine", "category": "inventory"},
    {"code": "inventory.view_supplier", "name_tr": "Tedarikçi Görüntüleme", "name_en": "View Supplier", "name_bg": "Преглед на доставчик", "name_sq": "Shiko Furnitor", "category": "inventory"},
    {"code": "inventory.manage_supplier", "name_tr": "Tedarikçi Yönetimi", "name_en": "Manage Supplier", "name_bg": "Управление на доставчик", "name_sq": "Menaxho Furnitor", "category": "inventory"},
    {"code": "inventory.view_category", "name_tr": "Stok Kategorisi Görüntüleme", "name_en": "View Stock Category", "name_bg": "Преглед на складова категория", "name_sq": "Shiko Kategori Magazine", "category": "inventory"},
    {"code": "inventory.manage_category", "name_tr": "Stok Kategorisi Yönetimi", "name_en": "Manage Stock Category", "name_bg": "Управление на складова категория", "name_sq": "Menaxho Kategori Magazine", "category": "inventory"},
    {"code": "inventory.view_stock_unit", "name_tr": "Stok Birimi Görüntüleme", "name_en": "View Stock Unit", "name_bg": "Преглед на складова единица", "name_sq": "Shiko Njësi Magazine", "category": "inventory"},
    {"code": "inventory.manage_stock_unit", "name_tr": "Stok Birimi Yönetimi", "name_en": "Manage Stock Unit", "name_bg": "Управление на складова единица", "name_sq": "Menaxho Njësi Magazine", "category": "inventory"},
    {"code": "inventory.view_allergen", "name_tr": "Alerjen Görüntüleme", "name_en": "View Allergen", "name_bg": "Преглед на алерген", "name_sq": "Shiko Alergjen", "category": "inventory"},
    {"code": "inventory.manage_allergen", "name_tr": "Alerjen Yönetimi", "name_en": "Manage Allergen", "name_bg": "Управление на алерген", "name_sq": "Menaxho Alergjen", "category": "inventory"},
    {"code": "inventory.view_expiry_risk", "name_tr": "SKT Risk Görüntüleme", "name_en": "View Expiry Risk", "name_bg": "Преглед на риск от изтичане на срок", "name_sq": "Shiko Risk Skadimi", "category": "inventory"},
    {"code": "inventory.manage_expiry_action", "name_tr": "SKT Aksiyon Yönetimi", "name_en": "Manage Expiry Action", "name_bg": "Управление на действие при изтичане на срок", "name_sq": "Menaxho Veprim Skadimi", "category": "inventory"},
    {"code": "inventory.view_return_cancel", "name_tr": "Stok İptal/İade Görüntüleme", "name_en": "View Stock Return/Cancel", "name_bg": "Преглед на стоково връщане/анулиране", "name_sq": "Shiko Kthim/Anulim Stoku", "category": "inventory"},
    {"code": "inventory.manage_return_cancel", "name_tr": "Stok İptal/İade Yönetimi", "name_en": "Manage Stock Return/Cancel", "name_bg": "Управление на стоково връщане/анулиране", "name_sq": "Menaxho Kthim/Anulim Stoku", "category": "inventory"},
    {"code": "inventory.view_returndisposalflow", "name_tr": "İade/İmha Akışı Görüntüleme", "name_en": "View Return/Disposal Flow", "name_bg": "Преглед на поток връщане/унищожаване", "name_sq": "Shiko Rrjedhë Kthimi/Asgjësimi", "category": "inventory"},
    {"code": "inventory.manage_returndisposalflow", "name_tr": "İade/İmha Akışı Yönetimi", "name_en": "Manage Return/Disposal Flow", "name_bg": "Управление на поток връщане/унищожаване", "name_sq": "Menaxho Rrjedhë Kthimi/Asgjësimi", "category": "inventory"},
    # recipes
    {"code": "recipes.view_recipe", "name_tr": "Reçete Görüntüleme", "name_en": "View Recipe", "name_bg": "Преглед на рецепта", "name_sq": "Shiko Recetë", "category": "recipes"},
    {"code": "recipes.manage_recipe", "name_tr": "Reçete Yönetimi", "name_en": "Manage Recipe", "name_bg": "Управление на рецепта", "name_sq": "Menaxho Recetë", "category": "recipes"},
    {"code": "recipes.delete_recipe", "name_tr": "Reçete Silme", "name_en": "Delete Recipe", "name_bg": "Изтриване на рецепта", "name_sq": "Fshi Recetë", "category": "recipes"},
    {"code": "recipes.view_category", "name_tr": "Reçete Kategorisi Görüntüleme", "name_en": "View Recipe Category", "name_bg": "Преглед на категория рецепти", "name_sq": "Shiko Kategori Recetash", "category": "recipes"},
    {"code": "recipes.manage_category", "name_tr": "Reçete Kategorisi Yönetimi", "name_en": "Manage Recipe Category", "name_bg": "Управление на категория рецепти", "name_sq": "Menaxho Kategori Recetash", "category": "recipes"},
    # sales
    {"code": "sales.view_sale", "name_tr": "Satış Görüntüleme", "name_en": "View Sale", "name_bg": "Преглед на продажба", "name_sq": "Shiko Shitje", "category": "sales"},
    {"code": "sales.manage_sale", "name_tr": "Satış Yönetimi", "name_en": "Manage Sale", "name_bg": "Управление на продажба", "name_sq": "Menaxho Shitje", "category": "sales"},
    # pos
    {"code": "pos.view_pos", "name_tr": "POS Ekranına Erişim", "name_en": "Access POS Screen", "name_bg": "Достъп до POS екран", "name_sq": "Qasje në Ekranin POS", "category": "pos"},
    {"code": "pos.apply_discount", "name_tr": "POS İndirim Uygulama", "name_en": "Apply POS Discount", "name_bg": "Прилагане на POS отстъпка", "name_sq": "Aplikoni Zbritje POS", "category": "pos"},
    {"code": "pos.manage_display", "name_tr": "POS Müşteri Ekranı Yönetimi", "name_en": "Manage POS Customer Display", "name_bg": "Управление на POS дисплей за клиенти", "name_sq": "Menaxho Ekran Klienti POS", "category": "pos"},
    {"code": "pos.force_stock_order", "name_tr": "Yetersiz Stokta Sipariş Geçme Yetkisi", "name_en": "Authorize Order with Insufficient Stock", "name_bg": "Разрешаване на поръчка при недостатъчен запас", "name_sq": "Autorizo Porosi me Stok të Pamjaftueshëm", "category": "pos"},
    {"code": "pos.manage_connections", "name_tr": "POS Bağlantılarını Yönetme", "name_en": "Manage POS Connections", "name_bg": "Управление на POS връзки", "name_sq": "Menaxho Lidhje POS", "category": "pos"},
    {"code": "waiter.access", "name_tr": "Garson Sipariş Uygulaması", "name_en": "Waiter Order App", "name_bg": "Сервитьорско приложение за поръчки", "name_sq": "Aplikacioni i Porosive të Kamerierit", "category": "waiter"},
    # takeaway
    {"code": "takeaway.view_takeaway", "name_tr": "Paket Satışlarını Görüntüle", "name_en": "View Delivery Sales", "name_bg": "Преглед на продажби за доставка", "name_sq": "Shiko Shitje Dërgese", "category": "takeaway"},
    {"code": "takeaway.manage_takeaway", "name_tr": "Paket Sipariş Yönetimi", "name_en": "Delivery Order Management", "name_bg": "Управление на поръчки за доставка", "name_sq": "Menaxhim i Porosive të Dërgesës", "category": "takeaway"},
    # warehouse
    {"code": "warehouse.view_warehouse", "name_tr": "Depo Görüntüleme", "name_en": "View Warehouse", "name_bg": "Преглед на склад", "name_sq": "Shiko Magazinë", "category": "warehouse"},
    {"code": "warehouse.manage_warehouse", "name_tr": "Depo Yönetimi", "name_en": "Manage Warehouse", "name_bg": "Управление на склад", "name_sq": "Menaxho Magazinë", "category": "warehouse"},
    {"code": "warehouse.view_purchase_order", "name_tr": "Satın Alma Siparişi Görüntüleme", "name_en": "View Purchase Order", "name_bg": "Преглед на поръчка за покупка", "name_sq": "Shiko Urdhër Blerjeje", "category": "warehouse"},
    {"code": "warehouse.manage_purchase_order", "name_tr": "Satın Alma Siparişi Yönetimi", "name_en": "Manage Purchase Order", "name_bg": "Управление на поръчка за покупка", "name_sq": "Menaxho Urdhër Blerjeje", "category": "warehouse"},
    {"code": "warehouse.approve_purchase_order", "name_tr": "Satın Alma Siparişi Onaylama", "name_en": "Approve Purchase Order", "name_bg": "Одобряване на поръчка за покупка", "name_sq": "Mirato Urdhër Blerjeje", "category": "warehouse"},
    {"code": "warehouse.place_purchase_order", "name_tr": "Sipariş Verme", "name_en": "Place Order", "name_bg": "Подаване на поръчка", "name_sq": "Bëj Porosi", "category": "warehouse"},
    {"code": "warehouse.edit_purchase_order_post_approval", "name_tr": "Sipariş Düzenleme", "name_en": "Edit Order", "name_bg": "Редактиране на поръчка", "name_sq": "Ndrysho Porosi", "category": "warehouse"},
    {"code": "warehouse.view_goods_receiving", "name_tr": "Mal Kabul Görüntüleme", "name_en": "View Goods Receiving", "name_bg": "Преглед на получаване на стоки", "name_sq": "Shiko Marrje Malrash", "category": "warehouse"},
    {"code": "warehouse.manage_goods_receiving", "name_tr": "Mal Kabul Yönetimi", "name_en": "Manage Goods Receiving", "name_bg": "Управление на получаване на стоки", "name_sq": "Menaxho Marrje Malrash", "category": "warehouse"},
    {"code": "warehouse.view_transfer", "name_tr": "Transfer Görüntüleme", "name_en": "View Transfer", "name_bg": "Преглед на трансфер", "name_sq": "Shiko Transferim", "category": "warehouse"},
    {"code": "warehouse.manage_transfer", "name_tr": "Transfer Yönetimi", "name_en": "Manage Transfer", "name_bg": "Управление на трансфер", "name_sq": "Menaxho Transferim", "category": "warehouse"},
    {"code": "warehouse.approve_transfer", "name_tr": "Transfer Onaylama", "name_en": "Approve Transfer", "name_bg": "Одобряване на трансфер", "name_sq": "Mirato Transferim", "category": "warehouse"},
    {"code": "warehouse.view_stock_counting", "name_tr": "Stok Sayımı Görüntüleme", "name_en": "View Stock Counting", "name_bg": "Преглед на инвентаризация", "name_sq": "Shiko Numërim Magazine", "category": "warehouse"},
    {"code": "warehouse.manage_stock_counting", "name_tr": "Stok Sayımı Yönetimi", "name_en": "Manage Stock Counting", "name_bg": "Управление на инвентаризация", "name_sq": "Menaxho Numërim Magazine", "category": "warehouse"},
    {"code": "warehouse.approve_stock_counting", "name_tr": "Stok Sayımı Onaylama", "name_en": "Approve Stock Counting", "name_bg": "Одобряване на инвентаризация", "name_sq": "Mirato Numërim Magazine", "category": "warehouse"},
    {"code": "warehouse.delete_stock_counting_final", "name_tr": "Tamamlanmış Stok Sayımı Silme", "name_en": "Delete Completed Stock Counting", "name_bg": "Изтриване на завършена инвентаризация", "name_sq": "Fshi Numërim të Përfunduar", "category": "warehouse"},
    {"code": "warehouse.view_deficiency_report", "name_tr": "Eksik Listesi Görüntüleme", "name_en": "View Deficiency List", "name_bg": "Преглед на списък с дефицити", "name_sq": "Shiko Listë Mungesash", "category": "warehouse"},
    {"code": "warehouse.manage_deficiency_report", "name_tr": "Eksik Listesi Yönetimi", "name_en": "Manage Deficiency List", "name_bg": "Управление на списък с дефицити", "name_sq": "Menaxho Listë Mungesash", "category": "warehouse"},
    {"code": "warehouse.view_purchase_recommendation", "name_tr": "Satın Alma Önerisi Görüntüleme", "name_en": "View Purchase Recommendation", "name_bg": "Преглед на препоръка за покупка", "name_sq": "Shiko Rekomandim Blerjeje", "category": "warehouse"},
    {"code": "warehouse.commit_purchase_recommendation", "name_tr": "Satın Alma Önerisini PO'ya Dönüştürme", "name_en": "Commit Purchase Recommendation", "name_bg": "Потвърждаване на препоръка за покупка", "name_sq": "Angazho Rekomandim Blerjeje", "category": "warehouse"},
    # shifts
    {"code": "shifts.view_shift", "name_tr": "Vardiya Görüntüleme", "name_en": "View Shift", "name_bg": "Преглед на смяна", "name_sq": "Shiko Ndërrim", "category": "shifts"},
    {"code": "shifts.manage_shift", "name_tr": "Vardiya Yönetimi", "name_en": "Manage Shift", "name_bg": "Управление на смяна", "name_sq": "Menaxho Ndërrim", "category": "shifts"},
    {"code": "shifts.close_shift", "name_tr": "Vardiya Kapatma", "name_en": "Close Shift", "name_bg": "Затваряне на смяна", "name_sq": "Mbyll Ndërrim", "category": "shifts"},
    {"code": "shifts.edit_closed_shift", "name_tr": "Kapanmış Vardiya Düzenleme", "name_en": "Edit Closed Shift", "name_bg": "Редактиране на затворена смяна", "name_sq": "Ndrysho Ndërrim të Mbyllur", "category": "shifts"},
    {"code": "shifts.view_cashier_pin", "name_tr": "Kasiyer PIN Görüntüleme", "name_en": "View Cashier PIN", "name_bg": "Преглед на касиер PIN", "name_sq": "Shiko PIN Arkëtari", "category": "shifts"},
    {"code": "shifts.manage_cashier_pin", "name_tr": "Kasiyer PIN Yönetimi", "name_en": "Manage Cashier PIN", "name_bg": "Управление на касиер PIN", "name_sq": "Menaxho PIN Arkëtari", "category": "shifts"},
    # dashboard
    {"code": "dashboard.view_dashboard", "name_tr": "Dashboard Görüntüleme", "name_en": "View Dashboard", "name_bg": "Преглед на табло", "name_sq": "Shiko Panel", "category": "dashboard"},
    # invoices
    {"code": "invoices.view_invoice", "name_tr": "Fatura Görüntüleme", "name_en": "View Invoice", "name_bg": "Преглед на фактура", "name_sq": "Shiko Faturë", "category": "invoices"},
    {"code": "invoices.manage_invoice", "name_tr": "Fatura Yönetimi", "name_en": "Manage Invoice", "name_bg": "Управление на фактура", "name_sq": "Menaxho Faturë", "category": "invoices"},
    # reservations
    {"code": "reservations.view_reservation", "name_tr": "Rezervasyon Görüntüleme", "name_en": "View Reservation", "name_bg": "Преглед на резервация", "name_sq": "Shiko Rezervim", "category": "reservations"},
    {"code": "reservations.manage_reservation", "name_tr": "Rezervasyon Yönetimi", "name_en": "Manage Reservation", "name_bg": "Управление на резервация", "name_sq": "Menaxho Rezervim", "category": "reservations"},
    # credit
    {"code": "credit.view_account", "name_tr": "Ödenmez Hesabı Görüntüleme", "name_en": "View Store Credit Account", "name_bg": "Преглед на магазинен кредитен акаунт", "name_sq": "Shiko Llogari Krediti Dyqani", "category": "credit"},
    {"code": "credit.manage_account", "name_tr": "Ödenmez Hesabı Yönetimi", "name_en": "Manage Store Credit Account", "name_bg": "Управление на магазинен кредитен акаунт", "name_sq": "Menaxho Llogari Krediti Dyqani", "category": "credit"},
    # financial
    {"code": "financial.view_amount", "name_tr": "Tutar Görüntüleme", "name_en": "View Amount", "name_bg": "Преглед на сума", "name_sq": "Shiko Shumë", "category": "financial"},
    # reporting
    {"code": "reporting.view_report_template", "name_tr": "Rapor Şablonu Görüntüleme", "name_en": "View Report Template", "name_bg": "Преглед на шаблон за отчет", "name_sq": "Shiko Shabllon Raporti", "category": "reporting"},
    {"code": "reporting.manage_report_template", "name_tr": "Rapor Şablonu Yönetimi", "name_en": "Manage Report Template", "name_bg": "Управление на шаблон за отчет", "name_sq": "Menaxho Shabllon Raporti", "category": "reporting"},
    {"code": "reporting.generate_report", "name_tr": "Rapor Oluşturma & Önizleme", "name_en": "Generate & Preview Report", "name_bg": "Генериране и преглед на отчет", "name_sq": "Gjenero dhe Parashiko Raport", "category": "reporting"},
    # printing
    {"code": "printing.view_printer", "name_tr": "Yazıcı Görüntüleme", "name_en": "View Printer", "name_bg": "Преглед на принтер", "name_sq": "Shiko Printer", "category": "printing"},
    {"code": "printing.manage_printer", "name_tr": "Yazıcı Yönetimi", "name_en": "Manage Printer", "name_bg": "Управление на принтер", "name_sq": "Menaxho Printer", "category": "printing"},
    {"code": "printing.direct_print", "name_tr": "Doğrudan Yazdırma", "name_en": "Direct Print", "name_bg": "Директен печат", "name_sq": "Shtypje Direkte", "category": "printing"},
    # production_planning
    {"code": "production_planning.view_plan", "name_tr": "Üretim Planı Görüntüleme", "name_en": "View Production Plan", "name_bg": "Преглед на производствен план", "name_sq": "Shiko Plan Prodhimi", "category": "production_planning"},
    {"code": "production_planning.manage_plan", "name_tr": "Üretim Planı Yönetimi", "name_en": "Manage Production Plan", "name_bg": "Управление на производствен план", "name_sq": "Menaxho Plan Prodhimi", "category": "production_planning"},
    {"code": "production_planning.view_mrp", "name_tr": "MRP Hesaplama Görüntüleme", "name_en": "View MRP Calculation", "name_bg": "Преглед на MRP изчисление", "name_sq": "Shiko Llogaritje MRP", "category": "production_planning"},
    {"code": "production_planning.manage_settings", "name_tr": "Üretim Ayarları Yönetimi", "name_en": "Manage Production Settings", "name_bg": "Управление на производствени настройки", "name_sq": "Menaxho Cilësimet e Prodhimit", "category": "production_planning"},
    {"code": "production_planning.view_86", "name_tr": "Ürün Kalmadı Görüntüleme", "name_en": "View Out of Stock", "name_bg": "Преглед на изчерпани продукти", "name_sq": "Shiko Produkte të Mbaruara", "category": "production_planning"},
    {"code": "production_planning.manage_86", "name_tr": "Ürün Kalmadı Yönetimi", "name_en": "Manage Out of Stock", "name_bg": "Управление на изчерпани продукти", "name_sq": "Menaxho Produkte të Mbaruara", "category": "production_planning"},
    # prep
    {"code": "prep.view_preptask", "name_tr": "Hazırlık Listesi Görüntüleme", "name_en": "View Prep List", "name_bg": "Преглед на списък за подготовка", "name_sq": "Shiko Listë Përgatitjeje", "category": "prep"},
    {"code": "prep.add_preptask", "name_tr": "Yeni Hazırlık Görevi Ekleme", "name_en": "Add New Prep Task", "name_bg": "Добавяне на нова задача за подготовка", "name_sq": "Shto Detyrë të Re Përgatitjeje", "category": "prep"},
    {"code": "prep.manage_templates", "name_tr": "Hazırlık Şablonları Yönetimi", "name_en": "Manage Prep Templates", "name_bg": "Управление на шаблони за подготовка", "name_sq": "Menaxho Shabllone Përgatitjeje", "category": "prep"},
    {"code": "prep.manage_smart_rules", "name_tr": "Akıllı Hazırlık Kuralları Yönetimi", "name_en": "Manage Smart Prep Rules", "name_bg": "Управление на интелигентни правила за подготовка", "name_sq": "Menaxho Rregulla të Mençura Përgatitjeje", "category": "prep"},
    # performances
    {"code": "performances.view_performance", "name_tr": "Performans Görüntüleme", "name_en": "View Performance", "name_bg": "Преглед на производителност", "name_sq": "Shiko Performancë", "category": "performances"},
    {"code": "performances.manage_performance", "name_tr": "Performans Yönetimi", "name_en": "Manage Performance", "name_bg": "Управление на производителност", "name_sq": "Menaxho Performancë", "category": "performances"},
    # audit
    {"code": "audit.view_auditlog", "name_tr": "Denetim Kaydı Görüntüleme", "name_en": "View Audit Log", "name_bg": "Преглед на одитен запис", "name_sq": "Shiko Regjistër Auditi", "category": "audit"},
    {"code": "audit.export_auditlog", "name_tr": "Denetim Kaydı Dışa Aktarma (CSV)", "name_en": "Export Audit Log (CSV)", "name_bg": "Експорт на одитен запис (CSV)", "name_sq": "Eksporto Regjistër Auditi (CSV)", "category": "audit"},
    {"code": "customers.view_customer", "name_tr": "Müşteri Görüntüleme", "name_en": "View Customer", "name_bg": "Преглед на klient", "name_sq": "Shiko Klient", "category": "customers"},
    {"code": "customers.manage_customer", "name_tr": "Müşteri Yönetimi", "name_en": "Manage Customer", "name_bg": "Управление на klient", "name_sq": "Menaxho Klient", "category": "customers"},
    {"code": "surveys.view_survey", "name_tr": "Anket Görüntüleme", "name_en": "View Survey", "name_bg": "Преглед на анкета", "name_sq": "Shiko Anketë", "category": "surveys"},
    {"code": "surveys.manage_survey", "name_tr": "Anket Yönetimi", "name_en": "Manage Survey", "name_bg": "Управление на анкета", "name_sq": "Menaxho Anketë", "category": "surveys"},
    {"code": "surveys.view_response", "name_tr": "Anket Sonucu Görüntüleme", "name_en": "View Survey Response", "name_bg": "Преглед на резултат от анкета", "name_sq": "Shiko Përgjigje Anketimi", "category": "surveys"},
    {"code": "surveys.manage_response", "name_tr": "Anket Sonucu Yönetimi", "name_en": "Manage Survey Response", "name_bg": "Управление на резултат от анкета", "name_sq": "Menaxho Përgjigje Anketimi", "category": "surveys"},
]


ROLES = [
    {
        "name_tr": "Sistem Yöneticisi",
        "name_en": "System Administrator",
        "name_bg": "Системен администратор",
        "name_sq": "Administrator Sistemi",
        "description_tr": "Sistem yöneticisi - tüm yetkilere sahip",
        "description_en": "System administrator - full permissions",
        "description_bg": "Системен администратор - пълни права",
        "description_sq": "Administrator sistemi - leje të plota",
        "parent": None,
        "permissions": "__all__",
    },
    {
        "name_tr": "Şube Müdürü",
        "name_en": "Branch Manager",
        "name_bg": "Мениджър клон",
        "name_sq": "Menaxher Dega",
        "description_tr": "Şube müdürü - kendi şubesinde tam yetki",
        "description_en": "Branch manager - full permissions in own branch",
        "description_bg": "Мениджър клон - пълни права в собствения клон",
        "description_sq": "Menaxher dege - leje të plota në degën e vet",
        "parent": None,
        "permissions": [
            "users.view_user",
            "branches.view_branch", 
            "branches.view_zone", 
            "branches.manage_zone",
            "branches.view_table", 
            "branches.manage_table",
            "branches.manage_waiter_assignment",
            "branches.manage_cook_assignment",
            "branches.manage_manager_assignment",
            "branches.view_station", 
            "branches.manage_station",
            "branches.change_kds_station", 
            "branches.add_kds_waste", 
            "branches.add_kds_return_cancel",
            "branches.view_kds_warehouse",
            "menu.view_category",
            "menu.manage_category",
            "menu.view_product", 
            "menu.manage_product",
            "menu.view_product_variant", 
            "menu.manage_product_variant",
            "menu.view_modifier_group", 
            "menu.manage_modifier_group",
            "menu.view_modifier", 
            "menu.manage_modifier",
            "menu.manage_discount",
            "orders.view_order", 
            "orders.manage_order",
            "orders.manage_smart_firing",
            "orders.view_kds",
            "pos.view_pos", 
            "pos.apply_discount", 
            "pos.manage_display", 
            "pos.force_stock_order",
            "pos.manage_connections",
            "takeaway.view_takeaway", 
            "takeaway.manage_takeaway",
            "customers.view_customer",
            "customers.manage_customer",
            "surveys.view_survey",
            "surveys.manage_survey",
            "surveys.view_response",
            "surveys.manage_response",
            "inventory.view_stock_item", 
            "inventory.manage_stock_item",
            "inventory.view_stock_movement", 
            "inventory.manage_stock_movement",
            "inventory.view_supplier", 
            "inventory.manage_supplier",
            "inventory.view_category", 
            "inventory.manage_category",
            "inventory.view_stock_unit",
            "inventory.manage_stock_unit",
            "inventory.view_allergen",
            "inventory.manage_allergen",
            "inventory.view_expiry_risk",
            "inventory.manage_expiry_action",
            "inventory.view_return_cancel",
            "inventory.manage_return_cancel",
            "inventory.view_returndisposalflow",
            "inventory.manage_returndisposalflow",
            "recipes.view_recipe",
            "recipes.manage_recipe", 
            "recipes.delete_recipe",
            "recipes.view_category", 
            "recipes.manage_category",
            "sales.view_sale", 
            "sales.manage_sale",
            "shifts.view_shift", 
            "shifts.manage_shift", 
            "shifts.close_shift",
            "shifts.edit_closed_shift",
            "shifts.view_cashier_pin",
            "shifts.manage_cashier_pin",
            "dashboard.view_dashboard",
            "invoices.view_invoice", 
            "invoices.manage_invoice",
            "reservations.view_reservation", 
            "reservations.manage_reservation",
            "credit.view_account",
            "credit.manage_account",
            "warehouse.view_warehouse", 
            "warehouse.manage_warehouse",
            "warehouse.view_purchase_order", 
            "warehouse.manage_purchase_order",
            "warehouse.approve_purchase_order",
            "warehouse.place_purchase_order",
            "warehouse.edit_purchase_order_post_approval",
            "warehouse.view_goods_receiving", 
            "warehouse.manage_goods_receiving",
            "warehouse.view_transfer", 
            "warehouse.manage_transfer",
            "warehouse.approve_transfer",
            "warehouse.view_stock_counting", 
            "warehouse.manage_stock_counting",
            "warehouse.approve_stock_counting",
            "warehouse.delete_stock_counting_final",
            "warehouse.view_deficiency_report", 
            "warehouse.manage_deficiency_report",
            "warehouse.view_purchase_recommendation",
            "warehouse.commit_purchase_recommendation",
            "reporting.view_report_template",
            "reporting.manage_report_template", 
            "reporting.generate_report",
            "printing.view_printer", 
            "printing.manage_printer", 
            "printing.direct_print",
            "financial.view_amount",
            "production_planning.view_plan", 
            "production_planning.manage_plan", 
            "production_planning.view_mrp",
            "production_planning.manage_settings", 
            "production_planning.view_86", 
            "production_planning.manage_86",
            "prep.view_preptask", 
            "prep.add_preptask", 
            "prep.manage_templates", 
            "prep.manage_smart_rules",
            "performances.view_performance",
            "performances.manage_performance",
            "audit.view_auditlog",
            "audit.export_auditlog",
        ],
    },
    {
        "name_tr": "Garson",
        "name_en": "Waiter",
        "name_bg": "Сервитьор",
        "name_sq": "Kamerier",
        "description_tr": "Garson - Sipariş Uygulaması",
        "description_en": "Waiter - Order App",
        "description_bg": "Сервитьор - приложение за поръчки",
        "description_sq": "Kamerier - Aplikacion porosish",
        "parent": None,
        "permissions": [
            "waiter.access",
            "menu.view_category", "menu.view_product", "menu.view_product_variant",
            "menu.view_modifier_group", "menu.view_modifier",
            "branches.view_branch", "branches.view_zone", "branches.view_table",
            "orders.view_order", "orders.manage_order",
            "pos.apply_discount",
            "shifts.view_shift",
            "financial.view_amount",
            "production_planning.view_plan",
            "production_planning.view_86",
            "printing.view_printer",
            "printing.direct_print",
            "reporting.view_report_template",
            "reporting.generate_report",
            "takeaway.view_takeaway",
            "takeaway.manage_takeaway",
        ],
    },
    {
        "name_tr": "Kasiyer",
        "name_en": "Cashier",
        "name_bg": "Касиер",
        "name_sq": "Arkëtar",
        "description_tr": "Kasiyer - sipariş oluşturma ve görüntüleme",
        "description_en": "Cashier - order creation and viewing",
        "description_bg": "Касиер - създаване и преглед на поръчки",
        "description_sq": "Arkëtar - krijim dhe shikim porosish",
        "parent": None,
        "permissions": [
            "menu.view_category", 
            "menu.view_product", 
            "menu.view_product_variant",
            "menu.view_modifier_group", 
            "menu.view_modifier",
            "branches.view_branch", 
            "branches.view_zone", 
            "branches.view_table",
            "orders.view_order", 
            "orders.manage_order",
            "pos.view_pos", 
            "pos.apply_discount", 
            "pos.manage_connections",
            "sales.view_sale", 
            "sales.manage_sale",
            "takeaway.view_takeaway", 
            "takeaway.manage_takeaway",
            "shifts.view_shift", 
            "shifts.manage_shift", 
            "shifts.close_shift",
            "dashboard.view_dashboard",
            "invoices.view_invoice", 
            "invoices.manage_invoice",
            "reservations.view_reservation", 
            "reservations.manage_reservation",
            "credit.view_account",
            "financial.view_amount",
            "production_planning.view_plan",
            "production_planning.view_86",
            "printing.view_printer",
            "printing.direct_print",
            "customers.view_customer",
        ],
    },
    {
        "name_tr": "Akıllı Masa",
        "name_en": "Smart Table",
        "name_bg": "Интелигентна маса",
        "name_sq": "Tavolinë e Mençur",
        "description_tr": "Müşteri self-servis masa uygulaması (Smart Table) — şube/masa seçimi, menü, sipariş ve garson çağrısı",
        "description_en": "Customer self-service table app (Smart Table) — branch/table selection, menu, ordering and waiter call",
        "description_bg": "Клиентско самообслужване (Smart Table) — избор на клон/маса, меню, поръчка и повикване на сервитьор",
        "description_sq": "Aplikacion tavoline vetë-shërbimi (Smart Table) — përzgjedhje dege/tavoline, menu, porosi dhe thirrje kamerieri",
        "parent": None,
        "permissions": [
            # GET /branches/, GET /tables/?branch_id=
            "branches.view_branch",
            "branches.view_table",
            # GET /menu/categories/, /menu/products/, ürün detayı (varyant & modifier gömülü)
            "menu.view_category",
            "menu.view_product",
            "menu.view_product_variant",
            "menu.view_modifier_group",
            "menu.view_modifier",
            # GET /orders/main/?table_id= ve POST /orders/main/
            # pos.view_pos: sipariş yazma (orders.manage_order ile); waiter.access kullanılmaz — garson masa kapsamı kısıtı olmaz
            "orders.view_order",
            "orders.manage_order",
            "pos.view_pos",
            # Menü ve sipariş tutarlarının görüntülenmesi
            "financial.view_amount",
        ],
    },
    {
        "name_tr": "Mutfak Personeli",
        "name_en": "Kitchen Staff",
        "name_bg": "Кухненски персонал",
        "name_sq": "Staf Kuzhine",
        "description_tr": "Mutfak personeli - KDS, sipariş durumu, şube/istasyon görüntüleme, stok, eksik liste",
        "description_en": "Kitchen staff - KDS, order status, branch/station viewing, inventory, deficiency list",
        "description_bg": "Кухненски персонал - KDS, статус на поръчки, преглед на клон/станция, инвентар, списък с дефицити",
        "description_sq": "Staf kuzhine - KDS, status porosish, shikim dege/stacioni, inventar, listë mungesash",
        "parent": None,
        "permissions": [
            "menu.view_product", 
            "menu.view_modifier",
            "branches.view_branch",
            "branches.view_station",
            "branches.change_kds_station",
            "branches.add_kds_waste",
            "branches.view_kds_warehouse",
            "orders.view_order",
            "orders.view_kds",
            "orders.manage_smart_firing",
            "inventory.view_stock_item",
            "inventory.view_stock_unit",
            "inventory.view_allergen",
            "recipes.view_recipe",
            "recipes.view_category",
            "warehouse.view_deficiency_report", 
            "warehouse.manage_deficiency_report",
            "production_planning.view_plan", 
            "production_planning.view_86",
            "prep.view_preptask",
        ],
    },
    {
        "name_tr": "Stok Personeli",
        "name_en": "Stock Staff",
        "name_bg": "Складов персонал",
        "name_sq": "Staf Magazine",
        "description_tr": "Stok personeli - stok ve tedarikçi yönetimi",
        "description_en": "Stock staff - inventory and supplier management",
        "description_bg": "Складов персонал - управление на инвентар и доставчици",
        "description_sq": "Staf magazine - menaxhim inventari dhe furnitorësh",
        "parent": None,
        "permissions": [
            "inventory.view_stock_item", 
            "inventory.manage_stock_item",
            "inventory.view_stock_movement", 
            "inventory.manage_stock_movement",
            "inventory.view_supplier", 
            "inventory.manage_supplier",
            "inventory.view_allergen",
            "inventory.manage_allergen",
            "branches.view_station",
            "warehouse.view_warehouse",
            "warehouse.view_purchase_order", 
            "warehouse.manage_purchase_order",
            "warehouse.view_goods_receiving", 
            "warehouse.manage_goods_receiving",
            "warehouse.view_transfer", 
            "warehouse.manage_transfer",
            "warehouse.view_stock_counting", 
            "warehouse.manage_stock_counting",
            "warehouse.view_deficiency_report", 
            "warehouse.manage_deficiency_report",
            "warehouse.view_purchase_recommendation",
            "warehouse.commit_purchase_recommendation",
            "inventory.view_expiry_risk",
            "inventory.manage_expiry_action",
            "financial.view_amount",
        ],
    },
    {
        "name_tr": "Depo Sorumlusu",
        "name_en": "Warehouse Manager",
        "name_bg": "Складов мениджър",
        "name_sq": "Menaxher Magazine",
        "description_tr": "Depo sorumlusu - depo, satın alma, mal kabul, transfer ve sayım tam yetkisi",
        "description_en": "Warehouse manager - full warehouse, purchasing, receiving, transfer and counting permissions",
        "description_bg": "Складов мениджър - пълни права за склад, покупки, получаване, трансфер и инвентаризация",
        "description_sq": "Menaxher magazine - leje të plota për magazinë, blerje, marrje, transferim dhe numërim",
        "parent": None,
        "permissions": [
            "inventory.view_stock_item", 
            "inventory.manage_stock_item",
            "inventory.view_stock_movement", 
            "inventory.manage_stock_movement",
            "inventory.view_supplier", 
            "inventory.manage_supplier",
            "inventory.view_category", 
            "inventory.manage_category",
            "inventory.view_stock_unit", 
            "inventory.manage_stock_unit",
            "inventory.view_allergen",
            "inventory.manage_allergen",
            "branches.view_station",

            "warehouse.view_warehouse", 
            "warehouse.manage_warehouse",
            "warehouse.view_purchase_order", 
            "warehouse.manage_purchase_order",
            "warehouse.approve_purchase_order",
            "warehouse.place_purchase_order",
            "warehouse.edit_purchase_order_post_approval",
            "warehouse.view_goods_receiving", 
            "warehouse.manage_goods_receiving",
            "warehouse.view_transfer", 
            "warehouse.manage_transfer",
            "warehouse.approve_transfer",
            "warehouse.view_stock_counting", 
            "warehouse.manage_stock_counting",
            "warehouse.approve_stock_counting",
            "warehouse.delete_stock_counting_final",
            "warehouse.view_deficiency_report", 
            "warehouse.manage_deficiency_report",
            "warehouse.view_purchase_recommendation",
            "warehouse.commit_purchase_recommendation",
            "inventory.view_expiry_risk",
            "inventory.manage_expiry_action",
            "financial.view_amount",
        ],
    },
    {
        "name_tr": "Görüntüleyici",
        "name_en": "Viewer",
        "name_bg": "Наблюдател",
        "name_sq": "Shikues",
        "description_tr": "Salt okuyucu - sadece görüntüleme yetkileri",
        "description_en": "Read-only - viewing permissions only",
        "description_bg": "Само за четене - само преглед",
        "description_sq": "Vetëm lexim - leje shikimi vetëm",
        "parent": None,
        "permissions": [
            "users.view_user",
            "rbac.view_role",
            "branches.view_branch", 
            "branches.view_zone", 
            "branches.view_table",
            "branches.view_station",
            "menu.view_category", 
            "menu.view_product", 
            "menu.view_product_variant",
            "menu.view_modifier_group", 
            "menu.view_modifier",
            "orders.view_order", 
            "orders.view_kds",
            "inventory.view_stock_item", 
            "inventory.view_stock_movement", 
            "inventory.view_supplier",
            "inventory.view_category", 
            "inventory.view_stock_unit",
            "inventory.view_allergen",
            "recipes.view_recipe", 
            "recipes.view_category",
            "sales.view_sale",
            "takeaway.view_takeaway",
            "shifts.view_shift",
            "dashboard.view_dashboard",
            "invoices.view_invoice",
            "reservations.view_reservation",
            "warehouse.view_warehouse",
            "warehouse.view_purchase_order",
            "warehouse.view_goods_receiving",
            "warehouse.view_transfer",
            "warehouse.view_stock_counting",
            "warehouse.view_deficiency_report",
            "warehouse.view_purchase_recommendation",
            "inventory.view_expiry_risk",
            "financial.view_amount",
            "production_planning.view_plan",
            "production_planning.view_86",
        ],
    },
]


# İzin açıklamaları: --update ile doldurulur. Özel metinler burada; diğerleri şablondan üretilir.
PERMISSION_DESCRIPTION_OVERRIDES: dict[str, dict[str, str]] = {
    "orders.manage_smart_firing": {
        "description_tr": "KDS kuyruğunda ürün firing zamanlamasını manuel müdahale etme (şimdi gönder / ertele).",
        "description_en": "Manually control Smart Firing on the KDS queue (send now / delay).",
    },
    "pos.force_stock_order": {
        "description_tr": "Yetersiz stok uyarısında siparişi yine de tamamlama (POS stok override).",
        "description_en": "Complete POS orders despite insufficient stock warnings (stock override).",
    },
    "pos.manage_connections": {
        "description_tr": "POS terminallerindeki aktif oturumları görüntüleme ve bağlantıyı kesme.",
        "description_en": "View active POS terminal sessions and disconnect devices.",
    },
    "warehouse.edit_purchase_order_post_approval": {
        "description_tr": "Onaylanmış satın alma siparişlerinde sınırlı düzenleme yapma.",
        "description_en": "Edit approved purchase orders within allowed constraints.",
    },
    "warehouse.commit_purchase_recommendation": {
        "description_tr": "Satın alma önerisini onaylayıp satın alma siparişine dönüştürme.",
        "description_en": "Commit a purchase recommendation into a purchase order.",
    },
    "warehouse.delete_stock_counting_final": {
        "description_tr": "Tamamlanmış stok sayım kayıtlarını silme (geri alınamaz).",
        "description_en": "Delete finalized stock counting records (irreversible).",
    },
    "shifts.edit_closed_shift": {
        "description_tr": "Kapanmış vardiyanın kasa kapanış tutarlarını düzeltme; denetim kaydı oluşturur.",
        "description_en": "Correct closing amounts on closed shifts; creates an audit trail entry.",
    },
    "branches.change_kds_station": {
        "description_tr": "KDS ekranında görüntülenen mutfak istasyonunu değiştirme.",
        "description_en": "Switch the kitchen station displayed on the KDS screen.",
    },
    "inventory.view_return_cancel": {
        "description_tr": "Depo stok iptal ve iade kayıtlarını görüntüleme.",
        "description_en": "View warehouse stock return and cancel records.",
    },
    "inventory.manage_return_cancel": {
        "description_tr": "Depo stok iptal ve iade kaydı oluşturma, silme.",
        "description_en": "Create and soft-delete warehouse stock return/cancel records.",
    },
    "branches.add_kds_return_cancel": {
        "description_tr": "KDS üzerinden stok iade/iptal hareketi girişi yapma.",
        "description_en": "Record stock return/cancel movements from the KDS.",
    },
    "branches.add_kds_waste": {
        "description_tr": "KDS üzerinden fire/zayi stok hareketi girişi yapma.",
        "description_en": "Record waste/spoilage stock movements from the KDS.",
    },
    "financial.view_amount": {
        "description_tr": "Tutar, fiyat ve gelir bilgilerini ekranda görüntüleme.",
        "description_en": "View monetary amounts, prices and revenue figures in the UI.",
    },
    "printing.direct_print": {
        "description_tr": "Yazıcı kuyruğunu atlayarak doğrudan termal çıktı gönderme.",
        "description_en": "Send thermal print jobs directly, bypassing the print queue.",
    },
    "production_planning.view_86": {
        "description_tr": "Ürün kalmadı (86) listesini görüntüleme.",
        "description_en": "View the out-of-stock (86) product list.",
    },
    "production_planning.manage_86": {
        "description_tr": "Ürün kalmadı (86) listesine ekleme ve çıkarma.",
        "description_en": "Add or remove products from the out-of-stock (86) list.",
    },
    "prep.manage_smart_rules": {
        "description_tr": "Hazırlık listesi için akıllı kural tanımlama ve yönetme.",
        "description_en": "Define and manage smart prep list automation rules.",
    },
    "audit.export_auditlog": {
        "description_tr": "Denetim kayıtlarını CSV olarak dışa aktarma.",
        "description_en": "Export audit log records as CSV.",
    },
    "waiter.access": {
        "description_tr": "Garson sipariş uygulamasına ve masa alanına erişim.",
        "description_en": "Access the waiter order app and table service area.",
    },
    "rbac.manage_role": {
        "description_tr": "Rol, izin ve kullanıcı yetki atamalarını yönetme.",
        "description_en": "Manage roles, permissions and user authorization assignments.",
    },
    "pos.apply_discount": {
        "description_tr": "POS ekranında sipariş veya ürün indirimi uygulama.",
        "description_en": "Apply order- or item-level discounts on the POS screen.",
    },
}


def _permission_action_suffix(code: str) -> str:
    if "." not in code:
        return code
    return code.split(".", 1)[1]


def _build_permission_description(perm_data: dict, lang: str) -> str:
    code = perm_data["code"]
    override = PERMISSION_DESCRIPTION_OVERRIDES.get(code)
    if override:
        key = f"description_{lang}"
        if key in override and override[key]:
            return override[key].strip()

    name = (perm_data.get(f"name_{lang}") or "").strip()
    if not name:
        return ""

    action = _permission_action_suffix(code)
    category = perm_data.get("category", "")

    if lang == "tr":
        ctx = {
            "users": "kullanıcı yönetimi",
            "rbac": "rol ve izin yönetimi",
            "branches": "şube ve masa yönetimi",
            "menu": "menü yönetimi",
            "orders": "sipariş yönetimi",
            "inventory": "envanter yönetimi",
            "recipes": "reçete yönetimi",
            "sales": "satış kayıtları",
            "pos": "POS / kasa",
            "waiter": "garson uygulaması",
            "takeaway": "paket sipariş",
            "warehouse": "depo yönetimi",
            "shifts": "vardiya ve kasa",
            "dashboard": "yönetim paneli",
            "invoices": "fatura yönetimi",
            "reservations": "rezervasyon yönetimi",
            "credit": "ödenmez (müşteri kredisi) yönetimi",
            "financial": "finansal görünürlük",
            "reporting": "raporlama",
            "printing": "yazıcı yönetimi",
            "production_planning": "üretim planlama",
            "prep": "mutfak hazırlık",
            "audit": "denetim kayıtları",
            "surveys": "anket yönetimi",
        }.get(category, "modül")

        if action.startswith("view_") or action == "view_kds":
            return f"{name} — {ctx} kapsamında kayıtları görüntüleme (salt okuma)."
        if action.startswith("manage_") or action in {"manage_order", "manage_shift"}:
            return f"{name} — {ctx} kapsamında oluşturma, düzenleme ve silme işlemleri."
        if action.startswith("approve_"):
            return f"{name} — {ctx} kapsamında onay veya reddetme yetkisi."
        if action.startswith("delete_"):
            return f"{name} — {ctx} kapsamında kalıcı silme yetkisi."
        if action.startswith("close_"):
            return f"{name} — {ctx} kapsamında işlem kapatma yetkisi."
        if action.startswith("place_"):
            return f"{name} — {ctx} kapsamında tedarikçiye sipariş iletme."
        if action.startswith("commit_"):
            return f"{name} — {ctx} kapsamında öneriyi işleme alma."
        if action.startswith("generate_"):
            return f"{name} — {ctx} kapsamında rapor üretme ve önizleme."
        if action.startswith("add_"):
            return f"{name} — {ctx} kapsamında yeni kayıt ekleme."
        if action == "access":
            return f"{name} — ilgili ekrana erişim yetkisi."
        return f"{name} — {ctx} modülünde kullanılan operasyonel yetki."

    ctx = {
        "users": "user management",
        "rbac": "role and permission management",
        "branches": "branch and table management",
        "menu": "menu management",
        "orders": "order management",
        "inventory": "inventory management",
        "recipes": "recipe management",
        "sales": "sales records",
        "pos": "POS / register",
        "waiter": "waiter app",
        "takeaway": "delivery orders",
        "warehouse": "warehouse management",
        "shifts": "shift and cash register",
        "dashboard": "management dashboard",
        "invoices": "invoice management",
        "reservations": "reservation management",
        "credit": "store credit management",
        "financial": "financial visibility",
        "reporting": "reporting",
        "printing": "printer management",
        "production_planning": "production planning",
        "prep": "kitchen prep",
        "audit": "audit logs",
        "surveys": "survey management",
    }.get(category, "module")

    if action.startswith("view_") or action == "view_kds":
        return f"{name} — read-only access to records in {ctx}."
    if action.startswith("manage_") or action in {"manage_order", "manage_shift"}:
        return f"{name} — create, update and delete operations in {ctx}."
    if action.startswith("approve_"):
        return f"{name} — approve or reject workflow steps in {ctx}."
    if action.startswith("delete_"):
        return f"{name} — permanently delete records in {ctx}."
    if action.startswith("close_"):
        return f"{name} — close operational records in {ctx}."
    if action.startswith("place_"):
        return f"{name} — submit orders to suppliers in {ctx}."
    if action.startswith("commit_"):
        return f"{name} — commit recommendations into transactions in {ctx}."
    if action.startswith("generate_"):
        return f"{name} — generate and preview reports in {ctx}."
    if action.startswith("add_"):
        return f"{name} — add new records in {ctx}."
    if action == "access":
        return f"{name} — access to the related application screen."
    return f"{name} — operational permission used in {ctx}."


def _permission_localized_description(perm_data: dict, lang: str) -> str:
    """
    İzin seed kaydından seçilen dildeki açıklama metni.
    `description_{lang}` tanımlıysa onu kullanır; yoksa `name_{lang}` ile doldurur.
    Anahtar açıkça verilmiş boş string ise açıklama temizlenir.
    """
    desc_key = f"description_{lang}"
    if desc_key in perm_data:
        val = perm_data[desc_key]
        return (val or "").strip()
    built = _build_permission_description(perm_data, lang)
    if built:
        return built
    return (perm_data.get(f"name_{lang}") or "").strip()


class Command(BaseCommand):
    help = "Seed RBAC categories, permissions, and default roles (Turkish/English)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--lang",
            type=str,
            default="tr",
            choices=["tr", "en"],
            help="Installation language / Kurulum dili (tr/en)",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Rollerin izinlerini sıfırlar, rolleri silmez (ID'ler korunur)",
        )
        parser.add_argument(
            "--reset-all",
            action="store_true",
            help="Tüm roller, izinler ve kategorileri siler (DİKKAT: ID'ler değişir)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be created without making changes",
        )
        parser.add_argument(
            "--update",
            action="store_true",
            help=(
                "Yalnızca veritabanında var olan RolePermission kayıtlarının "
                "açıklama (description) alanını --lang ile günceller; "
                "kategori, rol ve izin adı/atamalarına dokunmaz."
            ),
        )

    def handle(self, *args, **options):
        lang = options["lang"]
        update_only = options["update"]
        reset = options["reset"]
        reset_all = options["reset_all"]
        dry_run = options["dry_run"]

        if update_only:
            if reset_all or reset:
                warn = (
                    "--reset ve --reset-all, --update ile birlikte yok sayıldı."
                    if lang == "tr"
                    else "--reset and --reset-all are ignored when --update is used."
                )
                self.stdout.write(self.style.WARNING(warn))
            self._update_permission_descriptions_only(lang=lang, dry_run=dry_run)
            return

        if reset_all and not dry_run:
            msg = "Resetting ALL RBAC data..." if lang == "en" else "Tüm RBAC verileri sıfırlanıyor..."
            self.stdout.write(self.style.WARNING(msg))
            from django.contrib.auth import get_user_model
            User = get_user_model()
            for user in User.objects.all():
                if hasattr(user, 'roles'):
                    user.roles.clear()
            Role.objects.all().delete()
            RolePermission.objects.all().delete()
            PermissionCategory.objects.all().delete()
            msg_ok = "All RBAC data cleared." if lang == "en" else "Tüm RBAC verileri temizlendi."
            self.stdout.write(self.style.SUCCESS(msg_ok))

        if reset and not dry_run and not reset_all:
            msg = "Resetting role permissions (roles kept)..." if lang == "en" else "Rol izinleri sıfırlanıyor (roller korunuyor)..."
            self.stdout.write(self.style.WARNING(msg))
            for role in Role.objects.all():
                role.permissions.clear()
            msg_ok = "Role permissions cleared." if lang == "en" else "Rol izinleri temizlendi."
            self.stdout.write(self.style.SUCCESS(msg_ok))

        # Categories
        header_cats = "--- Permission Categories ---" if lang == "en" else "--- İzin Kategorileri ---"
        self.stdout.write(f"\n{header_cats}")
        cat_map = {}
        for cat_data in CATEGORIES:
            name = cat_data[f"name_{lang}"]
            description = cat_data[f"description_{lang}"]
            
            if dry_run:
                self.stdout.write(f"  [DRY] Would create/update category: {cat_data['code']} ({name})")
            else:
                cat, created = PermissionCategory.objects.get_or_create(
                    code=cat_data["code"],
                    defaults={
                        "name": name,
                        "description": description,
                    },
                )
                if not created:
                    cat.name = name
                    cat.description = description
                    cat.save()
                    
                cat_map[cat_data["code"]] = cat
                status = "Created" if created else "Updated"
                if lang == "tr":
                    status = "Oluşturuldu" if created else "Güncellendi"
                self.stdout.write(f"  [{status}] {cat_data['code']}: {name}")

        # Permissions
        header_perms = "--- Permissions ---" if lang == "en" else "--- İzinler ---"
        self.stdout.write(f"\n{header_perms}")
        perm_map = {}
        for perm_data in PERMISSIONS:
            name = perm_data[f"name_{lang}"]
            
            if dry_run:
                self.stdout.write(f"  [DRY] Would create/update permission: {perm_data['code']} ({name})")
            else:
                cat = cat_map.get(perm_data["category"])
                if not cat:
                    err_msg = f"  Category not found: {perm_data['category']}" if lang == "en" else f"  Kategori bulunamadı: {perm_data['category']}"
                    self.stdout.write(self.style.ERROR(err_msg))
                    continue
                
                perm, created = RolePermission.objects.get_or_create(
                    code=perm_data["code"],
                    defaults={
                        "name": name,
                        "category": cat,
                    },
                )
                if not created:
                    perm.name = name
                    perm.category = cat
                    perm.save()

                perm_map[perm_data["code"]] = perm
                status = "Created" if created else "Updated"
                if lang == "tr":
                    status = "Oluşturuldu" if created else "Güncellendi"
                self.stdout.write(f"  [{status}] {perm_data['code']}: {name}")

        # Roles
        header_roles = "--- Roles ---" if lang == "en" else "--- Roller ---"
        self.stdout.write(f"\n{header_roles}")
        for role_data in ROLES:
            name = role_data[f"name_{lang}"]
            description = role_data[f"description_{lang}"]
            
            if dry_run:
                self.stdout.write(f"  [DRY] Would create/update role: {name}")
            else:
                parent = None
                # Note: Parent matching might be tricky if names change between languages.
                # However, default roles in this script don't have parents (all None).
                if role_data["parent"]:
                    # Try matching by name (this might need to be by code if we add codes to roles)
                    parent = Role.objects.filter(name=role_data["parent"]).first()

                # Rollerin kodu yok, bu yüzden seçilen dildeki adına göre eşleştiririz veya name_tr veya name_en
                # Güvenli olmak için, name_tr veya name_en ile eşleştirmeyi deneyebiliriz
                # Basitlik için, name_tr varsa primary identifier olarak kullanırız, veya sadece name ile get_or_create kullanırız.
                
                # Eğer ad değişirse, get_or_create yeni bir rol oluşturur. 
                # Bu rollerin 'code' olmamasının bir sınırlamasıdır.
                # Ancak bu sistem rolleri olduğu için, belki de bazı mantık ile bulabiliriz.
                
                role, created = Role.objects.get_or_create(
                    name=name,
                    defaults={
                        "description": description,
                        "parent_role": parent,
                        "is_active": True,
                    },
                )
                if not created:
                    role.description = description
                    role.parent_role = parent
                    role.is_active = True
                    role.save()

                if role_data["permissions"] == "__all__":
                    role.permissions.set(perm_map.values())
                    perm_count = len(perm_map)
                else:
                    perms = [perm_map[code] for code in role_data["permissions"] if code in perm_map]
                    role.permissions.set(perms)
                    perm_count = len(perms)

                status = "Created" if created else "Updated"
                if lang == "tr":
                    status = "Oluşturuldu" if created else "Güncellendi"
                perm_suffix = "permissions" if lang == "en" else "izin"
                self.stdout.write(f"  [{status}] {name} ({perm_count} {perm_suffix})")

        if not dry_run:
            try:
                from rbac.cache import invalidate_all_permission_cache
                invalidate_all_permission_cache()
                cache_msg = "RBAC Cache cleared." if lang == "en" else "RBAC Önbelleği temizlendi."
                self.stdout.write(self.style.SUCCESS(cache_msg))
            except ImportError:
                pass

            total_cats = PermissionCategory.objects.count()
            total_perms = RolePermission.objects.count()
            total_roles = Role.objects.count()
            
            done_msg = f"\nDone! Categories: {total_cats}, Permissions: {total_perms}, Roles: {total_roles}" if lang == "en" else f"\nTamamlandı! Kategoriler: {total_cats}, İzinler: {total_perms}, Roller: {total_roles}"
            self.stdout.write(self.style.SUCCESS(done_msg))
        else:
            dry_done = "\nDry run complete. No changes made." if lang == "en" else "\nDry run tamamlandı. Değişiklik yapılmadı."
            self.stdout.write(self.style.WARNING(dry_done))

    def _update_permission_descriptions_only(self, *, lang: str, dry_run: bool) -> None:
        """Mevcut RolePermission.description alanlarını seed verisindeki dile göre günceller."""
        header = (
            "--- Permission descriptions (update only) ---"
            if lang == "en"
            else "--- İzin açıklamaları (yalnızca güncelleme) ---"
        )
        self.stdout.write(f"\n{header}")

        updated = 0
        skipped_missing = 0
        for perm_data in PERMISSIONS:
            code = perm_data["code"]
            text = _permission_localized_description(perm_data, lang)
            if dry_run:
                preview = text if len(text) <= 72 else f"{text[:69]}..."
                self.stdout.write(f"  [DRY] {code} → {preview!r}")
                continue
            try:
                perm = RolePermission.objects.get(code=code)
            except RolePermission.DoesNotExist:
                skip_msg = (
                    f"  Atlandı (DB'de yok): {code}"
                    if lang == "tr"
                    else f"  Skipped (not in DB): {code}"
                )
                self.stdout.write(self.style.WARNING(skip_msg))
                skipped_missing += 1
                continue
            perm.description = text or None
            perm.save(update_fields=["description"])
            updated += 1
            ok = "Güncellendi" if lang == "tr" else "Updated"
            self.stdout.write(f"  [{ok}] {code}")

        if dry_run:
            dry_done = (
                "\nDry run tamamlandı. İzin açıklaması değişikliği yapılmadı."
                if lang == "tr"
                else "\nDry run complete. No permission description changes applied."
            )
            self.stdout.write(self.style.WARNING(dry_done))
            return

        try:
            from rbac.cache import invalidate_all_permission_cache

            invalidate_all_permission_cache()
            cache_msg = "RBAC Önbelleği temizlendi." if lang == "tr" else "RBAC Cache cleared."
            self.stdout.write(self.style.SUCCESS(cache_msg))
        except ImportError:
            pass

        if lang == "tr":
            summary = (
                f"\nTamamlandı. {updated} izin açıklaması güncellendi."
                f"{f' {skipped_missing} kod veritabanında bulunamadı.' if skipped_missing else ''}"
            )
        else:
            summary = (
                f"\nDone. Updated {updated} permission description(s)."
                f"{f' {skipped_missing} code(s) not found in DB.' if skipped_missing else ''}"
            )
        self.stdout.write(self.style.SUCCESS(summary))

