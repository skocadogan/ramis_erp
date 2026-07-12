import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rbac.models import Role, RolePermission, PermissionCategory

from apps.branches.models import Branch, Zone, Table, TableStatus
from apps.menu.models import Category, Product
from apps.inventory.models import StockItem
from apps.orders.models import Order, OrderStatus

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


# ------------------------------------------------------------------ #
# Şube, Zone, Masa                                                     #
# ------------------------------------------------------------------ #

@pytest.fixture
def branch(db):
    return Branch.objects.create(name='Test Şubesi', code='TST')


@pytest.fixture
def other_branch(db):
    return Branch.objects.create(name='Diğer Şube', code='OTH')


@pytest.fixture
def zone(db, branch):
    return Zone.objects.create(branch=branch, name='Salon')


@pytest.fixture
def takeaway_zone(db, branch):
    return Zone.objects.create(branch=branch, name='Paket', is_takeaway=True)


@pytest.fixture
def table(db, zone):
    return Table.objects.create(zone=zone, name='M1', table_number=1, status=TableStatus.FREE)


# ------------------------------------------------------------------ #
# Menü                                                                 #
# ------------------------------------------------------------------ #

@pytest.fixture
def category(db):
    return Category.objects.create(name='Ana Yemekler')


@pytest.fixture
def product(db, category):
    return Product.objects.create(
        category=category,
        name='Adana Kebap',
        base_price=Decimal('180.00'),
    )


# ------------------------------------------------------------------ #
# RBAC Kullanıcıları                                                   #
# ------------------------------------------------------------------ #

def _make_perm(code, name, cat):
    return RolePermission.objects.get_or_create(code=code, defaults={'name': name, 'category': cat})[0]


@pytest.fixture
def rbac_cat(db):
    return PermissionCategory.objects.get_or_create(code='orders', defaults={'name': 'Siparişler'})[0]


@pytest.fixture
def pos_user(db, branch, rbac_cat):
    """POS kullanıcısı: sipariş oluşturabilir, tamamlayabilir."""
    role = Role.objects.create(name='POS Kasiyer')
    for code, name in [
        ('orders.manage_order', 'Sipariş Yönet'),
        ('pos.view_pos', 'POS Görüntüle'),
        ('pos.apply_discount', 'İndirim Uygula'),
    ]:
        perm = _make_perm(code, name, rbac_cat)
        role.permissions.add(perm)

    user = User.objects.create_user(
        username='kasiyertest', password='pw', email='kasiyer@test.com', branch=branch
    )
    user.roles.add(role)
    return user


@pytest.fixture
def kds_user(db, branch, rbac_cat):
    """KDS kullanıcısı: sadece KDS görüntüleyebilir."""
    role = Role.objects.create(name='KDS Görevli')
    perm = _make_perm('orders.view_kds', 'KDS Görüntüle', rbac_cat)
    role.permissions.add(perm)

    user = User.objects.create_user(
        username='kdstest', password='pw', email='kds@test.com', branch=branch
    )
    user.roles.add(role)
    return user


@pytest.fixture
def waiter_user_no_pos_view(db, branch, rbac_cat):
    """Garson benzeri: sipariş yönetimi + waiter.access; pos.view_pos yok (eski roller)."""
    role = Role.objects.create(name='Garson Eski Yetki')
    for code, name in [
        ('orders.manage_order', 'Sipariş Yönet'),
        ('waiter.access', 'Garson'),
    ]:
        perm = _make_perm(code, name, rbac_cat)
        role.permissions.add(perm)

    user = User.objects.create_user(
        username='waiternopos', password='pw', email='waiternopos@test.com', branch=branch
    )
    user.roles.add(role)
    return user


@pytest.fixture
def smart_table_user(db, branch, rbac_cat):
    """Smart Table (Akıllı Masa) kullanıcısı."""
    branches_cat = PermissionCategory.objects.get_or_create(code='branches', defaults={'name': 'Şubeler'})[0]
    role = Role.objects.create(name='Akıllı Masa')
    for code, name, cat in [
        ('orders.manage_order', 'Sipariş Yönet', rbac_cat),
        ('orders.view_order', 'Sipariş Görüntüle', rbac_cat),
        ('pos.view_pos', 'POS Görüntüle', rbac_cat),
        ('branches.view_table', 'Masa Görüntüle', branches_cat),
    ]:
        perm = _make_perm(code, name, cat)
        role.permissions.add(perm)

    user = User.objects.create_user(
        username='smarttabletest', password='pw', email='smarttable@test.com', branch=branch
    )
    user.roles.add(role)
    return user


@pytest.fixture
def other_branch_user(db, other_branch, rbac_cat):
    """Farklı şubede KDS kullanıcısı — branch scope testi için."""
    role = Role.objects.create(name='KDS Diğer Şube')
    perm = _make_perm('orders.view_kds', 'KDS Görüntüle', rbac_cat)
    role.permissions.add(perm)

    user = User.objects.create_user(
        username='kdsother', password='pw', email='kdsother@test.com', branch=other_branch
    )
    user.roles.add(role)
    return user


# ------------------------------------------------------------------ #
# Hazır Sipariş Fixture'ı                                             #
# ------------------------------------------------------------------ #

@pytest.fixture
def pending_order(db, branch, table, product):
    order = Order.objects.create(
        branch=branch,
        table=table,
        status=OrderStatus.PENDING,
        total_amount=Decimal('180.00'),
    )
    from apps.orders.models import OrderItem
    OrderItem.objects.create(
        order=order,
        product=product,
        quantity=1,
        unit_price=Decimal('180.00'),
        total_price=Decimal('180.00'),
        status=OrderStatus.PENDING,
    )
    return order
