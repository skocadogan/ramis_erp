from decimal import Decimal

import pytest

from apps.branches.models import Branch, KitchenStation
from apps.menu.models import Category, Product
from apps.orders.models import Order, OrderItem, OrderStatus
from apps.reporting.services.receipt_renderer import (
    ReceiptRenderer,
    enrich_print_context_from_branch,
    enrich_print_context_from_order,
)


@pytest.fixture
def branch(db):
    return Branch.objects.create(name="Test Şubesi", code="ENR")


@pytest.fixture
def product(db):
    category = Category.objects.create(name="Ana Yemekler")
    return Product.objects.create(
        category=category,
        name="Adana Kebap",
        base_price=Decimal("100.00"),
    )


@pytest.mark.django_db
def test_enrich_print_context_filters_by_kitchen_station(branch, product):
    station_bar = KitchenStation.objects.create(
        branch=branch, name="Bar", code="bar", color="#111"
    )
    station_grill = KitchenStation.objects.create(
        branch=branch, name="Izgara", code="izgara", color="#222"
    )

    order = Order.objects.create(
        branch=branch,
        status=OrderStatus.PENDING,
        total_amount=Decimal("300.00"),
    )
    OrderItem.objects.create(
        order=order,
        product=product,
        quantity=1,
        unit_price=Decimal("100.00"),
        total_price=Decimal("100.00"),
        status=OrderStatus.PENDING,
        station=station_bar,
    )
    OrderItem.objects.create(
        order=order,
        product=product,
        quantity=1,
        unit_price=Decimal("100.00"),
        total_price=Decimal("100.00"),
        status=OrderStatus.PENDING,
        station=station_grill,
    )
    OrderItem.objects.create(
        order=order,
        product=product,
        quantity=1,
        unit_price=Decimal("100.00"),
        total_price=Decimal("100.00"),
        status=OrderStatus.PENDING,
        station=None,
    )

    ctx = enrich_print_context_from_order(
        {
            "order_id": str(order.id),
            "kitchen_station_id": str(station_bar.id),
        }
    )

    assert len(ctx["items"]) == 2
    assert ctx["subtotal"] == Decimal("200.00")
    assert ctx["total"] == Decimal("200.00")
    assert ctx["station_name"] == "Bar"


@pytest.mark.django_db
def test_enrich_print_context_preserves_client_station_name(branch, product):
    station_bar = KitchenStation.objects.create(
        branch=branch, name="Bar", code="bar3", color="#111"
    )
    order = Order.objects.create(
        branch=branch,
        status=OrderStatus.PENDING,
        total_amount=Decimal("100.00"),
    )
    OrderItem.objects.create(
        order=order,
        product=product,
        quantity=1,
        unit_price=Decimal("100.00"),
        total_price=Decimal("100.00"),
        status=OrderStatus.PENDING,
        station=station_bar,
    )

    ctx = enrich_print_context_from_order(
        {
            "order_id": str(order.id),
            "kitchen_station_id": str(station_bar.id),
            "station_name": "Özel İstasyon Etiketi",
        }
    )

    assert ctx["station_name"] == "Özel İstasyon Etiketi"


@pytest.mark.django_db
def test_enrich_print_context_without_station_returns_all_items(branch, product):
    station_bar = KitchenStation.objects.create(
        branch=branch, name="Bar", code="bar2", color="#111"
    )

    order = Order.objects.create(
        branch=branch,
        status=OrderStatus.PENDING,
        total_amount=Decimal("200.00"),
    )
    OrderItem.objects.create(
        order=order,
        product=product,
        quantity=1,
        unit_price=Decimal("100.00"),
        total_price=Decimal("100.00"),
        status=OrderStatus.PENDING,
        station=station_bar,
    )
    OrderItem.objects.create(
        order=order,
        product=product,
        quantity=1,
        unit_price=Decimal("100.00"),
        total_price=Decimal("100.00"),
        status=OrderStatus.PENDING,
        station=None,
    )

    ctx = enrich_print_context_from_order({"order_id": str(order.id)})

    assert len(ctx["items"]) == 2
    assert ctx["subtotal"] == Decimal("200.00")


@pytest.mark.django_db
def test_enrich_print_context_sets_customer_name_from_order(branch, product):
    from apps.customers.models import Customer

    customer = Customer.objects.create(name="Ayşe Yılmaz")
    order = Order.objects.create(
        branch=branch,
        status=OrderStatus.PENDING,
        total_amount=Decimal("100.00"),
        customer=customer,
    )
    OrderItem.objects.create(
        order=order,
        product=product,
        quantity=1,
        unit_price=Decimal("100.00"),
        total_price=Decimal("100.00"),
        status=OrderStatus.PENDING,
    )

    ctx = enrich_print_context_from_order({"order_id": str(order.id)})

    assert ctx["customer_name"] == "Ayşe Yılmaz"


@pytest.mark.django_db
def test_enrich_print_context_preserves_client_customer_name(branch, product):
    order = Order.objects.create(
        branch=branch,
        status=OrderStatus.PENDING,
        total_amount=Decimal("100.00"),
    )
    OrderItem.objects.create(
        order=order,
        product=product,
        quantity=1,
        unit_price=Decimal("100.00"),
        total_price=Decimal("100.00"),
        status=OrderStatus.PENDING,
    )

    ctx = enrich_print_context_from_order(
        {"order_id": str(order.id), "customer_name": "Özel Müşteri"}
    )

    assert ctx["customer_name"] == "Özel Müşteri"


@pytest.mark.django_db
def test_enrich_print_context_sets_sale_id_from_order(branch, product):
    order = Order.objects.create(
        branch=branch,
        status=OrderStatus.COMPLETED,
        total_amount=Decimal("100.00"),
    )
    OrderItem.objects.create(
        order=order,
        product=product,
        quantity=1,
        unit_price=Decimal("100.00"),
        total_price=Decimal("100.00"),
        status=OrderStatus.COMPLETED,
    )
    from apps.sales.models import Sale, PaymentMethod

    sale = Sale.objects.create(
        order=order,
        branch=branch,
        payment_method=PaymentMethod.CASH,
        total_amount=Decimal("100.00"),
    )

    ctx = enrich_print_context_from_order({"order_id": str(order.id)})

    assert ctx["sale_id"] == str(sale.id)


@pytest.mark.django_db
def test_enrich_print_context_preserves_client_sale_id(branch, product):
    order = Order.objects.create(
        branch=branch,
        status=OrderStatus.PENDING,
        total_amount=Decimal("100.00"),
    )
    OrderItem.objects.create(
        order=order,
        product=product,
        quantity=1,
        unit_price=Decimal("100.00"),
        total_price=Decimal("100.00"),
        status=OrderStatus.PENDING,
    )

    ctx = enrich_print_context_from_order(
        {"order_id": str(order.id), "sale_id": "custom-sale-id"}
    )

    assert ctx["sale_id"] == "custom-sale-id"


@pytest.mark.django_db
def test_enrich_print_context_sets_branch_id_from_order(branch, product):
    order = Order.objects.create(
        branch=branch,
        status=OrderStatus.PENDING,
        total_amount=Decimal("100.00"),
    )
    OrderItem.objects.create(
        order=order,
        product=product,
        quantity=1,
        unit_price=Decimal("100.00"),
        total_price=Decimal("100.00"),
        status=OrderStatus.PENDING,
    )

    ctx = enrich_print_context_from_order({"order_id": str(order.id)})

    assert ctx["branch_id"] == str(branch.id)


@pytest.mark.django_db
def test_enrich_print_context_from_branch_uses_printer_fallback(branch):
    branch.address = "Atatürk Cad. No:12"
    branch.phone = "0212 555 1234"
    branch.tax_office = "Kadıköy"
    branch.save(update_fields=["address", "phone", "tax_office"])

    ctx = enrich_print_context_from_branch(
        {"branch_name": "Eski Ad"},
        fallback_branch_id=str(branch.id),
    )

    assert ctx["branch_id"] == str(branch.id)
    assert ctx["branch_name"] == "Eski Ad"
    assert ctx["branch_address"] == "Atatürk Cad. No:12"
    assert ctx["branch_phone"] == "0212 555 1234"
    assert ctx["branch_tax_office"] == "Kadıköy"


@pytest.mark.django_db
def test_branch_info_escpos_uses_context_branch_id(branch):
    from escpos.printer import Dummy

    branch.address = "İstanbul"
    branch.phone = "0212 555 1234"
    branch.save(update_fields=["address", "phone"])

    renderer = ReceiptRenderer(32)
    device = Dummy()
    layout = [{"type": "branch_info", "fields": ["name", "address", "phone"]}]
    renderer.render_to_escpos(
        layout,
        {"branch_id": str(branch.id)},
        device,
    )
    output = device.output.decode("utf-8", errors="replace")
    device.close()

    assert "Test Subesi" in output
    assert "Sube:" not in output
    assert "Tel:" not in output
    assert "Istanbul" in output
    assert "0212 555 1234" in output


@pytest.mark.django_db
def test_branch_info_address_wraps_on_long_line(branch):
    branch.address = (
        "I. Murat Mah. Zubeyde Hanim Cad. Arda Apt No 12 Daire 5 Merkez Edirne"
    )
    branch.save(update_fields=["address"])

    renderer = ReceiptRenderer(32)
    lines = renderer._branch_info_lines(
        {"type": "branch_info", "fields": ["address"], "align": "left", "size": "normal"},
        {"branch_id": str(branch.id)},
    )

    assert len(lines) >= 2
    assert all("Adres:" not in line for line in lines)
    joined = " ".join(line.strip() for line in lines)
    assert "Murat" in joined and "Edirne" in joined
