"""Recycle bin bağımlılık mesajı formatlayıcı testleri."""

from __future__ import annotations

import uuid

import pytest
from django.db.models.deletion import ProtectedError
from rest_framework.test import APIClient

from core.recycle_bin_errors import (
    describe_protected_objects,
    format_blocking_reference,
    format_partial_empty_bin_message,
    format_protected_delete_error,
)


class _FakeMeta:
    def __init__(self, *, verbose_name: str, model_name: str, app_label: str = "sales"):
        self.verbose_name = verbose_name
        self.model_name = model_name
        self.app_label = app_label
        self.label_lower = f"{app_label}.{model_name}"


class _FakeOrder:
    def __init__(self, order_number: str = "#45"):
        self.pk = uuid.uuid4()
        self.order_number = order_number


class _FakeSale:
    def __init__(self):
        self._meta = _FakeMeta(verbose_name="Satış", model_name="sale")
        self.pk = uuid.uuid4()
        self.order = _FakeOrder()


class _FakeOrderItem:
    def __init__(self):
        self._meta = _FakeMeta(verbose_name="Sipariş kalemi", model_name="orderitem", app_label="orders")
        self.pk = uuid.uuid4()
        self.order = _FakeOrder("#12")
        self.product_name = "Izgara Köfte"
        self.product = None
        self.product_id = uuid.uuid4()


class TestRecycleBinErrorFormatting:
    def test_format_blocking_reference_sale(self):
        ref = format_blocking_reference(_FakeSale())
        assert "Satış" in ref
        assert "#45" in ref

    def test_format_blocking_reference_order_item(self):
        ref = format_blocking_reference(_FakeOrderItem())
        assert "Sipariş kalemi" in ref
        assert "#12" in ref
        assert "Izgara Köfte" in ref

    def test_format_protected_delete_error_lists_dependencies(self):
        exc = ProtectedError("blocked", {_FakeSale(), _FakeOrderItem()})
        msg = format_protected_delete_error(exc)
        assert "Kayıt silinemiyor" in msg
        assert "Satış" in msg
        assert "Sipariş kalemi" in msg

    def test_describe_protected_objects_deduplicates(self):
        sale = _FakeSale()
        exc = ProtectedError("blocked", {sale, sale})
        refs = describe_protected_objects(exc.protected_objects)
        assert len(refs) == 1

    def test_format_partial_empty_bin_includes_samples(self):
        msg = format_partial_empty_bin_message(
            deleted_count=2,
            protected_count=1,
            sample_refs=["Satış kaydı (#45)"],
        )
        assert "2 kayıt temizlendi" in msg
        assert "Örnek bağımlılıklar" in msg
        assert "#45" in msg


@pytest.mark.django_db
class TestRecycleBinHardDeleteProtectedIntegration:
    def test_hard_delete_product_reports_order_item_dependency(self, api_client):
        from decimal import Decimal

        from django.contrib.auth import get_user_model

        from apps.branches.models import Branch, KitchenStation, Table, TableStatus, Zone
        from apps.menu.models import Category, Product
        from apps.orders.models import Order, OrderItem, OrderStatus

        User = get_user_model()
        admin = User.objects.create_superuser(username="rb_admin", password="pass", email="a@b.c")
        api_client.force_authenticate(user=admin)

        branch = Branch.objects.create(name="RB Şube", code="RB1")
        zone = Zone.objects.create(branch=branch, name="Salon")
        table = Table.objects.create(zone=zone, name="M1", table_number=1, status=TableStatus.FREE)
        station = KitchenStation.objects.create(branch=branch, name="Mutfak", code="K1")
        category = Category.objects.create(name="Ana Yemekler", station=station)
        product = Product.objects.create(
            category=category,
            name="Izgara Köfte",
            base_price=Decimal("180.00"),
            is_active=False,
        )

        order = Order.objects.create(
            branch=branch,
            table=table,
            status=OrderStatus.COMPLETED,
            total_amount=Decimal("10.00"),
            order_number="#99",
        )
        OrderItem.objects.create(
            order=order,
            product=product,
            quantity=1,
            unit_price=Decimal("10.00"),
            total_price=Decimal("10.00"),
            status=OrderStatus.COMPLETED,
        )

        response = api_client.post(
            "/api/v1/recycle-bin/action/",
            {
                "app_label": "menu",
                "model_name": "product",
                "id": str(product.pk),
                "action": "hard_delete",
            },
            format="json",
        )

        assert response.status_code == 400
        error = response.data.get("error", "")
        assert "Kayıt silinemiyor" in error
        assert "sipariş" in error.lower()
        assert "#99" in error
        assert "Izgara Köfte" in error


@pytest.mark.django_db
class TestRecycleBinForceHardDeleteIntegration:
    def test_force_hard_delete_removes_product_and_order_item(self, api_client):
        from decimal import Decimal

        from django.contrib.auth import get_user_model

        from apps.branches.models import Branch, KitchenStation, Table, TableStatus, Zone
        from apps.menu.models import Category, Product
        from apps.orders.models import Order, OrderItem, OrderStatus

        User = get_user_model()
        admin = User.objects.create_superuser(username="rb_force", password="pass", email="f@b.c")
        api_client.force_authenticate(user=admin)

        branch = Branch.objects.create(name="RB Şube", code="RB2")
        zone = Zone.objects.create(branch=branch, name="Salon")
        table = Table.objects.create(zone=zone, name="M1", table_number=1, status=TableStatus.FREE)
        station = KitchenStation.objects.create(branch=branch, name="Mutfak", code="K2")
        category = Category.objects.create(name="Ana Yemekler", station=station)
        product = Product.objects.create(
            category=category,
            name="Izgara Köfte",
            base_price=Decimal("180.00"),
            is_active=False,
        )

        order = Order.objects.create(
            branch=branch,
            table=table,
            status=OrderStatus.COMPLETED,
            total_amount=Decimal("10.00"),
            order_number="#77",
        )
        item = OrderItem.objects.create(
            order=order,
            product=product,
            quantity=1,
            unit_price=Decimal("10.00"),
            total_price=Decimal("10.00"),
            status=OrderStatus.COMPLETED,
        )

        preview = api_client.post(
            "/api/v1/recycle-bin/action/",
            {
                "app_label": "menu",
                "model_name": "product",
                "id": str(product.pk),
                "action": "preview_force_delete",
            },
            format="json",
        )
        assert preview.status_code == 200
        assert len(preview.data.get("dependencies", [])) >= 2

        response = api_client.post(
            "/api/v1/recycle-bin/action/",
            {
                "app_label": "menu",
                "model_name": "product",
                "id": str(product.pk),
                "action": "force_hard_delete",
            },
            format="json",
        )
        assert response.status_code == 200
        assert not Product.objects.filter(pk=product.pk).exists()
        assert not OrderItem.objects.filter(pk=item.pk).exists()

    def test_hard_delete_returns_dependencies_payload(self, api_client):
        from decimal import Decimal

        from django.contrib.auth import get_user_model

        from apps.branches.models import Branch, KitchenStation, Table, TableStatus, Zone
        from apps.menu.models import Category, Product
        from apps.orders.models import Order, OrderItem, OrderStatus

        User = get_user_model()
        admin = User.objects.create_superuser(username="rb_deps", password="pass", email="d@b.c")
        api_client.force_authenticate(user=admin)

        branch = Branch.objects.create(name="RB Şube", code="RB3")
        zone = Zone.objects.create(branch=branch, name="Salon")
        table = Table.objects.create(zone=zone, name="M1", table_number=1, status=TableStatus.FREE)
        station = KitchenStation.objects.create(branch=branch, name="Mutfak", code="K3")
        category = Category.objects.create(name="Ana Yemekler", station=station)
        product = Product.objects.create(
            category=category,
            name="Test Ürün",
            base_price=Decimal("50.00"),
            is_active=False,
        )
        order = Order.objects.create(
            branch=branch,
            table=table,
            status=OrderStatus.COMPLETED,
            total_amount=Decimal("10.00"),
        )
        OrderItem.objects.create(
            order=order,
            product=product,
            quantity=1,
            unit_price=Decimal("10.00"),
            total_price=Decimal("10.00"),
            status=OrderStatus.COMPLETED,
        )

        response = api_client.post(
            "/api/v1/recycle-bin/action/",
            {
                "app_label": "menu",
                "model_name": "product",
                "id": str(product.pk),
                "action": "hard_delete",
            },
            format="json",
        )
        assert response.status_code == 400
        assert response.data.get("can_force_delete") is True
        assert len(response.data.get("dependencies", [])) >= 1


@pytest.fixture
def api_client():
    return APIClient()
