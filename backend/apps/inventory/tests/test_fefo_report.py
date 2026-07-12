import pytest
from decimal import Decimal
from datetime import date, timedelta
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.inventory.models import StockItem, StockLot
from apps.inventory.selectors import get_detailed_fefo_inventory_report
from apps.branches.models import Branch
from apps.warehouse.models import Warehouse, WarehouseType
from rbac.models import PermissionCategory, Role, RolePermission

User = get_user_model()


def _make_perm(code, name, cat):
    return RolePermission.objects.get_or_create(code=code, defaults={'name': name, 'category': cat})[0]


@pytest.fixture
def inv_cat(db):
    return PermissionCategory.objects.get_or_create(code='inventory', defaults={'name': 'Envanter'})[0]


@pytest.fixture
def branch(db):
    return Branch.objects.create(name='FEFO Test Şubesi', code='FEFO-B')


@pytest.fixture
def fefo_view_user(db, branch, inv_cat):
    role = Role.objects.create(name='FEFO Görüntüleyici')
    role.permissions.add(_make_perm('inventory.view_expiry_risk', 'SKT Gör', inv_cat))
    user = User.objects.create_user(username='fefoview', password='pw', email='fefo@test.com', branch=branch)
    user.roles.add(role)
    return user


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def warehouse(db, branch):
    wh = Warehouse.objects.create(name='Test Depo', code='TEST-WH', warehouse_type=WarehouseType.MAIN)
    wh.branches.add(branch)
    return wh

@pytest.mark.django_db
def test_get_detailed_fefo_inventory_report(warehouse, stock_item):
    # 1. Farklı SKT ve fiyatlarda lotlar ekleyelim
    today = date.today()
    
    # Lot A: En geç SKT (veya boş), 10 birim @ 10 TL
    lot_a = StockLot.objects.create(
        stock_item=stock_item,
        warehouse=warehouse,
        lot_number='LOT-A',
        expiry_date=today + timedelta(days=30),
        quantity=Decimal('10.000'),
        initial_quantity=Decimal('10.000'),
        unit_price=Decimal('10.00')
    )
    
    # Lot B: En yakın SKT, 5 birim @ 12 TL
    lot_b = StockLot.objects.create(
        stock_item=stock_item,
        warehouse=warehouse,
        lot_number='LOT-B',
        expiry_date=today + timedelta(days=5),
        quantity=Decimal('5.000'),
        initial_quantity=Decimal('5.000'),
        unit_price=Decimal('12.00')
    )
    
    # Lot C: SKT yok, 20 birim @ 11 TL
    lot_c = StockLot.objects.create(
        stock_item=stock_item,
        warehouse=warehouse,
        lot_number='LOT-C',
        expiry_date=None,
        quantity=Decimal('20.000'),
        initial_quantity=Decimal('20.000'),
        unit_price=Decimal('11.00')
    )
    
    # Raporu çekelim
    report_qs = get_detailed_fefo_inventory_report(warehouse_id=warehouse.id)
    
    assert report_qs.count() == 1
    item_data = report_qs.first()
    
    # active_lots kontrolü (Prefetch sayesinde gelmiş olmalı)
    active_lots = getattr(item_data, 'active_lots', [])
    assert len(active_lots) == 3
    
    # FEFO Sıralama Kontrolü: 
    # 1. Lot B (En yakın SKT: +5 gün)
    # 2. Lot A (En uzak SKT: +30 gün)
    # 3. Lot C (SKT None - nulls_last=True ise en sonda olmalı)
    
    assert active_lots[0].lot_number == 'LOT-B'
    assert active_lots[1].lot_number == 'LOT-A'
    assert active_lots[2].lot_number == 'LOT-C'
    
    # Toplam değer kontrolü (Serializer mantığıyla manuel hesaplayalım)
    total_value = sum(lot.quantity * lot.unit_price for lot in active_lots)
    # (5 * 12) + (10 * 10) + (20 * 11) = 60 + 100 + 220 = 380
    assert total_value == Decimal('380.00')


@pytest.mark.django_db
def test_get_detailed_fefo_inventory_report_list_mode_without_lots(warehouse, stock_item):
    today = date.today()
    StockLot.objects.create(
        stock_item=stock_item,
        warehouse=warehouse,
        lot_number='LOT-LIST',
        expiry_date=today + timedelta(days=10),
        quantity=Decimal('4.000'),
        initial_quantity=Decimal('4.000'),
        unit_price=Decimal('25.00'),
    )

    report_qs = get_detailed_fefo_inventory_report(
        warehouse_id=warehouse.id,
        include_lot_details=False,
    )

    assert report_qs.count() == 1
    item_data = report_qs.first()
    assert not hasattr(item_data, 'active_lots') or getattr(item_data, 'active_lots', None) is None
    assert item_data.fefo_total_quantity == Decimal('4.000')
    assert item_data.fefo_total_value == Decimal('100.00')


@pytest.mark.django_db
def test_fefo_report_api_list_excludes_lots(api_client, warehouse, stock_item, fefo_view_user):
    today = date.today()
    StockLot.objects.create(
        stock_item=stock_item,
        warehouse=warehouse,
        lot_number='LOT-API',
        expiry_date=today + timedelta(days=3),
        quantity=Decimal('2.000'),
        initial_quantity=Decimal('2.000'),
        unit_price=Decimal('15.00'),
    )

    api_client.force_authenticate(user=fefo_view_user)
    res = api_client.get(
        '/api/v1/inventory/stock-items/fefo-report/',
        {'warehouse_id': str(warehouse.id)},
    )
    assert res.status_code == 200
    body = res.json()
    results = body.get('results', body)
    assert len(results) == 1
    assert 'lots' not in results[0]
    assert Decimal(str(results[0]['total_quantity'])) == Decimal('2')


@pytest.mark.django_db
def test_fefo_report_detail_api_returns_lots(api_client, warehouse, stock_item, fefo_view_user):
    today = date.today()
    StockLot.objects.create(
        stock_item=stock_item,
        warehouse=warehouse,
        lot_number='LOT-DETAIL',
        expiry_date=today + timedelta(days=7),
        quantity=Decimal('3.000'),
        initial_quantity=Decimal('3.000'),
        unit_price=Decimal('20.00'),
    )

    api_client.force_authenticate(user=fefo_view_user)
    res = api_client.get(
        '/api/v1/inventory/stock-items/fefo-report/detail/',
        {
            'stock_item_id': str(stock_item.id),
            'warehouse_id': str(warehouse.id),
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body['id'] == str(stock_item.id)
    assert len(body['lots']) == 1
    assert body['lots'][0]['lot_number'] == 'LOT-DETAIL'
