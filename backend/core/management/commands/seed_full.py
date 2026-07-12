import random
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.core.management import call_command
from django.contrib.auth import get_user_model
from django.db import transaction

from apps.branches.models import Branch, KitchenStation, Zone, Table
from apps.warehouse.models import Warehouse
from apps.menu.models import Category, Product
from apps.inventory.models import StockItem, StockCategory, Allergen
from apps.inventory.services import InventoryService
from apps.recipes.models import Recipe, RecipeIngredient
from apps.recipes.allergen_service import recalculate_recipe_allergens
from rbac.models import Role, RolePermission

User = get_user_model()

# Menü: kategori adı, ürün adı, satış fiyatı (TL), içecek mi (reçete yok)
MENU_ROWS = [
    ("Çorbalar", "Mercimek Çorbası", Decimal("250.00"), False),
    ("Çorbalar", "Tavuk Suyu Çorba", Decimal("200.00"), False),
    ("Ana Yemekler", "Izgara Köfte", Decimal("300.00"), False),
    ("Yan Ürünler", "Pilav", Decimal("150.00"), False),
    ("İçecekler", "Ayran", Decimal("50.00"), True),
    ("İçecekler", "Kola", Decimal("50.00"), True),
    ("İçecekler", "Gazoz", Decimal("50.00"), True),
    ("İçecekler", "Çay", Decimal("25.00"), True),
]

ROLE_NAMES = {
    "tr": {
        "admin": "Sistem Yöneticisi",
        "waiter": "Garson",
        "kitchen": "Mutfak Personeli",
        "stock": "Stok Personeli",
        "manager": "Şube Müdürü",
        "cashier": "Kasiyer",
    },
    "en": {
        "admin": "System Administrator",
        "waiter": "Waiter",
        "kitchen": "Kitchen Staff",
        "stock": "Stock Staff",
        "manager": "Branch Manager",
        "cashier": "Cashier",
    },
    "bg": {
        "admin": "Системен администратор",
        "waiter": "Сервитьор",
        "kitchen": "Кухненски персонал",
        "stock": "Складов персонал",
        "manager": "Мениджър на клон",
        "cashier": "Касиер",
    },
    "sq": {
        "admin": "Administrator i Sistemit",
        "waiter": "Kamarier",
        "kitchen": "Personeli i Kuzhinës",
        "stock": "Personeli i Magazinës",
        "manager": "Menaxher i Degës",
        "cashier": "Arkëtar",
    },
}

# Stok kodları: GRUP-ALTGRUP-ÜRÜN (ör. GDA-LEG = gıda bakliyat, GDA-SEB = sebze, ETK = et-kümes).
# Katalog ve depo girişleri reçetelerden bağımsızdır; reçeteler yalnızca bu SKU'lara referans verir.
STOCK_ITEMS = [
    # Stok birimleri Kg, Lt, adet cinsindendir.
    # Reçeteler ise g, ml, adet cinsindendir (normalized_quantity ile dönüşüm yapılır).
    ("GDA-LEG-KRM01", "Kırmızı mercimek", "kg", Decimal("45")),
    ("GDA-SEB-SOG01", "Soğan", "kg", Decimal("12")),
    ("GDA-SEB-HAV01", "Havuç", "kg", Decimal("18")),
    ("GDA-SEB-PAT01", "Patates", "kg", Decimal("15")),
    ("GDA-YAG-AYC01", "Ayçiçek yağı", "Lt", Decimal("80")),
    ("GDA-SOS-SAL01", "Domates salçası", "kg", Decimal("120")),
    ("ICE-SU-MTZ01", "Su (mutfak / içme)", "Lt", Decimal("8")),
    ("GDA-TOC-TUZ01", "Tuz", "kg", Decimal("20")),
    ("GDA-BAH-CRM01", "Toz Biber", "kg", Decimal("350")),
    ("ETK-TVK-GGS01", "Tavuk göğüs fileto", "kg", Decimal("120")),
    ("GDA-MIS-SEH01", "Arpa şehriye", "kg", Decimal("28")),
    ("GDA-YUM-ORT01", "Yumurta (L)", "adet", Decimal("6")),
    ("GDA-SEB-LIM01", "Limon", "adet", Decimal("8")),
    ("GDA-BAH-KAR01", "Karabiber Toz", "kg", Decimal("350")),
    ("GDA-TAH-BLD01", "Baldo pirinç", "kg", Decimal("55")),
    ("GDA-SUT-TYG01", "Tereyağı (çubuk)", "kg", Decimal("480")),
    ("ETK-DAN-KIY01", "Kıyma dana (orta yağlı)", "kg", Decimal("980")),
    ("GDA-UNK-GAL01", "Galeta unu", "kg", Decimal("35")),
    ("GDA-SEB-SAR01", "Sarımsak", "kg", Decimal("280")),
    ("GDA-BAH-KOF01", "Köfte Baharatı", "kg", Decimal("400")),
]

# Örnek stok kalemlerine atanacak allerjen kodları (seed_allergens ile uyumlu).
STOCK_ALLERGEN_CODES = {
    "GDA-YUM-ORT01": ["ALG-EGG-01", "ALG-EGG-02"],
    "GDA-SUT-TYG01": ["ALG-MILK-01"],
    "GDA-UNK-GAL01": ["ALG-WHEAT-01"],
    "GDA-MIS-SEH01": ["ALG-WHEAT-01"],
}

# Depo açılış stoğu — satın alma partileri (reçeteden bağımsız).

STOCK_INITIAL_RECEIPTS = [
    ("GDA-LEG-KRM01", Decimal("5"), "kg"),
    ("GDA-SEB-SOG01", Decimal("3"), "kg"),
    ("GDA-SEB-HAV01", Decimal("2"), "kg"),
    ("GDA-SEB-PAT01", Decimal("5"), "kg"),
    ("GDA-YAG-AYC01", Decimal("2"), "Lt"),
    ("GDA-SOS-SAL01", Decimal("5"), "kg"),
    ("ICE-SU-MTZ01",  Decimal("50"),"Lt"),
    ("GDA-TOC-TUZ01", Decimal("5"), "kg"),
    ("GDA-BAH-CRM01", Decimal("1"), "kg"),
    ("ETK-TVK-GGS01", Decimal("5"), "kg"),
    ("GDA-MIS-SEH01", Decimal("2"), "kg"),
    ("GDA-YUM-ORT01", Decimal("100"), "adet"),
    ("GDA-SEB-LIM01", Decimal("30"), "adet"),
    ("GDA-BAH-KAR01", Decimal("1"), "kg"),
    ("GDA-TAH-BLD01", Decimal("20"), "kg"),
    ("GDA-SUT-TYG01", Decimal("5"), "kg"),
    ("ETK-DAN-KIY01", Decimal("10"), "kg"),
    ("GDA-UNK-GAL01", Decimal("2"), "kg"),
    ("GDA-SEB-SAR01", Decimal("1"), "kg"),
    ("GDA-BAH-KOF01", Decimal("1"), "kg"),
]

# Reçete satırları: (sku, görünen ad, birim, 10 porsiyon miktarı, fiyat ipucu — yalnızca reçete için)
FOOD_RECIPES_10_PORTIONS = {
    "Mercimek Çorbası": [
        ("GDA-LEG-KRM01", "Kırmızı mercimek", "g", Decimal("500"), Decimal("45")),
        ("GDA-SEB-SOG01", "Soğan", "g", Decimal("280"), Decimal("12")),
        ("GDA-SEB-HAV01", "Havuç", "g", Decimal("180"), Decimal("18")),
        ("GDA-SEB-PAT01", "Patates", "g", Decimal("220"), Decimal("15")),
        ("GDA-YAG-AYC01", "Ayçiçek yağı", "ml", Decimal("70"), Decimal("0.08")),
        ("GDA-SOS-SAL01", "Domates salçası", "g", Decimal("40"), Decimal("0.12")),
        ("ICE-SU-MTZ01", "Su (mutfak / içme)", "Lt", Decimal("3.2"), Decimal("8")),
        ("GDA-TOC-TUZ01", "Tuz", "g", Decimal("18"), Decimal("0.02")),
        ("GDA-BAH-CRM01", "Toz Biber", "g", Decimal("12"), Decimal("0.35")),
    ],
    "Tavuk Suyu Çorba": [
        ("ETK-TVK-GGS01", "Tavuk göğüs fileto", "g", Decimal("450"), Decimal("120")),
        ("ICE-SU-MTZ01", "Su (mutfak / içme)", "Lt", Decimal("3.0"), Decimal("8")),
        ("GDA-MIS-SEH01", "Arpa şehriye", "g", Decimal("140"), Decimal("28")),
        ("GDA-YUM-ORT01", "Yumurta (L)", "adet", Decimal("2"), Decimal("6")),
        ("GDA-SEB-LIM01", "Limon", "adet", Decimal("2"), Decimal("8")),
        ("GDA-TOC-TUZ01", "Tuz", "g", Decimal("15"), Decimal("0.02")),
        ("GDA-BAH-KAR01", "Karabiber Toz", "g", Decimal("3"), Decimal("1.5")),
    ],
    "Pilav": [
        ("GDA-TAH-BLD01", "Baldo pirinç", "g", Decimal("520"), Decimal("55")),
        ("GDA-SUT-TYG01", "Tereyağı (çubuk)", "g", Decimal("85"), Decimal("180")),
        ("GDA-MIS-SEH01", "Arpa şehriye", "g", Decimal("45"), Decimal("28")),
        ("GDA-TOC-TUZ01", "Tuz", "g", Decimal("12"), Decimal("0.02")),
    ],
    "Izgara Köfte": [
        ("ETK-DAN-KIY01", "Kıyma dana (orta yağlı)", "g", Decimal("1000"), Decimal("280")),
        ("GDA-SEB-SOG01", "Kuru Soğan", "g", Decimal("220"), Decimal("12")),
        ("GDA-UNK-GAL01", "Galeta unu", "g", Decimal("90"), Decimal("35")),
        ("GDA-YUM-ORT01", "Yumurta (L)", "adet", Decimal("2"), Decimal("6")),
        ("GDA-SEB-SAR01", "Sarımsak", "g", Decimal("25"), Decimal("80")),
        ("GDA-YAG-AYC01", "Ayçiçek yağı", "ml", Decimal("45"), Decimal("0.08")),
        ("GDA-BAH-KOF01", "Köfte Baharatı", "g", Decimal("22"), Decimal("0.4")),
    ],
}


class Command(BaseCommand):
    help = "Tüm veritabanını sıfırlayarak veya belirli bölümleri seçerek örnek verilerle doldurur."

    def add_arguments(self, parser):
        parser.add_argument('--rbac', action='store_true', help='RBAC ve yetkileri yükle')
        parser.add_argument('--units', action='store_true', help='Birimleri yükle')
        parser.add_argument('--infra', action='store_true', help='Şube, Depo ve İstasyonları yükle')
        parser.add_argument('--users', action='store_true', help='Örnek kullanıcıları yükle')
        parser.add_argument(
            '--menu',
            action='store_true',
            help='Örnek stok kataloğu, depo girişleri, menü ve reçeteleri yükle',
        )
        parser.add_argument('--tables', action='store_true', help='Örnek Masa düzenini yükle')
        parser.add_argument('--all', action='store_true', help='Her şeyi yükle')
        parser.add_argument('--lang', type=str, default='tr', choices=['tr', 'en'], help='Kurulum dili (tr/en)')
        parser.add_argument('--no-flush', action='store_true', help='Veritabanını temizleme (mevcut verilere ekler)')

    def handle(self, *args, **options):
        is_all = options.get('all')
        do_rbac = is_all or options.get('rbac')
        do_units = is_all or options.get('units')
        do_infra = is_all or options.get('infra')
        do_users = is_all or options.get('users')
        do_menu = is_all or options.get('menu')
        do_tables = is_all or options.get('tables')
        lang = options.get('lang', 'tr')
        no_flush = options.get('no_flush')

        if not any([do_rbac, do_units, do_infra, do_users, do_menu, do_tables]):
            self.stdout.write(self.style.ERROR("Hiçbir seeding seçeneği belirtilmedi. --all veya spesifik bir flag kullanın."))
            return

        if not no_flush:
            self.stdout.write(self.style.WARNING("Veritabanı temizleniyor (Flush)..."))
            call_command('flush', interactive=False)
            self.stdout.write(self.style.SUCCESS("Veritabanı temizlendi."))

        # 1. Base Seeds
        if do_rbac:
            self.stdout.write(f"Temel RBAC yükleniyor (Dil: {lang})...")
            call_command('seed_rbac', lang=lang)
            self.stdout.write(self.style.SUCCESS("RBAC verileri yüklendi."))

        if do_units:
            self.stdout.write("Temel Birimler yükleniyor...")
            call_command('seed_units')
            self.stdout.write(self.style.SUCCESS("Birimler yüklendi."))

        if do_units or do_menu:
            self.stdout.write("Varsayılan allerjen listesi yükleniyor...")
            call_command('seed_allergens')
            self.stdout.write(self.style.SUCCESS("Allerjen referans listesi yüklendi."))

        with transaction.atomic():
            branch = None
            warehouse = None
            station = None

            # 2. Şube ve Altyapı
            if do_infra or do_users or do_menu or do_tables:
                # Infra yoksa ama diğerleri varsa, en azından bir branch bul veya oluştur
                branch = Branch.objects.first()
                if not branch:
                    branch = Branch.objects.create(
                        name="Merkez Şube",
                        code="MERKEZ",
                        address="Edirne Merkez",
                        phone="0284 123 45 67"
                    )
                    self.stdout.write(f"Şube oluşturuldu: {branch.name}")
                
                warehouse = Warehouse.objects.first()
                if not warehouse:
                    warehouse = Warehouse.objects.create(
                        name="Merkez Depo",
                        code="MDEP01",
                        warehouse_type="MAIN",
                        is_default=True
                    )
                    warehouse.branches.add(branch)
                    self.stdout.write(f"Depo oluşturuldu: {warehouse.name}")

                station = KitchenStation.objects.first()
                if not station:
                    station = KitchenStation.objects.create(
                        branch=branch,
                        name="Ana Mutfak",
                        code="ana-mutfak",
                        warehouse=warehouse
                    )
                    self.stdout.write(f"Mutfak İstasyonu oluşturuldu: {station.name}")

            # 3. Rollerin Kontrolü (Garson rolü ekle) - RBAC veya Users seçiliyse
            if do_rbac or do_users:
                waiter_name = ROLE_NAMES[lang]["waiter"]
                garson_role, _ = Role.objects.get_or_create(
                    name=waiter_name,
                    defaults={"description": "Servis personeli - sipariş alma ve görüntüleme" if lang == "tr" else "Service personnel - order taking and viewing"}
                )
                garson_codes = [
                    "waiter.access",
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
                    "shifts.view_shift",
                    "shifts.manage_shift",
                    "financial.view_amount",
                ]
                garson_role.permissions.set(RolePermission.objects.filter(code__in=garson_codes))

            # 4. Kullanıcıların Oluşturulması
            if do_users:
                password = "Sk74833."
                users_data = [
                    {"username": "admin", "email": "skocadogan@gmail.com", "role": ROLE_NAMES[lang]["admin"], "is_superuser": True},
                    {"username": "garson_test", "email": "garson@ramis.com", "role": ROLE_NAMES[lang]["waiter"], "is_superuser": False},
                    {"username": "asci_test", "email": "asci@ramis.com", "role": ROLE_NAMES[lang]["kitchen"], "is_superuser": False},
                    {"username": "stok_test", "email": "stok@ramis.com", "role": ROLE_NAMES[lang]["stock"], "is_superuser": False},
                    {"username": "mudur_test", "email": "mudur@ramis.com", "role": ROLE_NAMES[lang]["manager"], "is_superuser": False},
                    {"username": "kasiyer_test", "email": "kasiyer@ramis.com", "role": ROLE_NAMES[lang]["cashier"], "is_superuser": False},
                ]

                for u_info in users_data:
                    user = User.objects.filter(username=u_info["username"]).first()
                    if not user:
                        user = User.objects.create_user(
                            username=u_info["username"],
                            email=u_info["email"],
                            password=password,
                            is_superuser=u_info["is_superuser"],
                            is_staff=u_info["is_superuser"],
                            branch=branch
                        )
                        self.stdout.write(f"Kullanıcı oluşturuldu: {u_info['username']}")
                    else:
                        user.email = u_info["email"]
                        user.set_password(password)
                        user.is_superuser = u_info["is_superuser"]
                        user.is_staff = u_info["is_superuser"]
                        if branch:
                            user.branch = branch
                        user.save()
                        self.stdout.write(f"Kullanıcı güncellendi (reset): {u_info['username']}")

                    role = Role.objects.filter(name=u_info["role"]).first()
                    if role:
                        user.roles.add(role)
                    self.stdout.write(f"  - Rol: {u_info['role']}")

            # 5. Stok kataloğu, depo girişleri, menü ve reçeteler
            if do_menu:
                stock_cat, _ = StockCategory.objects.get_or_create(name="Genel Gıda", code="GG01")
                stock_by_sku = {}

                for sku, name, unit, unit_price in STOCK_ITEMS:
                    stock_by_sku[sku] = StockItem.objects.create(
                        name=name,
                        sku=sku,
                        unit=unit,
                        category=stock_cat,
                        minimum_quantity=Decimal("5"),
                        last_purchase_price=unit_price,
                    )

                allergen_by_code = {
                    a.code: a for a in Allergen.objects.filter(is_active=True)
                }
                for sku, codes in STOCK_ALLERGEN_CODES.items():
                    item = stock_by_sku.get(sku)
                    if not item:
                        continue
                    allergens = [allergen_by_code[c] for c in codes if c in allergen_by_code]
                    if allergens:
                        item.allergens.set(allergens)

                if warehouse:
                    for sku, qty, receipt_unit in STOCK_INITIAL_RECEIPTS:
                        item = stock_by_sku[sku]
                        InventoryService.receive_stock(
                            warehouse_id=warehouse.id,
                            stock_item_id=item.id,
                            quantity=qty,
                            unit=receipt_unit,
                            reference="seed_full",
                            notes="Örnek seed: depo açılış stoğu",
                            unit_price=item.last_purchase_price,
                        )
                    self.stdout.write(
                        f"Depo girişleri oluşturuldu: {len(STOCK_INITIAL_RECEIPTS)} kalem ({warehouse.name})."
                    )
                else:
                    self.stdout.write(
                        self.style.WARNING("Depo bulunamadı; stok girişleri atlandı (yalnızca katalog oluşturuldu).")
                    )

                category_order = {}
                for order, (cat_name, _prod, _price, _bev) in enumerate(MENU_ROWS, start=1):
                    if cat_name not in category_order:
                        category_order[cat_name] = order

                categories_by_name = {}
                for cat_name in category_order:
                    categories_by_name[cat_name] = Category.objects.create(
                        name=cat_name,
                        station=station,
                        order=category_order[cat_name],
                    )

                for cat_name, prod_name, price, is_beverage in MENU_ROWS:
                    category = categories_by_name[cat_name]
                    product = Product.objects.create(
                        category=category,
                        name=prod_name,
                        base_price=price,
                        is_active=True,
                        show_on_pos=True,
                    )
                    if branch:
                        product.branches.add(branch)

                    if is_beverage:
                        continue

                    rows = FOOD_RECIPES_10_PORTIONS.get(prod_name)
                    if not rows:
                        continue

                    recipe = Recipe.objects.create(
                        product=product,
                        name=f"{prod_name} — 10 porsiyon",
                        servings=10,
                        description="Örnek seed: 10 porsiyon için hammadde miktarları (tipik mutfak oranları).",
                        prep_time_minutes=20,
                        cook_time_minutes=40,
                    )
                    if branch:
                        recipe.branches.add(branch)

                    for sku, _ing_name, unit, qty, _price_hint in rows:
                        stock_item = stock_by_sku.get(sku)
                        if not stock_item:
                            self.stdout.write(
                                self.style.WARNING(f"Reçete atlandı (bilinmeyen SKU): {sku} — {prod_name}")
                            )
                            continue
                        RecipeIngredient.objects.create(
                            recipe=recipe,
                            stock_item=stock_item,
                            quantity=qty,
                            unit=unit,
                        )
                    recalculate_recipe_allergens(recipe)

                self.stdout.write(self.style.SUCCESS("Stok kataloğu, menü ve reçeteler oluşturuldu."))

            # 6. Örnek Masa Düzeni
            if do_tables:
                zone = Zone.objects.create(branch=branch, name="Ana Salon", sort_order=1)
                for i in range(1, 11):
                    Table.objects.create(
                        zone=zone,
                        name=f"Masa {i}",
                        table_number=i,
                        capacity=4,
                        status="FREE",
                        position_x=random.randint(1, 10),
                        position_y=random.randint(1, 10)
                    )
                self.stdout.write(self.style.SUCCESS("10 adet örnek masa oluşturuldu."))

        self.stdout.write(self.style.SUCCESS("\nSeed işlemi başarıyla tamamlandı!"))
        if do_users:
            self.stdout.write(f"Test kullanıcıları şifresi: {password}")

