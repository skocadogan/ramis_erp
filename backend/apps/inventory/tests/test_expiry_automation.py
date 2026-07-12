"""SKT Phase-2 otomasyon testleri."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.branches.models import Branch
from apps.inventory.models import ExpiryActionType, StockLot
from apps.inventory.services.lot_consumption_service import order_lots_fefo
from apps.menu.models import Category, Product
from apps.prep.models import PrepStatus, PrepTask
from apps.production_planning.models import ProductionPlan, ProductionPlanStatus
from apps.recipes.models import Recipe, RecipeIngredient
from apps.warehouse.models import TransferStatus, Warehouse, WarehouseTransfer, WarehouseType, WarehouseStockLevel
from rbac.models import PermissionCategory, Role, RolePermission

User = get_user_model()


def _make_perm(code, name, cat):
    return RolePermission.objects.get_or_create(code=code, defaults={'name': name, 'category': cat})[0]


@pytest.fixture
def inv_cat(db):
    return PermissionCategory.objects.get_or_create(code='inventory', defaults={'name': 'Envanter'})[0]


@pytest.fixture
def branch(db):
    return Branch.objects.create(name='Auto SKT Şube', code='ASKT')


@pytest.fixture
def main_warehouse(db, branch):
    wh = Warehouse.objects.create(name='Ana Depo', code='ASKT-MAIN', warehouse_type=WarehouseType.MAIN)
    wh.branches.add(branch)
    return wh


@pytest.fixture
def kitchen_warehouse(db, branch):
    wh = Warehouse.objects.create(name='Mutfak Depo', code='ASKT-KIT', warehouse_type=WarehouseType.KITCHEN)
    wh.branches.add(branch)
    return wh


@pytest.fixture
def expiry_manage_user(db, branch, inv_cat):
    role = Role.objects.create(name='Auto SKT Yönetici')
    for code, name in [
        ('inventory.view_expiry_risk', 'SKT Gör'),
        ('inventory.manage_expiry_action', 'SKT Aksiyon'),
    ]:
        role.permissions.add(_make_perm(code, name, inv_cat))
    user = User.objects.create_user(username='autoskt', password='pw', email='auto@test.com', branch=branch)
    user.roles.add(role)
    return user


@pytest.fixture
def expiring_lot(db, main_warehouse, stock_item):
    WarehouseStockLevel.objects.create(
        warehouse=main_warehouse,
        stock_item=stock_item,
        quantity=Decimal('10'),
    )
    return StockLot.objects.create(
        stock_item=stock_item,
        warehouse=main_warehouse,
        lot_number='AUTO-LOT-1',
        expiry_date=timezone.now().date() + timedelta(days=2),
        quantity=Decimal('10'),
        initial_quantity=Decimal('10'),
        unit_price=Decimal('50'),
    )


@pytest.fixture
def api_client(expiry_manage_user):
    client = APIClient()
    client.force_authenticate(user=expiry_manage_user)
    return client


@override_settings(EXPIRY_ACTION_AUTOMATION_ENABLED=False)
def test_execute_flag_off_uses_legacy(api_client, expiring_lot):
    resp = api_client.post(
        '/api/v1/inventory/expiry-warnings/actions/execute/',
        {
            'lot_id': str(expiring_lot.id),
            'action_type': ExpiryActionType.PRIORITY_CONSUME,
            'notes': 'test',
        },
        format='json',
    )
    assert resp.status_code == status.HTTP_201_CREATED
    expiring_lot.refresh_from_db()
    assert expiring_lot.fefo_priority_boost == 0


@override_settings(
    EXPIRY_ACTION_AUTOMATION_ENABLED=True,
    EXPIRY_FEFO_BOOST_VALUE=100,
    EXPIRY_PREP_PRIORITY_DELTA=5,
)
def test_priority_consume_boosts_fefo(api_client, expiring_lot):
    preview = api_client.post(
        '/api/v1/inventory/expiry-warnings/actions/preview/',
        {
            'lot_id': str(expiring_lot.id),
            'action_type': ExpiryActionType.PRIORITY_CONSUME,
        },
        format='json',
    )
    assert preview.status_code == status.HTTP_200_OK
    assert preview.data['can_execute'] is True

    resp = api_client.post(
        '/api/v1/inventory/expiry-warnings/actions/execute/',
        {
            'lot_id': str(expiring_lot.id),
            'action_type': ExpiryActionType.PRIORITY_CONSUME,
        },
        format='json',
    )
    assert resp.status_code == status.HTTP_201_CREATED
    expiring_lot.refresh_from_db()
    assert expiring_lot.fefo_priority_boost == 100
    assert expiring_lot.fefo_priority_until is not None


@override_settings(EXPIRY_ACTION_AUTOMATION_ENABLED=True)
def test_priority_consume_raises_prep_priority(
    api_client, expiring_lot, branch, stock_item, kitchen_warehouse,
):
    cat = Category.objects.create(name='Cat')
    product = Product.objects.create(category=cat, name='Ürün', base_price=Decimal('10'))
    recipe = Recipe.objects.create(name='R1', product=product, servings=1)
    RecipeIngredient.objects.create(
        recipe=recipe,
        stock_item=stock_item,
        quantity=Decimal('1'),
        unit=stock_item.unit,
        normalized_quantity=Decimal('1'),
    )
    task = PrepTask.objects.create(
        branch=branch,
        title='Prep 1',
        product=product,
        priority=1,
        status=PrepStatus.PENDING,
    )

    resp = api_client.post(
        '/api/v1/inventory/expiry-warnings/actions/execute/',
        {
            'lot_id': str(expiring_lot.id),
            'action_type': ExpiryActionType.PRIORITY_CONSUME,
        },
        format='json',
    )
    assert resp.status_code == status.HTTP_201_CREATED
    task.refresh_from_db()
    assert task.priority == 6


@override_settings(EXPIRY_ACTION_AUTOMATION_ENABLED=True)
def test_transfer_suggest_creates_draft(
    api_client, expiring_lot, main_warehouse, kitchen_warehouse,
):
    preview = api_client.post(
        '/api/v1/inventory/expiry-warnings/actions/preview/',
        {
            'lot_id': str(expiring_lot.id),
            'action_type': ExpiryActionType.TRANSFER_SUGGEST,
        },
        format='json',
    )
    assert preview.status_code == status.HTTP_200_OK
    assert preview.data['target_warehouse_id'] == str(kitchen_warehouse.id)

    resp = api_client.post(
        '/api/v1/inventory/expiry-warnings/actions/execute/',
        {
            'lot_id': str(expiring_lot.id),
            'action_type': ExpiryActionType.TRANSFER_SUGGEST,
        },
        format='json',
    )
    assert resp.status_code == status.HTTP_201_CREATED
    transfer = WarehouseTransfer.objects.get(source_expiry_action_id=resp.data['id'])
    assert transfer.status == TransferStatus.DRAFT
    assert transfer.target_warehouse_id == kitchen_warehouse.id


@override_settings(EXPIRY_ACTION_AUTOMATION_ENABLED=True, EXPIRY_TRANSFER_IDEMPOTENCY_HOURS=24)
def test_transfer_idempotency(api_client, expiring_lot, kitchen_warehouse):
    payload = {
        'lot_id': str(expiring_lot.id),
        'action_type': ExpiryActionType.TRANSFER_SUGGEST,
    }
    first = api_client.post('/api/v1/inventory/expiry-warnings/actions/execute/', payload, format='json')
    assert first.status_code == status.HTTP_201_CREATED
    second = api_client.post('/api/v1/inventory/expiry-warnings/actions/execute/', payload, format='json')
    assert second.status_code == status.HTTP_400_BAD_REQUEST


@override_settings(EXPIRY_ACTION_AUTOMATION_ENABLED=True)
def test_plan_note_append(api_client, expiring_lot, branch, expiry_manage_user):
    plan = ProductionPlan.objects.create(
        branch=branch,
        plan_date=timezone.localdate(),
        status=ProductionPlanStatus.DRAFT,
        notes='Mevcut not',
        created_by=expiry_manage_user,
    )
    resp = api_client.post(
        '/api/v1/inventory/expiry-warnings/actions/execute/',
        {
            'lot_id': str(expiring_lot.id),
            'action_type': ExpiryActionType.PLAN_NOTE,
            'notes': 'SKT uyarısı',
        },
        format='json',
    )
    assert resp.status_code == status.HTTP_201_CREATED
    plan.refresh_from_db()
    assert 'SKT uyarısı' in plan.notes
    assert 'Mevcut not' in plan.notes


@override_settings(EXPIRY_ACTION_AUTOMATION_ENABLED=True)
def test_plan_note_locked_rejected(api_client, expiring_lot, branch, expiry_manage_user):
    ProductionPlan.objects.create(
        branch=branch,
        plan_date=timezone.localdate(),
        status=ProductionPlanStatus.LOCKED,
        created_by=expiry_manage_user,
    )
    resp = api_client.post(
        '/api/v1/inventory/expiry-warnings/actions/execute/',
        {
            'lot_id': str(expiring_lot.id),
            'action_type': ExpiryActionType.PLAN_NOTE,
        },
        format='json',
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


def test_order_lots_fefo_respects_boost(db, main_warehouse, stock_item):
    lot1 = StockLot.objects.create(
        stock_item=stock_item,
        warehouse=main_warehouse,
        expiry_date=date.today() + timedelta(days=5),
        quantity=Decimal('5'),
        initial_quantity=Decimal('5'),
    )
    lot2 = StockLot.objects.create(
        stock_item=stock_item,
        warehouse=main_warehouse,
        expiry_date=date.today() + timedelta(days=1),
        quantity=Decimal('5'),
        initial_quantity=Decimal('5'),
        fefo_priority_boost=100,
        fefo_priority_until=timezone.now() + timedelta(hours=1),
    )
    ordered = list(order_lots_fefo(StockLot.objects.filter(stock_item=stock_item)))
    assert ordered[0].id == lot2.id


def test_risk_score_in_list(api_client, expiring_lot):
    resp = api_client.get('/api/v1/inventory/expiry-warnings/', {'days_ahead': 7})
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data['results'][0]['risk_score'] >= 50


def test_action_types_includes_automation_flag(api_client):
    resp = api_client.get('/api/v1/inventory/expiry-warnings/action-types/')
    assert resp.status_code == status.HTTP_200_OK
    assert 'automation_enabled' in resp.data
    assert 'types' in resp.data
