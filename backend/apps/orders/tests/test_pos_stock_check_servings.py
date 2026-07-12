"""POS sipariş öncesi stok kontrolü — porsiyon sayısı ve birim dönüşümü testleri.

Bu test dosyası, `check_pos_cart_station_stock` ve `deduct_for_order`
fonksiyonlarının `RecipeIngredient.normalized_quantity` (stok birimi cinsinden)
kullanarak doğru hesaplama yaptığını doğrular.
"""

import pytest
from decimal import Decimal

from core.decimal_constants import ZERO_QTY
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status as http_status
from rest_framework.test import APIClient

from apps.branches.models import Branch, Zone, Table, TableStatus
from apps.inventory.models import StockItem, StockUnit
from apps.inventory.services import InventoryService
from apps.menu.models import Category, Product
from apps.orders.models import Order, OrderItem, OrderStatus
from apps.recipes.models import Recipe, RecipeIngredient
from apps.warehouse.models import Warehouse, WarehouseStockLevel
from rbac.models import Role, RolePermission, PermissionCategory

User = get_user_model()


# ------------------------------------------------------------------ #
# Fixtures                                                             #
# ------------------------------------------------------------------ #


@pytest.fixture
def _stock_units(db):
    """Birim tanımlamaları: kg (çarpan 1) ve g (çarpan 0.001)."""
    kg = StockUnit.objects.create(name='Kilogram', short_name='kg', multiplier=Decimal('1.000'))
    g = StockUnit.objects.create(name='Gram', short_name='g', multiplier=Decimal('0.001'))
    return kg, g


@pytest.fixture
def branch(db):
    return Branch.objects.create(name='Test Şubesi', code='TSTSTK')


@pytest.fixture
def kitchen_warehouse(db, branch):
    wh = Warehouse.objects.create(
        name='Mutfak Deposu',
        code='WH-KITCHEN-TST',
        warehouse_type='KITCHEN',
        is_default=False,
    )
    wh.branches.add(branch)
    return wh


@pytest.fixture
def zone(db, branch):
    return Zone.objects.create(branch=branch, name='Salon')


@pytest.fixture
def table(db, zone):
    return Table.objects.create(zone=zone, name='M1', table_number=1, status=TableStatus.FREE)


@pytest.fixture
def category(db):
    return Category.objects.create(name='Ana Yemekler')


@pytest.fixture
def stock_item_kg(db, _stock_units):
    """Stok kalemi: birim 'kg'."""
    return StockItem.objects.create(
        name='Tavuk Göğsü',
        sku='TG-001',
        unit='kg',
        minimum_quantity=ZERO_QTY,
    )


@pytest.fixture
def product_with_recipe(db, category, stock_item_kg):
    """
    10 porsiyon reçete, 2000 g (= 2 kg normalize) tavuk göğsü kullanan ürün.
    1 porsiyon = 0.2 kg.
    """
    product = Product.objects.create(
        category=category,
        name='Tavuk Sote',
        base_price=Decimal('120.00'),
    )
    recipe = Recipe.objects.create(
        product=product,
        name='Tavuk Sote Reçetesi',
        servings=10,
    )
    # 2000 g tavuk — stok birimi kg olduğundan normalized_quantity = 2.000
    RecipeIngredient.objects.create(
        recipe=recipe,
        stock_item=stock_item_kg,
        quantity=Decimal('2000.000'),
        unit='g',
    )
    return product


@pytest.fixture
def pos_user(db, branch):
    rbac_cat, _ = PermissionCategory.objects.get_or_create(
        code='orders', defaults={'name': 'Siparişler'},
    )
    role = Role.objects.create(name='POS Kasiyer Stok Test')
    for code, name in [
        ('orders.manage_order', 'Sipariş Yönet'),
        ('pos.view_pos', 'POS Görüntüle'),
    ]:
        perm, _ = RolePermission.objects.get_or_create(
            code=code, defaults={'name': name, 'category': rbac_cat},
        )
        role.permissions.add(perm)
    user = User.objects.create_user(
        username='kasiyerstoktest', password='pw', email='kasiyerstok@test.com', branch=branch,
    )
    user.roles.add(role)
    return user


@pytest.fixture
def api_client():
    return APIClient()


# ------------------------------------------------------------------ #
# Tests: check_pos_cart_station_stock                                  #
# ------------------------------------------------------------------ #


@pytest.mark.django_db
def test_stock_check_respects_servings_and_normalized_quantity(
    kitchen_warehouse, branch, product_with_recipe, stock_item_kg, _stock_units
):
    """
    Senaryo: 10 porsiyon, 2000 g (= 2 kg) tavuk göğsü.
    Depoda 5 kg mevcut. 1 porsiyon sipariş → ihtiyaç = 0.2 kg → OK olmalı.
    """
    WarehouseStockLevel.objects.create(
        warehouse=kitchen_warehouse,
        stock_item=stock_item_kg,
        quantity=Decimal('5.000'),
        minimum_quantity=ZERO_QTY,
    )
    result = InventoryService.check_pos_cart_station_stock(
        str(branch.id),
        [{'product_id': product_with_recipe.id, 'quantity': 1}],
    )
    assert result['ok'] is True, (
        f"1 porsiyon sipariş için yeterli stok var (5 kg ≥ 0.2 kg) ama kontrol başarısız: "
        f"{result['issues']}"
    )
    assert result['issues'] == []


@pytest.mark.django_db
def test_stock_check_insufficient_when_not_enough(
    kitchen_warehouse, branch, product_with_recipe, stock_item_kg, _stock_units
):
    """
    Depoda 0.1 kg mevcut, 1 porsiyon = 0.2 kg → yetersiz.
    """
    WarehouseStockLevel.objects.create(
        warehouse=kitchen_warehouse,
        stock_item=stock_item_kg,
        quantity=Decimal('0.100'),
        minimum_quantity=ZERO_QTY,
    )
    result = InventoryService.check_pos_cart_station_stock(
        str(branch.id),
        [{'product_id': product_with_recipe.id, 'quantity': 1}],
    )
    assert result['ok'] is False
    assert any(i['code'] == 'INSUFFICIENT_STOCK' for i in result['issues'])


@pytest.mark.django_db
def test_stock_check_multiple_servings(
    kitchen_warehouse, branch, product_with_recipe, stock_item_kg, _stock_units
):
    """
    3 porsiyon sipariş → ihtiyaç = 3 × 0.2 = 0.6 kg. Depoda 0.5 kg → yetersiz.
    """
    WarehouseStockLevel.objects.create(
        warehouse=kitchen_warehouse,
        stock_item=stock_item_kg,
        quantity=Decimal('0.500'),
        minimum_quantity=ZERO_QTY,
    )
    result = InventoryService.check_pos_cart_station_stock(
        str(branch.id),
        [{'product_id': product_with_recipe.id, 'quantity': 3}],
    )
    assert result['ok'] is False
    assert any(i['code'] == 'INSUFFICIENT_STOCK' for i in result['issues'])


@pytest.mark.django_db
def test_stock_check_multiple_servings_sufficient(
    kitchen_warehouse, branch, product_with_recipe, stock_item_kg, _stock_units
):
    """
    3 porsiyon sipariş → 0.6 kg. Depoda 1.0 kg → yeterli.
    """
    WarehouseStockLevel.objects.create(
        warehouse=kitchen_warehouse,
        stock_item=stock_item_kg,
        quantity=Decimal('1.000'),
        minimum_quantity=ZERO_QTY,
    )
    result = InventoryService.check_pos_cart_station_stock(
        str(branch.id),
        [{'product_id': product_with_recipe.id, 'quantity': 3}],
    )
    assert result['ok'] is True, (
        f"3 porsiyon = 0.6 kg, depoda 1.0 kg → yeterli olmalı: {result['issues']}"
    )


@pytest.mark.django_db
def test_stock_check_api_with_servings(
    api_client, kitchen_warehouse, branch, product_with_recipe, stock_item_kg, pos_user, _stock_units
):
    """API endpoint'inin porsiyon bazlı hesaplamayı doğru döndürdüğünü kontrol eder."""
    WarehouseStockLevel.objects.create(
        warehouse=kitchen_warehouse,
        stock_item=stock_item_kg,
        quantity=Decimal('5.000'),
        minimum_quantity=ZERO_QTY,
    )
    api_client.force_authenticate(user=pos_user)
    url = reverse('order-check-station-stock')
    res = api_client.post(
        url,
        {
            'branch_id': str(branch.id),
            'items': [{'product_id': str(product_with_recipe.id), 'quantity': 1}],
        },
        format='json',
    )
    assert res.status_code == http_status.HTTP_200_OK
    body = res.json()
    assert body['ok'] is True


# ------------------------------------------------------------------ #
# Tests: deduct_for_order (stok düşümü)                                #
# ------------------------------------------------------------------ #


@pytest.mark.django_db
def test_deduct_for_order_uses_normalized_quantity(
    kitchen_warehouse, branch, table, product_with_recipe, stock_item_kg, pos_user, _stock_units
):
    """
    Sipariş tamamlandığında stok düşümü normalized_quantity / servings ile yapılmalı.
    10 porsiyon reçete, 2 kg tavuk. 1 adet sipariş → 0.2 kg düşmeli.
    """
    WarehouseStockLevel.objects.create(
        warehouse=kitchen_warehouse,
        stock_item=stock_item_kg,
        quantity=Decimal('5.000'),
        minimum_quantity=ZERO_QTY,
    )
    order = Order.objects.create(
        branch=branch,
        table=table,
        status=OrderStatus.PENDING,
        total_amount=Decimal('120.00'),
    )
    OrderItem.objects.create(
        order=order,
        product=product_with_recipe,
        quantity=1,
        unit_price=Decimal('120.00'),
        total_price=Decimal('120.00'),
        status=OrderStatus.PENDING,
    )
    movements = InventoryService.deduct_for_order(order, performed_by=pos_user)
    assert len(movements) == 1, "Tek malzeme için tek hareket olmalı"

    # Düşülen miktar: 2.000 (normalize) / 10 (porsiyon) * 1 = 0.200 kg
    assert movements[0].quantity == Decimal('0.200'), (
        f"Beklenen 0.200 kg düşüm, gerçekleşen: {movements[0].quantity}"
    )

    # Depodaki kalan: 5.000 - 0.200 = 4.800
    level = WarehouseStockLevel.objects.get(
        warehouse=kitchen_warehouse,
        stock_item=stock_item_kg,
    )
    assert level.quantity == Decimal('4.800'), (
        f"Depoda 4.800 kg kalmalı, gerçek: {level.quantity}"
    )


@pytest.mark.django_db
def test_deduct_for_order_multiple_qty(
    kitchen_warehouse, branch, table, product_with_recipe, stock_item_kg, pos_user, _stock_units
):
    """
    5 adet sipariş → 5 × 0.2 = 1.0 kg düşmeli.
    """
    WarehouseStockLevel.objects.create(
        warehouse=kitchen_warehouse,
        stock_item=stock_item_kg,
        quantity=Decimal('5.000'),
        minimum_quantity=ZERO_QTY,
    )
    order = Order.objects.create(
        branch=branch,
        table=table,
        status=OrderStatus.PENDING,
        total_amount=Decimal('600.00'),
    )
    OrderItem.objects.create(
        order=order,
        product=product_with_recipe,
        quantity=5,
        unit_price=Decimal('120.00'),
        total_price=Decimal('600.00'),
        status=OrderStatus.PENDING,
    )
    movements = InventoryService.deduct_for_order(order, performed_by=pos_user)
    assert len(movements) == 1
    assert movements[0].quantity == Decimal('1.000'), (
        f"5 porsiyon = 1.0 kg düşüm, gerçekleşen: {movements[0].quantity}"
    )
    level = WarehouseStockLevel.objects.get(
        warehouse=kitchen_warehouse,
        stock_item=stock_item_kg,
    )
    assert level.quantity == Decimal('4.000')
