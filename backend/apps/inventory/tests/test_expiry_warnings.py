"""SKT erken uyarı ve aksiyon API testleri."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.branches.models import Branch
from apps.inventory.models import ExpiryAction, ExpiryActionType, StockLot, StockMovement, StockMovementType
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
    return Branch.objects.create(name='SKT Test Şubesi', code='SKT-B')


@pytest.fixture
def warehouse(db, branch):
    wh = Warehouse.objects.create(name='SKT Depo', code='SKT-WH', warehouse_type=WarehouseType.MAIN)
    wh.branches.add(branch)
    return wh


@pytest.fixture
def expiry_view_user(db, branch, inv_cat):
    role = Role.objects.create(name='SKT Görüntüleyici')
    role.permissions.add(_make_perm('inventory.view_expiry_risk', 'SKT Gör', inv_cat))
    user = User.objects.create_user(username='sktview', password='pw', email='skt@test.com', branch=branch)
    user.roles.add(role)
    return user


@pytest.fixture
def expiry_manage_user(db, branch, inv_cat):
    role = Role.objects.create(name='SKT Yönetici')
    for code, name in [
        ('inventory.view_expiry_risk', 'SKT Gör'),
        ('inventory.manage_expiry_action', 'SKT Aksiyon'),
    ]:
        role.permissions.add(_make_perm(code, name, inv_cat))
    user = User.objects.create_user(username='sktmgr', password='pw', email='mgr@test.com', branch=branch)
    user.roles.add(role)
    return user


@pytest.fixture
def return_cancel_user(db, branch, inv_cat):
    role = Role.objects.create(name='SKT İptal İade')
    for code, name in [
        ('inventory.view_expiry_risk', 'SKT Gör'),
        ('inventory.manage_return_cancel', 'İptal İade'),
    ]:
        role.permissions.add(_make_perm(code, name, inv_cat))
    user = User.objects.create_user(username='rcuser', password='pw', email='rc@test.com', branch=branch)
    user.roles.add(role)
    return user


@pytest.fixture
def expired_lot(db, warehouse, stock_item):
    return StockLot.objects.create(
        stock_item=stock_item,
        warehouse=warehouse,
        lot_number='LOT-OLD',
        expiry_date=date.today() - timedelta(days=1),
        quantity=Decimal('4.000'),
        initial_quantity=Decimal('4.000'),
        unit_price=Decimal('10.00'),
    )


@pytest.fixture
def expiring_lot(db, warehouse, stock_item):
    return StockLot.objects.create(
        stock_item=stock_item,
        warehouse=warehouse,
        lot_number='LOT-EXP',
        expiry_date=date.today() + timedelta(days=2),
        quantity=Decimal('5.000'),
        initial_quantity=Decimal('5.000'),
        unit_price=Decimal('10.00'),
    )


@pytest.mark.django_db
def test_expiring_lots_sorted_by_expiry_date(warehouse, stock_item):
    today = date.today()
    StockLot.objects.create(
        stock_item=stock_item,
        warehouse=warehouse,
        lot_number='LOT-LATE',
        expiry_date=today + timedelta(days=7),
        quantity=Decimal('1'),
        initial_quantity=Decimal('1'),
    )
    lot_soon = StockLot.objects.create(
        stock_item=stock_item,
        warehouse=warehouse,
        lot_number='LOT-SOON',
        expiry_date=today + timedelta(days=1),
        quantity=Decimal('1'),
        initial_quantity=Decimal('1'),
    )

    from apps.inventory.selectors import get_expiring_lots_qs

    lots = list(get_expiring_lots_qs(warehouse_id=warehouse.id, days_ahead=7))
    assert lots[0].id == lot_soon.id


@pytest.mark.django_db
def test_expiry_warnings_list_requires_view_permission(branch, warehouse, expiring_lot):
    client = APIClient()
    user = User.objects.create_user(username='noperm', password='pw', branch=branch)
    client.force_authenticate(user=user)

    resp = client.get('/api/v1/inventory/expiry-warnings/', {'warehouse_id': str(warehouse.id)})
    assert resp.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_expiry_warnings_list_with_permission(expiry_view_user, warehouse, expiring_lot):
    client = APIClient()
    client.force_authenticate(user=expiry_view_user)

    resp = client.get('/api/v1/inventory/expiry-warnings/', {'warehouse_id': str(warehouse.id), 'days_ahead': 3})
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data['count'] == 1
    assert resp.data['results'][0]['lot_number'] == 'LOT-EXP'


@pytest.mark.django_db
def test_expiry_summary_counts(expiry_view_user, warehouse, stock_item):
    today = date.today()
    StockLot.objects.create(
        stock_item=stock_item,
        warehouse=warehouse,
        lot_number='EXPIRED',
        expiry_date=today - timedelta(days=1),
        quantity=Decimal('1'),
        initial_quantity=Decimal('1'),
    )
    StockLot.objects.create(
        stock_item=stock_item,
        warehouse=warehouse,
        lot_number='SOON',
        expiry_date=today + timedelta(days=2),
        quantity=Decimal('1'),
        initial_quantity=Decimal('1'),
    )

    client = APIClient()
    client.force_authenticate(user=expiry_view_user)
    resp = client.get('/api/v1/inventory/expiry-warnings/summary/', {'warehouse_id': str(warehouse.id)})
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data['expired'] == 1
    assert resp.data['within_3_days'] == 2


@pytest.mark.django_db
def test_expiry_action_creates_audit(expiry_manage_user, expiring_lot):
    client = APIClient()
    client.force_authenticate(user=expiry_manage_user)

    resp = client.post(
        '/api/v1/inventory/expiry-warnings/actions/',
        {
            'lot_id': str(expiring_lot.id),
            'action_type': ExpiryActionType.PRIORITY_CONSUME,
            'notes': 'Önce tüket',
        },
        format='json',
    )
    assert resp.status_code == status.HTTP_201_CREATED
    assert ExpiryAction.objects.filter(stock_lot=expiring_lot).count() == 1
    assert AuditLog.objects.filter(action='inventory.expiry_action.priority_consume').exists()


@pytest.mark.django_db
def test_stock_item_expiring_lots_read_permission(expiry_view_user, warehouse, expiring_lot):
    """Legacy endpoint RBAC düzeltmesi: view_expiry_risk yeterli olmalı."""
    client = APIClient()
    client.force_authenticate(user=expiry_view_user)

    resp = client.get('/api/v1/inventory/stock-items/expiring_lots/', {'warehouse_id': str(warehouse.id)})
    assert resp.status_code == status.HTTP_200_OK
    assert len(resp.data) == 1


@pytest.mark.django_db
def test_scan_expiring_lots_daily_task(warehouse, expiring_lot):
    from apps.inventory.tasks import scan_expiring_lots_daily

    result = scan_expiring_lots_daily(days_ahead=7)
    assert result['total_lots'] >= 1
    assert result['warehouses_with_risk'] >= 1


@pytest.mark.django_db
def test_auto_return_cancel_expired_lot_creates_cancel_movement(
    return_cancel_user, warehouse, stock_item, stock_level, expired_lot,
):
    client = APIClient()
    client.force_authenticate(user=return_cancel_user)

    resp = client.post(
        '/api/v1/inventory/expiry-warnings/auto-return-cancel/',
        {'lot_id': str(expired_lot.id)},
        format='json',
    )
    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.data['movement_type'] == StockMovementType.CANCEL
    assert resp.data['reference'] == 'EXPIRED'
    assert Decimal(resp.data['quantity']) == Decimal('4.000')

    expired_lot.refresh_from_db()
    stock_level.refresh_from_db()
    assert expired_lot.quantity == Decimal('0')
    assert stock_level.quantity == Decimal('96.000')
    assert StockMovement.objects.filter(movement_type=StockMovementType.CANCEL).count() == 1
    assert AuditLog.objects.filter(action='inventory.expiry_auto_return_cancel').exists()


@pytest.mark.django_db
def test_auto_return_cancel_rejects_non_expired_lot(
    return_cancel_user, expiring_lot,
):
    client = APIClient()
    client.force_authenticate(user=return_cancel_user)

    resp = client.post(
        '/api/v1/inventory/expiry-warnings/auto-return-cancel/',
        {'lot_id': str(expiring_lot.id)},
        format='json',
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_auto_return_cancel_requires_permission(expired_lot, expiry_view_user):
    client = APIClient()
    client.force_authenticate(user=expiry_view_user)

    resp = client.post(
        '/api/v1/inventory/expiry-warnings/auto-return-cancel/',
        {'lot_id': str(expired_lot.id)},
        format='json',
    )
    assert resp.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_auto_return_cancel_returnable_item_uses_return(
    return_cancel_user, warehouse, stock_item, stock_level, expired_lot,
):
    stock_item.is_returnable = True
    stock_item.save(update_fields=['is_returnable', 'updated_at'])

    client = APIClient()
    client.force_authenticate(user=return_cancel_user)

    resp = client.post(
        '/api/v1/inventory/expiry-warnings/auto-return-cancel/',
        {'lot_id': str(expired_lot.id)},
        format='json',
    )
    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.data['movement_type'] == StockMovementType.RETURN
