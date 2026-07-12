"""
Warehouse API testleri — TEST-2.

Kapsam:
  - Warehouse CRUD: yetkisiz erişim engeli, listeleme, oluşturma
  - Branch scope: kullanıcı yalnızca erişebildiği depoları görür
  - PurchaseOrder: oluşturma, onaylama
  - Temel HTTP durum kodu doğrulaması
"""
import pytest
from decimal import Decimal
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model

from rbac.models import Role, RolePermission, PermissionCategory
from apps.branches.models import Branch
from apps.warehouse.models import Warehouse, WarehouseType, WarehouseStockLevel
from apps.inventory.models import StockItem, StockCategory
from apps.inventory.services import StockItemService

User = get_user_model()


# ------------------------------------------------------------------ #
# Fixture'lar                                                          #
# ------------------------------------------------------------------ #

def _make_perm(code, name, cat):
    return RolePermission.objects.get_or_create(code=code, defaults={'name': name, 'category': cat})[0]


@pytest.fixture
def branch(db):
    return Branch.objects.create(name='Depo Test Şubesi', code='DTS')


@pytest.fixture
def other_branch(db):
    return Branch.objects.create(name='Diğer Şube', code='DTS2')


@pytest.fixture
def warehouse(db, branch):
    wh = Warehouse.objects.create(
        name='Ana Depo', code='WH-001', warehouse_type=WarehouseType.MAIN,
    )
    wh.branches.add(branch)
    return wh


@pytest.fixture
def other_warehouse(db, other_branch):
    wh = Warehouse.objects.create(
        name='Diğer Depo', code='WH-002', warehouse_type=WarehouseType.SUB,
    )
    wh.branches.add(other_branch)
    return wh


@pytest.fixture
def wh_cat(db):
    return PermissionCategory.objects.get_or_create(code='warehouse', defaults={'name': 'Depo'})[0]


@pytest.fixture
def warehouse_manager(db, branch, wh_cat):
    role = Role.objects.create(name='Depo Sorumlusu')
    for code, name in [
        ('warehouse.view_warehouse', 'Depo Görüntüle'),
        ('warehouse.manage_warehouse', 'Depo Yönet'),
    ]:
        role.permissions.add(_make_perm(code, name, wh_cat))
    user = User.objects.create_user(
        username='whmgr', password='pw', email='whmgr@test.com', branch=branch,
    )
    user.roles.add(role)
    return user


@pytest.fixture
def warehouse_viewer(db, branch, wh_cat):
    role = Role.objects.create(name='Depo İzleyici')
    role.permissions.add(_make_perm('warehouse.view_warehouse', 'Depo Görüntüle', wh_cat))
    user = User.objects.create_user(
        username='whviewer', password='pw', email='whviewer@test.com', branch=branch,
    )
    user.roles.add(role)
    return user


@pytest.fixture
def api_client():
    return APIClient()


# ------------------------------------------------------------------ #
# Warehouse CRUD                                                       #
# ------------------------------------------------------------------ #

@pytest.mark.django_db
class TestWarehouseListView:
    def test_yetkisiz_erisim_engellenir(self, api_client):
        url = reverse('warehouse-list')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_izleyici_depolari_gorur(self, api_client, warehouse, warehouse_viewer):
        api_client.force_authenticate(user=warehouse_viewer)
        url = reverse('warehouse-list')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_kullanici_yalnizca_kendi_subesinin_depolarini_gorur(
        self, api_client, warehouse, other_warehouse, warehouse_viewer
    ):
        api_client.force_authenticate(user=warehouse_viewer)
        url = reverse('warehouse-list')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK

        ids = [str(item['id']) for item in response.data.get('results', response.data)]
        assert str(warehouse.id) in ids
        assert str(other_warehouse.id) not in ids


@pytest.mark.django_db
class TestWarehouseCreateView:
    def test_izleyici_depo_olusturamaz(self, api_client, branch, warehouse_viewer):
        api_client.force_authenticate(user=warehouse_viewer)
        url = reverse('warehouse-list')
        payload = {'name': 'Yeni Depo', 'code': 'WH-NEW', 'warehouse_type': 'MAIN'}
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_yonetici_depo_olusturabilir(self, api_client, branch, warehouse_manager):
        api_client.force_authenticate(user=warehouse_manager)
        url = reverse('warehouse-list')
        payload = {
            'name': 'Yeni Depo', 'code': 'WH-NEW2',
            'warehouse_type': 'MAIN', 'branches': [str(branch.id)],
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Yeni Depo'

    def test_ayni_kod_ile_iki_depo_olusturulamaz(self, api_client, warehouse, warehouse_manager):
        api_client.force_authenticate(user=warehouse_manager)
        url = reverse('warehouse-list')
        payload = {
            'name': 'Kopya Depo', 'code': 'WH-001',  # mevcut kod
            'warehouse_type': 'SUB',
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestWarehouseSummaryView:
    def test_yetkisiz_erisim_engellenir(self, api_client):
        url = reverse('warehouse-summary')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_ozet_yalnizca_erisilebilir_depolari_sayar(
        self, api_client, warehouse, other_warehouse, warehouse_viewer
    ):
        api_client.force_authenticate(user=warehouse_viewer)
        url = reverse('warehouse-summary')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['total_warehouses'] == 1


@pytest.mark.django_db
class TestWarehouseStockLevelsView:
    def test_soft_deleted_stock_items_are_excluded(
        self, api_client, warehouse, warehouse_viewer, stock_item,
    ):
        active_item = StockItem.objects.create(
            name='Aktif Malzeme', sku='AKT-001', unit='kg',
            last_purchase_price=Decimal('10.00'),
        )
        deleted_item = StockItem.objects.create(
            name='Silinen Malzeme', sku='SIL-001', unit='kg',
            last_purchase_price=Decimal('20.00'),
        )
        WarehouseStockLevel.objects.create(
            warehouse=warehouse, stock_item=active_item, quantity=Decimal('5.000'),
        )
        WarehouseStockLevel.objects.create(
            warehouse=warehouse, stock_item=deleted_item, quantity=Decimal('3.000'),
        )
        StockItemService.delete_stock_item(deleted_item.id)

        api_client.force_authenticate(user=warehouse_viewer)
        url = reverse('warehouse-stock-levels', kwargs={'pk': warehouse.id})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK

        stock_item_ids = [
            str(row['stock_item'])
            for row in response.data.get('results', response.data)
        ]
        assert str(active_item.id) in stock_item_ids
        assert str(deleted_item.id) not in stock_item_ids


@pytest.mark.django_db
class TestWarehouseDetailView:
    def test_depo_detayini_getirir(self, api_client, warehouse, warehouse_viewer):
        api_client.force_authenticate(user=warehouse_viewer)
        url = reverse('warehouse-detail', kwargs={'pk': warehouse.id})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['code'] == 'WH-001'

    def test_baska_subenin_deposuna_erisim_engellenir(
        self, api_client, other_warehouse, warehouse_viewer
    ):
        api_client.force_authenticate(user=warehouse_viewer)
        url = reverse('warehouse-detail', kwargs={'pk': other_warehouse.id})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ------------------------------------------------------------------ #
# PurchaseOrder                                                        #
# ------------------------------------------------------------------ #

@pytest.fixture
def po_cat(db):
    return PermissionCategory.objects.get_or_create(
        code='warehouse_po', defaults={'name': 'Satın Alma'}
    )[0]


@pytest.fixture
def purchasing_user(db, branch, po_cat):
    role = Role.objects.create(name='Satın Alma Uzmanı')
    for code, name in [
        ('warehouse.view_purchase_order', 'PO Görüntüle'),
        ('warehouse.manage_purchase_order', 'PO Yönet'),
    ]:
        role.permissions.add(_make_perm(code, name, po_cat))
    user = User.objects.create_user(
        username='purchasing', password='pw', email='purchasing@test.com', branch=branch,
    )
    user.roles.add(role)
    return user


@pytest.fixture
def stock_category(db):
    return StockCategory.objects.create(name='Test Kategori', code='TC')


@pytest.fixture
def stock_item(db, stock_category):
    return StockItem.objects.create(
        name='Test Malzeme', sku='TM-001', unit='kg',
        last_purchase_price=Decimal('50.00'),
    )


@pytest.mark.django_db
class TestPurchaseOrderView:
    def test_yetkisiz_erisim_engellenir(self, api_client):
        url = reverse('purchaseorder-list')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_po_list_filters_by_stock_item_id(
        self, api_client, warehouse, purchasing_user, stock_item, supplier,
    ):
        from django.utils import timezone
        from apps.warehouse.models import PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus

        other_item = StockItem.objects.create(
            name='Şeker',
            sku='SEK-001',
            unit='kg',
            minimum_quantity=Decimal('0'),
        )
        api_client.force_authenticate(user=purchasing_user)

        matching_po = PurchaseOrder.objects.create(
            order_number='PO-MATCH',
            supplier=supplier,
            warehouse=warehouse,
            status=PurchaseOrderStatus.ORDERED,
            order_date=timezone.now().date(),
            created_by=purchasing_user,
        )
        PurchaseOrderItem.objects.create(
            purchase_order=matching_po,
            stock_item=stock_item,
            quantity=Decimal('1.000'),
            unit='kg',
            unit_price=Decimal('10.00'),
        )

        other_po = PurchaseOrder.objects.create(
            order_number='PO-OTHER',
            supplier=supplier,
            warehouse=warehouse,
            status=PurchaseOrderStatus.ORDERED,
            order_date=timezone.now().date(),
            created_by=purchasing_user,
        )
        PurchaseOrderItem.objects.create(
            purchase_order=other_po,
            stock_item=other_item,
            quantity=Decimal('1.000'),
            unit='kg',
            unit_price=Decimal('5.00'),
        )

        url = reverse('purchaseorder-list')
        response = api_client.get(url, {
            'warehouse_id': str(warehouse.id),
            'stock_item_id': str(stock_item.id),
        })
        assert response.status_code == status.HTTP_200_OK
        numbers = [row['order_number'] for row in response.data['results']]
        assert 'PO-MATCH' in numbers
        assert 'PO-OTHER' not in numbers

# ------------------------------------------------------------------ #
# Stock Counting                                                       #
# ------------------------------------------------------------------ #

@pytest.fixture
def counting_user(db, branch, wh_cat):
    role = Role.objects.create(name='Sayım Sorumlusu')
    for code, name in [
        ('warehouse.view_stock_counting', 'Sayım Görüntüle'),
        ('warehouse.manage_stock_counting', 'Sayım Yönet'),
    ]:
        role.permissions.add(_make_perm(code, name, wh_cat))
    user = User.objects.create_user(
        username='counter', password='pw', email='counter@test.com', branch=branch,
    )
    user.roles.add(role)
    return user


@pytest.mark.django_db
class TestStockCountingCreateView:
    def test_sayim_warehouse_id_ile_olusturulur(
        self, api_client, warehouse, counting_user, stock_item
    ):
        from apps.inventory.services import InventoryService

        InventoryService.receive_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            quantity=Decimal('10.000'),
            reference='Init',
            performed_by=counting_user,
            unit_price=Decimal('50.00'),
        )

        api_client.force_authenticate(user=counting_user)
        url = reverse('stockcounting-list')
        payload = {
            'warehouse_id': str(warehouse.id),
            'counting_date': '2026-05-21',
            'notes': 'Test sayım',
            'auto_populate': True,
            'items': [],
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert str(response.data['warehouse']) == str(warehouse.id)
        assert len(response.data['items']) == 1
        assert str(response.data['items'][0]['stock_item']) == str(stock_item.id)


@pytest.fixture
def supplier(db):
    from apps.inventory.models import Supplier
    return Supplier.objects.create(name='Test Tedarikçi')


@pytest.mark.django_db
class TestPurchaseOrderCreateView:
    def test_satin_alma_siparisi_warehouse_id_ile_olusturulur(
        self, api_client, warehouse, purchasing_user, stock_item, supplier,
    ):
        api_client.force_authenticate(user=purchasing_user)
        url = reverse('purchaseorder-list')
        payload = {
            'supplier_id': str(supplier.id),
            'warehouse_id': str(warehouse.id),
            'order_date': '2026-05-21',
            'notes': 'Test PO',
            'items': [{
                'stock_item_id': str(stock_item.id),
                'quantity': '5.000',
                'unit': 'kg',
                'unit_price': '50.00',
                'notes': '',
            }],
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert str(response.data['warehouse']) == str(warehouse.id)
        assert str(response.data['supplier']) == str(supplier.id)
        assert len(response.data['items']) == 1


@pytest.mark.django_db
class TestDeficiencyReportCreateView:
    def test_yetkisiz_erisim_engellenir(self, api_client):
        url = reverse('deficiencyreport-list')
        response = api_client.post(url, {}, format='json')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_eksik_liste_olusturulur(
        self, api_client, branch, warehouse, stock_item, wh_cat,
    ):
        from apps.branches.models import KitchenStation

        station = KitchenStation.objects.create(
            branch=branch, name='Ana Mutfak', code='main-kitchen', warehouse=warehouse,
        )
        role = Role.objects.create(name='Eksik Liste Yönetici')
        for code, name in [
            ('warehouse.view_deficiency_report', 'Eksik Görüntüle'),
            ('warehouse.manage_deficiency_report', 'Eksik Yönet'),
        ]:
            role.permissions.add(_make_perm(code, name, wh_cat))
        user = User.objects.create_user(
            username='defmgr', password='pw', email='defmgr@test.com', branch=branch,
        )
        user.roles.add(role)

        api_client.force_authenticate(user=user)
        url = reverse('deficiencyreport-list')
        payload = {
            'kitchen_station_id': str(station.id),
            'notes': 'Test eksik listesi',
            'items': [{
                'stock_item_id': str(stock_item.id),
                'quantity': '2.000',
                'unit': 'kg',
                'notes': '',
            }],
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert str(response.data['kitchen_station']) == str(station.id)
        assert str(response.data['target_warehouse']) == str(warehouse.id)
        assert response.data['status'] == 'PENDING'
        assert len(response.data['items']) == 1
