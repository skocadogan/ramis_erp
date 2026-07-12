"""Garson mobil count endpoint'leri — tam liste yerine hafif sayaç."""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from apps.branches.models import Branch, Zone, Table, TableStatus, WaiterBranchAssignment
from apps.menu.models import Category, Product
from apps.orders.models import Order, OrderItem, OrderStatus, OrderType
from apps.branches.waiter_scope import ready_order_items_qs_for_waiter
from rbac.models import Role, RolePermission, PermissionCategory

User = get_user_model()


@pytest.fixture
def waiter_api_setup(db):
    branch = Branch.objects.create(name="Count Branch", code="CNT")
    dining_zone = Zone.objects.create(branch=branch, name="Salon", is_takeaway=False)
    table = Table.objects.create(zone=dining_zone, name="T1", table_number=1, status=TableStatus.OCCUPIED)
    category = Category.objects.create(name="Yemek")
    product = Product.objects.create(category=category, name="Çorba", base_price=Decimal("50.00"))

    cat, _ = PermissionCategory.objects.get_or_create(code="waiter", defaults={"name": "Garson"})
    role = Role.objects.create(name="Garson Test")
    for code, name in [
        ("waiter.access", "Garson Erişim"),
        ("branches.view_table", "Masa Gör"),
    ]:
        perm, _ = RolePermission.objects.get_or_create(code=code, defaults={"name": name, "category": cat})
        role.permissions.add(perm)

    waiter = User.objects.create_user(
        username="waiter_count",
        password="pw",
        email="wc@test.com",
        branch=branch,
    )
    waiter.roles.add(role)

    assignment = WaiterBranchAssignment.objects.create(user=waiter, branch=branch)
    assignment.zones.add(dining_zone)
    assignment.tables.add(table)

    order = Order.objects.create(
        branch=branch,
        table=table,
        order_type=OrderType.TABLE,
        status=OrderStatus.READY,
        total_amount=Decimal("50.00"),
    )
    OrderItem.objects.create(
        order=order,
        product=product,
        quantity=1,
        unit_price=Decimal("50.00"),
        total_price=Decimal("50.00"),
        status=OrderStatus.READY,
    )

    client = APIClient()
    client.force_authenticate(user=waiter)
    return {
        "client": client,
        "branch": branch,
        "waiter": waiter,
        "expected_ready": ready_order_items_qs_for_waiter(waiter, branch.id).count(),
    }


@pytest.mark.django_db
def test_ready_for_waiter_count_endpoint(waiter_api_setup):
    setup = waiter_api_setup
    url = reverse("orderitem-ready-for-waiter-count")
    res = setup["client"].get(url, {"branch_id": str(setup["branch"].id)})
    assert res.status_code == 200
    assert res.data["count"] == setup["expected_ready"]


@pytest.mark.django_db
def test_tables_waiter_count_endpoint(waiter_api_setup):
    setup = waiter_api_setup
    url = reverse("table-waiter-count")
    res = setup["client"].get(
        url,
        {"branch_id": str(setup["branch"].id), "scope": "waiter"},
    )
    assert res.status_code == 200
    assert res.data["count"] >= 1
