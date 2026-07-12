"""Sipariş oluşturmada seçenek (modifier) fiyat ve doğrulama testleri."""
import pytest
from decimal import Decimal

from apps.menu.models import Modifier, ModifierGroup
from apps.menu.services import MenuService
from apps.orders.models import OrderItemModifier
from apps.orders.services.order_core_service import OrderCoreService
from apps.orders.services.sale_helper import OrderValidationError


@pytest.fixture
def saucy_product(db, product):
    group = ModifierGroup.objects.create(name='Sos', is_required=True, is_multiple=False)
    mod = Modifier.objects.create(
        group=group,
        name='Acılı',
        price_adjustment=Decimal('10.00'),
    )
    product.modifier_groups.add(group)
    return product, mod


@pytest.mark.django_db
def test_create_order_with_modifiers_pricing(branch, table, pos_user, saucy_product):
    product, mod = saucy_product
    product.branches.add(branch)

    order = OrderCoreService.create_order(
        branch_id=branch.id,
        table_id=table.id,
        order_type='TABLE',
        user=pos_user,
        notes='',
        items_data=[{
            'product_id': product.id,
            'quantity': 2,
            'unit_price': product.base_price,
            'modifier_ids': [mod.id],
        }],
        stock_tracking_mode='PRODUCT',
        skip_station_stock_check=True,
    )

    item = order.items.first()
    assert item.total_price == (product.base_price + Decimal('10.00')) * 2
    assert OrderItemModifier.objects.filter(order_item=item, modifier=mod).exists()


@pytest.mark.django_db
def test_create_order_rejects_missing_required_modifier(branch, table, pos_user, saucy_product):
    product, _mod = saucy_product
    product.branches.add(branch)

    with pytest.raises(OrderValidationError):
        OrderCoreService.create_order(
            branch_id=branch.id,
            table_id=table.id,
            order_type='TABLE',
            user=pos_user,
            notes='',
            items_data=[{
                'product_id': product.id,
                'quantity': 1,
                'unit_price': product.base_price,
                'modifier_ids': [],
            }],
            stock_tracking_mode='PRODUCT',
            skip_station_stock_check=True,
        )
