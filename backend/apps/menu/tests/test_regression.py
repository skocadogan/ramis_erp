"""
P0 Regresyon Testleri:
  - P0-2: bulk_price NameError → Decimal / transaction import eksikti
  - P0-1: Recipe.total_cost AttributeError → cost_per_unit kaldırıldı
Bu testlerin geçmesi, kritik düzeltmelerin yerinde olduğunu kanıtlar.
"""
import pytest
from decimal import Decimal

from core.decimal_constants import ZERO_MONEY
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model

from rbac.models import Role, RolePermission, PermissionCategory
from apps.menu.models import Category, Product, ProductUnit
from apps.inventory.models import StockItem
from apps.recipes.models import Recipe, RecipeIngredient

User = get_user_model()


# ------------------------------------------------------------------ #
# Fixture'lar                                                          #
# ------------------------------------------------------------------ #

@pytest.fixture
def category(db):
    return Category.objects.create(name='Izgara')


@pytest.fixture
def product(db, category):
    return Product.objects.create(
        category=category,
        name='Köfte',
        base_price=Decimal('120.00'),
    )


@pytest.fixture
def product2(db, category):
    return Product.objects.create(
        category=category,
        name='Tavuk Şiş',
        base_price=Decimal('100.00'),
    )


@pytest.fixture
def product_with_unit(db, category):
    p = Product.objects.create(
        category=category,
        name='Menü Izgara',
        base_price=Decimal('120.0000'),
    )
    ProductUnit.objects.create(
        product=p,
        name='Yarım Porsiyon',
        multiplier=Decimal('0.5000'),
        price_override=Decimal('60.0000'),
        order=0,
    )
    return p


@pytest.fixture
def stock_item(db):
    return StockItem.objects.create(
        name='Kıyma',
        sku='KIYMA-001',
        unit='kg',
        last_purchase_price=Decimal('80.00'),
    )


@pytest.fixture
def recipe(db, product, stock_item):
    r = Recipe.objects.create(product=product, name='Köfte Reçetesi', servings=4)
    RecipeIngredient.objects.create(
        recipe=r, stock_item=stock_item, quantity=Decimal('0.5'), unit='kg'
    )
    return r


@pytest.fixture
def menu_manager(db):
    cat = PermissionCategory.objects.get_or_create(code='menu', defaults={'name': 'Menü'})[0]
    role = Role.objects.create(name='Menü Yönetici')
    perm = RolePermission.objects.get_or_create(
        code='menu.manage_product',
        defaults={'name': 'Ürün Yönet', 'category': cat},
    )[0]
    role.permissions.add(perm)
    user = User.objects.create_user(username='menumanager', password='pw', email='menu@test.com')
    user.roles.add(role)
    return user


# ------------------------------------------------------------------ #
# P0-2 Regresyon: bulk_price — Decimal/transaction import             #
# ------------------------------------------------------------------ #

@pytest.mark.django_db
class TestBulkPriceRegression:
    """
    Daha önce `Decimal` ve `transaction` import'ları eksikti → NameError.
    Bu test, düzeltmenin geriye dönük sorun çıkarmadığını kanıtlar.
    """

    def test_yuzde_zammi_dogru_hesaplanir(self, product, product2, menu_manager):
        client = APIClient()
        client.force_authenticate(user=menu_manager)

        url = reverse('product-bulk-price')
        payload = {
            'product_ids': [str(product.id), str(product2.id)],
            'change_type': 'PERCENT',
            'value': 10,
        }
        response = client.post(url, payload, format='json')

        assert response.status_code == status.HTTP_200_OK, (
            f"bulk_price NameError regresyonu: {response.data}"
        )

        product.refresh_from_db()
        product2.refresh_from_db()
        assert product.base_price == Decimal('132.0000')   # 120 * 1.10
        assert product2.base_price == Decimal('110.0000')  # 100 * 1.10

    def test_toplu_fiyat_satilis_birimi_price_override_guncellenir(
        self, product_with_unit, menu_manager,
    ):
        """+% zamda özel fiyatlı satış birimi ana fiyat × çarpan ile hizalanır."""
        client = APIClient()
        client.force_authenticate(user=menu_manager)
        url = reverse('product-bulk-price')
        response = client.post(
            url,
            {'product_ids': [str(product_with_unit.id)], 'change_type': 'PERCENT', 'value': 10},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        product_with_unit.refresh_from_db()
        assert product_with_unit.base_price == Decimal('132.0000')
        u = product_with_unit.units.get()
        assert u.price_override == Decimal('66.0000')  # 132 * 0.5

    def test_sabit_deger_atamasi_dogru_uygulanir(self, product, menu_manager):
        """FIXED tipi: fiyatı verilen değere SET eder (toplama yapmaz)."""
        client = APIClient()
        client.force_authenticate(user=menu_manager)

        url = reverse('product-bulk-price')
        payload = {
            'product_ids': [str(product.id)],
            'change_type': 'FIXED',
            'value': 150,
        }
        response = client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_200_OK
        product.refresh_from_db()
        assert product.base_price == Decimal('150.0000')  # SET işlemi → 150

    def test_bos_product_ids_400_doner(self, menu_manager):
        client = APIClient()
        client.force_authenticate(user=menu_manager)

        url = reverse('product-bulk-price')
        response = client.post(url, {'product_ids': [], 'change_type': 'PERCENT', 'value': 5}, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_yetkisiz_erisim_engellenir(self, product):
        client = APIClient()
        url = reverse('product-bulk-price')
        response = client.post(url, {'product_ids': [str(product.id)], 'change_type': 'PERCENT', 'value': 5}, format='json')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ------------------------------------------------------------------ #
# P0-1 Regresyon: Recipe.total_cost — cost_per_unit kaldırıldı        #
# ------------------------------------------------------------------ #

@pytest.mark.django_db
class TestRecipeTotalCostRegression:
    """
    Daha önce `cost_per_unit` alanına erişiyordu → AttributeError.
    Düzeltme: `last_purchase_price` kullanılıyor.
    """

    def test_total_cost_attribute_error_vermez(self, recipe, stock_item):
        """P0-1 regresyon: cost_per_unit yerine last_purchase_price kullanılıyor."""
        try:
            cost = recipe.total_cost
        except AttributeError as exc:
            pytest.fail(f"total_cost AttributeError fırlattı (P0-1 regresyonu): {exc}")

        expected = Decimal('0.5') * stock_item.last_purchase_price
        assert cost == expected

    def test_malzeme_yoksa_sifir_doner(self, product):
        recipe_empty = Recipe.objects.create(
            product=product, name='Boş Reçete', servings=1
        )
        assert recipe_empty.total_cost == 0

    def test_porsiyon_basi_maliyet_dogru_hesaplanir(self, recipe, stock_item):
        expected_total = Decimal('0.5') * stock_item.last_purchase_price
        expected_per_serving = expected_total / recipe.servings
        assert recipe.cost_per_serving == expected_per_serving

    def test_last_purchase_price_sifir_ise_toplam_sifir_doner(self, product, category):
        """last_purchase_price default=0 (NOT NULL), sıfır değerinde total_cost=0 olmalı."""
        item_zero_price = StockItem.objects.create(
            name='Bilinmeyen Malzeme',
            sku='BM-001',
            unit='adet',
            last_purchase_price=ZERO_MONEY,
        )
        r = Recipe.objects.create(product=product, name='Fiyatsız Reçete', servings=1)
        RecipeIngredient.objects.create(recipe=r, stock_item=item_zero_price, quantity=Decimal('2'), unit='adet')
        assert r.total_cost == 0


# ------------------------------------------------------------------ #
# Regresyon: bulk_discount ve bulk_price ile indirimli fiyat cache'i #
# ------------------------------------------------------------------ #

@pytest.mark.django_db
class TestBulkDiscountRegression:
    """
    Daha önce toplu indirim (bulk_discount) ve toplu fiyat (bulk_price) işlemlerinde
    indirimli fiyat cache'i (discounted_price_cached) güncellenmiyordu.
    """

    def test_bulk_discount_recalculates_price_cache(self, product, product2, menu_manager):
        client = APIClient()
        client.force_authenticate(user=menu_manager)

        # Başlangıçta indirim yok
        assert product.discounted_price_cached == product.base_price

        url = reverse('product-bulk-discount')
        payload = {
            'product_ids': [str(product.id), str(product2.id)],
            'discount_rate': 5,
        }
        response = client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_200_OK

        product.refresh_from_db()
        product2.refresh_from_db()

        # %5 indirim ile indirimli fiyat cache'inin güncellendiğini doğrula
        assert product.discount_rate == Decimal('5.000')
        assert product.discounted_price_cached == Decimal('114.0000')  # 120 * 0.95
        assert product2.discount_rate == Decimal('5.000')
        assert product2.discounted_price_cached == Decimal('95.0000')   # 100 * 0.95

    def test_bulk_price_recalculates_price_cache(self, product, menu_manager):
        client = APIClient()
        client.force_authenticate(user=menu_manager)

        # Önce indirim uygulayalım (bunu save ile doğrudan yapalım)
        product.discount_rate = Decimal('5.000')
        product.save()
        assert product.discounted_price_cached == Decimal('114.0000')

        # Şimdi bulk_price ile fiyat zammı uygulayalım
        url = reverse('product-bulk-price')
        payload = {
            'product_ids': [str(product.id)],
            'change_type': 'PERCENT',
            'value': 10,  # %10 zam
        }
        response = client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_200_OK

        product.refresh_from_db()
        # Yeni base_price = 120 * 1.10 = 132.00
        assert product.base_price == Decimal('132.0000')
        # Yeni discounted_price_cached = 132 * 0.95 = 125.40
        assert product.discounted_price_cached == Decimal('125.4000')

    def test_clear_product_image_regression(self, product, menu_manager):
        """Resmi olan üründen resim kaldırılmaya çalışıldığında 400 Bad Request alınmamalıdır."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        menu_manager.is_superuser = True
        menu_manager.save()

        client = APIClient()
        client.force_authenticate(user=menu_manager)

        # Önce ürüne sahte bir resim atayalım
        image_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
        fake_image = SimpleUploadedFile("test_image.png", image_content, content_type="image/png")
        product.image = fake_image
        product.save()

        assert product.image is not None

        # Resmi kaldırmak için boş string gönderelim
        url = reverse('product-detail', kwargs={'pk': str(product.id)})
        payload = {
            'category': str(product.category.id),
            'name': product.name,
            'base_price': str(product.base_price),
            'image': '',  # Boş string resmi temizler
        }
        response = client.patch(url, payload, format='multipart')
        assert response.status_code == status.HTTP_200_OK

        product.refresh_from_db()
        assert not product.image  # Resim temizlenmiş olmalı


class TestProductImageUrlRegression:
    def test_product_detail_returns_relative_media_url(self, product, menu_manager):
        from django.core.files.uploadedfile import SimpleUploadedFile

        menu_manager.is_superuser = True
        menu_manager.save()

        image_content = (
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
            b'\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01'
            b'\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
        )
        product.image = SimpleUploadedFile(
            "test_image.png", image_content, content_type="image/png"
        )
        product.save()

        client = APIClient()
        client.force_authenticate(user=menu_manager)

        url = reverse('product-detail', kwargs={'pk': str(product.id)})
        response = client.get(url, HTTP_HOST='127.0.0.1:8000')

        assert response.status_code == status.HTTP_200_OK
        image_url = response.data.get('image')
        assert image_url
        assert image_url.startswith('/media/')
        assert '127.0.0.1' not in image_url

