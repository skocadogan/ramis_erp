import pytest
from datetime import date, timedelta
from decimal import Decimal
from django.utils import timezone
from django.contrib.auth import get_user_model

from apps.branches.models import Branch, Zone, Table, TableStatus
from apps.menu.models import Category, Product
from apps.orders.models import Order, OrderItem, OrderStatus
from apps.inventory.models import StockItem, StockUnit, StockLot
from apps.inventory.stock_minimum import MINIMUM_UNLIMITED_SENTINEL
from apps.warehouse.models import Warehouse, WarehouseStockLevel, WarehouseType
from apps.recipes.models import Recipe, RecipeIngredient

from apps.production_planning.models import (
    ProductionPlan,
    ProductionPlanLine,
    ProductionPlanStatus,
    ProductionPlanSource,
    ProductionDaySettings,
    ProductDayAvailability,
    AvailabilityMode,
    PosBlockMode
)
from apps.production_planning.services.mrp_service import calculate_mrp_for_plan
from apps.production_planning.services.approximate_cost_service import calculate_approximate_cost_for_plan
from apps.production_planning.services.forecast_service import generate_forecast
from apps.production_planning.services.availability_service import check_product_availability
from apps.production_planning.services.pos_integration import check_cart_with_production
from apps.production_planning.services.plan_copy import copy_production_plan_to_date
from rest_framework.exceptions import ValidationError as DRFValidationError

User = get_user_model()

@pytest.fixture
def test_user(db):
    return User.objects.create_user(username='testuser', password='pw')

@pytest.fixture
def branch(db):
    return Branch.objects.create(name='Test Branch', code='TST')

@pytest.fixture
def kitchen_warehouse(db, branch):
    wh = Warehouse.objects.create(
        name='Mutfak',
        code='WH-KITCHEN',
        warehouse_type=WarehouseType.KITCHEN,
        is_default=True,
    )
    wh.branches.add(branch)
    return wh

@pytest.fixture
def stock_unit_kg(db):
    return StockUnit.objects.create(name='Kilogram', short_name='kg', multiplier=Decimal('1.000'))

@pytest.fixture
def stock_item_meat(db, stock_unit_kg):
    return StockItem.objects.create(name='Et', sku='ET001', unit='kg', minimum_quantity=Decimal("1.000"))

@pytest.fixture
def product_category(db):
    return Category.objects.create(name='Ana Yemek')

@pytest.fixture
def product_meatball(db, product_category, stock_item_meat):
    product = Product.objects.create(category=product_category, name='Köfte', base_price=Decimal('100.00'))
    recipe = Recipe.objects.create(product=product, name='Köfte Reçetesi', servings=10)
    # 10 servings use 2.0 kg of meat. 1 serving = 0.2 kg
    RecipeIngredient.objects.create(recipe=recipe, stock_item=stock_item_meat, quantity=Decimal('2.000'), unit='kg')
    return product

@pytest.fixture
def settings_block(db, branch):
    return ProductionDaySettings.objects.create(branch=branch, pos_block_mode=PosBlockMode.BLOCK, default_safety_factor=Decimal("1.2"))

# --- MRP Tests ---

@pytest.mark.django_db
def test_calculate_mrp_for_plan_insufficient_stock(test_user, branch, product_meatball, stock_item_meat, kitchen_warehouse):
    # Plan
    plan = ProductionPlan.objects.create(branch=branch, plan_date=timezone.now().date(), status=ProductionPlanStatus.DRAFT, created_by=test_user)
    ProductionPlanLine.objects.create(plan=plan, product=product_meatball, target_quantity=20)
    
    # Stock level
    WarehouseStockLevel.objects.create(warehouse=kitchen_warehouse, stock_item=stock_item_meat, quantity=Decimal("1.000"), minimum_quantity=Decimal("1.000"))
    
    # Calculate
    mrp = calculate_mrp_for_plan(str(plan.id))
    
    assert mrp["warehouse_id"] == kitchen_warehouse.id
    assert len(mrp["items"]) == 1
    item = mrp["items"][0]
    
    # 20 portions * 0.2 kg = 4.0 kg required.
    assert item["required_quantity"] == Decimal("4.000000")
    assert item["on_hand"] == Decimal("1.000")
    assert item["gap"] == Decimal("3.000000")
    assert item["below_minimum"] == True

@pytest.mark.django_db
def test_calculate_mrp_for_plan_sufficient_stock(test_user, branch, product_meatball, stock_item_meat, kitchen_warehouse):
    plan = ProductionPlan.objects.create(branch=branch, plan_date=timezone.now().date(), status=ProductionPlanStatus.DRAFT, created_by=test_user)
    ProductionPlanLine.objects.create(plan=plan, product=product_meatball, target_quantity=5)
    
    WarehouseStockLevel.objects.create(warehouse=kitchen_warehouse, stock_item=stock_item_meat, quantity=Decimal("5.000"), minimum_quantity=Decimal("1.000"))
    
    mrp = calculate_mrp_for_plan(str(plan.id))
    item = mrp["items"][0]
    
    # 5 portions * 0.2 kg = 1.0 kg required.
    assert item["required_quantity"] == Decimal("1.000000")
    assert item["gap"] == Decimal("0")
    assert item["below_minimum"] == False


# --- Approximate Cost Tests ---

@pytest.mark.django_db
def test_calculate_approximate_cost_with_fefo_lots(
    test_user, branch, product_meatball, stock_item_meat, kitchen_warehouse
):
    """FEFO lot birim fiyatı ile porsiyon maliyeti hesaplanır."""
    StockLot.objects.create(
        stock_item=stock_item_meat,
        warehouse=kitchen_warehouse,
        quantity=Decimal("10.000"),
        initial_quantity=Decimal("10.000"),
        unit_price=Decimal("50.00"),
    )
    plan = ProductionPlan.objects.create(
        branch=branch,
        plan_date=timezone.now().date(),
        status=ProductionPlanStatus.DRAFT,
        created_by=test_user,
    )
    ProductionPlanLine.objects.create(plan=plan, product=product_meatball, target_quantity=Decimal("10"))

    result = calculate_approximate_cost_for_plan(str(plan.id))
    assert result["warehouse_id"] == str(kitchen_warehouse.id)
    assert result["count"] == 1
    item = result["items"][0]
    # Reçete: 2kg/10 porsiyon = 0.2kg/porsiyon; FEFO fiyat 50 TL/kg → 10 TL/porsiyon
    assert item["unit_cost"] == Decimal("10.00")
    assert item["line_total"] == Decimal("100.00")
    assert result["grand_total"] == Decimal("100.00")
    assert len(item["ingredients"]) == 1
    ing = item["ingredients"][0]
    assert ing["stock_item_name"] == stock_item_meat.name
    assert ing["quantity"] == Decimal("2.000000")
    assert ing["unit_cost"] == Decimal("50.00")
    assert ing["line_total"] == Decimal("100.00")


@pytest.mark.django_db
def test_calculate_approximate_cost_no_recipe_product(
    test_user, branch, product_category, kitchen_warehouse
):
    product = Product.objects.create(category=product_category, name='Reçetesiz', base_price=Decimal('50.00'))
    plan = ProductionPlan.objects.create(
        branch=branch,
        plan_date=timezone.now().date(),
        status=ProductionPlanStatus.DRAFT,
        created_by=test_user,
    )
    ProductionPlanLine.objects.create(plan=plan, product=product, target_quantity=Decimal("5"))

    result = calculate_approximate_cost_for_plan(str(plan.id))
    assert result["count"] == 1
    item = result["items"][0]
    assert item["has_recipe"] is False
    assert item["unit_cost"] == Decimal("0.00")
    assert item["line_total"] == Decimal("0.00")
    assert item["ingredients"] == []
    assert result["grand_total"] == Decimal("0.00")


@pytest.mark.django_db
def test_calculate_approximate_cost_pagination(
    test_user, branch, product_category, kitchen_warehouse
):
    plan = ProductionPlan.objects.create(
        branch=branch,
        plan_date=timezone.now().date(),
        status=ProductionPlanStatus.DRAFT,
        created_by=test_user,
    )
    for i in range(3):
        product = Product.objects.create(category=product_category, name=f'Ürün {i}', base_price=Decimal('10'))
        ProductionPlanLine.objects.create(plan=plan, product=product, target_quantity=Decimal("1"))

    page1 = calculate_approximate_cost_for_plan(str(plan.id), page=1, page_size=2)
    assert page1["count"] == 3
    assert len(page1["items"]) == 2
    assert page1["has_next"] is True
    assert page1["next_page"] == 2

    page2 = calculate_approximate_cost_for_plan(str(plan.id), page=2, page_size=2)
    assert len(page2["items"]) == 1
    assert page2["has_next"] is False


@pytest.mark.django_db
def test_calculate_mrp_unlimited_stock_skips_below_minimum(test_user, branch, product_meatball, stock_item_meat, kitchen_warehouse):
    """minimum_quantity -1 (sınırsız): gap olsa bile below_minimum ve durum mantığı izlenen stok gibi işlenmez."""
    stock_item_meat.minimum_quantity = MINIMUM_UNLIMITED_SENTINEL
    stock_item_meat.save(update_fields=["minimum_quantity"])

    plan = ProductionPlan.objects.create(branch=branch, plan_date=timezone.now().date(), status=ProductionPlanStatus.DRAFT, created_by=test_user)
    ProductionPlanLine.objects.create(plan=plan, product=product_meatball, target_quantity=20)

    # Depo kaydı yok: on_hand 0, gereken 4 kg — sınırsız kalemde eksik/uyarı bayrağı yok
    mrp = calculate_mrp_for_plan(str(plan.id))
    assert len(mrp["items"]) == 1
    item = mrp["items"][0]
    assert item["required_quantity"] == Decimal("4.000000")
    assert item["on_hand"] == Decimal("0")
    assert item["gap"] == Decimal("4.000000")
    assert item["below_minimum"] is False
    assert item["is_minimum_unlimited"] is True
    assert item["minimum_quantity"] == MINIMUM_UNLIMITED_SENTINEL


@pytest.mark.django_db
def test_calculate_mrp_level_unlimited_overrides_numeric_item_min(test_user, branch, product_meatball, stock_item_meat, kitchen_warehouse):
    """Depo seviyesinde -1 ise kalem minimumu izlenmiş olsa bile sınırsız sayılır."""
    WarehouseStockLevel.objects.create(
        warehouse=kitchen_warehouse,
        stock_item=stock_item_meat,
        quantity=Decimal("1.000"),
        minimum_quantity=MINIMUM_UNLIMITED_SENTINEL,
    )
    plan = ProductionPlan.objects.create(branch=branch, plan_date=timezone.now().date(), status=ProductionPlanStatus.DRAFT, created_by=test_user)
    ProductionPlanLine.objects.create(plan=plan, product=product_meatball, target_quantity=20)

    mrp = calculate_mrp_for_plan(str(plan.id))
    item = mrp["items"][0]
    assert item["is_minimum_unlimited"] is True
    assert item["below_minimum"] is False

# --- Forecast Tests ---

@pytest.mark.django_db
def test_generate_forecast(branch, product_meatball):
    today = timezone.now().date()
    # Mock sales for the last 2 weeks (same day)
    zone = Zone.objects.create(branch=branch, name='Z')
    table = Table.objects.create(zone=zone, name='T1', table_number=1, status=TableStatus.FREE)
    
    from datetime import time
    sale1_date = today - timedelta(days=7)
    sale2_date = today - timedelta(days=14)
    sale1_datetime = timezone.make_aware(timezone.datetime.combine(sale1_date, time(12, 0)))
    sale2_datetime = timezone.make_aware(timezone.datetime.combine(sale2_date, time(12, 0)))
    
    # Sale 1: 10 units
    order1 = Order.objects.create(branch=branch, table=table, status=OrderStatus.COMPLETED, total_amount=Decimal('100'))
    order1.created_at = sale1_datetime
    order1.save()
    from apps.sales.models import Sale
    s1 = Sale.objects.create(branch=branch, order=order1, total_amount=Decimal('100'))
    Sale.objects.filter(pk=s1.pk).update(paid_at=sale1_datetime)
    OrderItem.objects.create(order=order1, product=product_meatball, quantity=10, status=OrderStatus.COMPLETED, unit_price=Decimal('10'), total_price=Decimal('100'))

    # Sale 2: 20 units
    order2 = Order.objects.create(branch=branch, table=table, status=OrderStatus.COMPLETED, total_amount=Decimal('200'))
    order2.created_at = sale2_datetime
    order2.save()
    s2 = Sale.objects.create(branch=branch, order=order2, total_amount=Decimal('200'))
    Sale.objects.filter(pk=s2.pk).update(paid_at=sale2_datetime)
    OrderItem.objects.create(order=order2, product=product_meatball, quantity=20, status=OrderStatus.COMPLETED, unit_price=Decimal('10'), total_price=Decimal('200'))

    # Set safety factor to 1.0 for easy testing
    ProductionDaySettings.objects.create(branch=branch, default_safety_factor=Decimal("1.0"))
    
    forecast = generate_forecast(str(branch.id), today, horizon_weeks=2)
    
    assert str(product_meatball.id) in forecast
    # Avg: (10 + 20) / 2 = 15
    assert forecast[str(product_meatball.id)]["forecasted_qty"] == Decimal("15")

# --- Availability Tests ---

@pytest.mark.django_db
def test_availability_sold_out(branch, product_meatball, settings_block):
    ProductDayAvailability.objects.create(
        branch=branch, product=product_meatball, effective_date=timezone.now().date(),
        mode=AvailabilityMode.SOLD_OUT
    )
    
    res = check_product_availability(str(branch.id), str(product_meatball.id), Decimal("1"))
    assert res["allowed"] is False
    assert res["code"] == "SOLD_OUT"
    assert res["block_mode"] == PosBlockMode.BLOCK

@pytest.mark.django_db
def test_availability_limited_allowed(branch, product_meatball, settings_block):
    ProductDayAvailability.objects.create(
        branch=branch, product=product_meatball, effective_date=timezone.now().date(),
        mode=AvailabilityMode.LIMITED, remaining_portions=Decimal("5")
    )
    
    res = check_product_availability(str(branch.id), str(product_meatball.id), Decimal("3"))
    assert res["allowed"] is True
    assert res["code"] == "OK"

@pytest.mark.django_db
def test_availability_limited_exceeded(branch, product_meatball, settings_block):
    ProductDayAvailability.objects.create(
        branch=branch, product=product_meatball, effective_date=timezone.now().date(),
        mode=AvailabilityMode.LIMITED, remaining_portions=Decimal("5")
    )
    
    res = check_product_availability(str(branch.id), str(product_meatball.id), Decimal("6"))
    assert res["allowed"] is False
    assert res["code"] == "LIMITED_EXCEEDED"

# --- POS Integration Tests ---

@pytest.mark.django_db
def test_check_cart_with_production_overall_block(branch, product_meatball, settings_block):
    ProductDayAvailability.objects.create(
        branch=branch, product=product_meatball, effective_date=timezone.now().date(),
        mode=AvailabilityMode.SOLD_OUT
    )
    
    items_data = [{"product_id": str(product_meatball.id), "quantity": 1}]
    res = check_cart_with_production(str(branch.id), items_data)
    
    assert res["ok"] is False
    assert len(res["production_issues"]) == 1
    assert res["production_issues"][0]["code"] == "SOLD_OUT"

@pytest.mark.django_db
def test_check_cart_with_production_warn_only(branch, product_meatball):
    # Setting block mode to WARN
    ProductionDaySettings.objects.create(branch=branch, pos_block_mode=PosBlockMode.WARN)
    ProductDayAvailability.objects.create(
        branch=branch, product=product_meatball, effective_date=timezone.now().date(),
        mode=AvailabilityMode.SOLD_OUT
    )
    
    items_data = [{"product_id": str(product_meatball.id), "quantity": 1}]
    res = check_cart_with_production(str(branch.id), items_data)
    
    # For WARN, the cart is considered ok (not forcefully blocked)
    assert res["ok"] is True
    assert len(res["production_issues"]) == 1
    assert res["production_issues"][0]["code"] == "SOLD_OUT"
    assert res["production_issues"][0]["block_mode"] == PosBlockMode.WARN


# --- Plan copy ---

@pytest.mark.django_db
def test_copy_production_plan_to_new_date(test_user, branch, product_meatball):
    d1 = date(2026, 4, 1)
    d2 = date(2026, 4, 2)
    plan = ProductionPlan.objects.create(
        branch=branch,
        plan_date=d1,
        status=ProductionPlanStatus.APPROVED,
        created_by=test_user,
        notes="Kaynak not",
    )
    ProductionPlanLine.objects.create(
        plan=plan,
        product=product_meatball,
        target_quantity=Decimal("3"),
        source=ProductionPlanSource.MANUAL,
    )
    new_p = copy_production_plan_to_date(plan, d2, test_user)
    assert new_p.plan_date == d2
    assert new_p.branch_id == branch.id
    assert new_p.status == ProductionPlanStatus.DRAFT
    assert new_p.notes == "Kaynak not"
    assert new_p.approved_by_id is None
    assert new_p.lines.filter(is_active=True).count() == 1
    line = new_p.lines.first()
    assert line.product_id == product_meatball.id
    assert line.target_quantity == Decimal("3")


@pytest.mark.django_db
def test_copy_production_plan_same_date_raises(test_user, branch, product_meatball):
    d1 = date(2026, 4, 1)
    plan = ProductionPlan.objects.create(
        branch=branch, plan_date=d1, status=ProductionPlanStatus.DRAFT, created_by=test_user
    )
    with pytest.raises(DRFValidationError):
        copy_production_plan_to_date(plan, d1, test_user)


@pytest.mark.django_db
def test_copy_production_plan_target_occupied_raises(test_user, branch, product_meatball):
    d1 = date(2026, 4, 1)
    d2 = date(2026, 4, 2)
    ProductionPlan.objects.create(
        branch=branch, plan_date=d2, status=ProductionPlanStatus.DRAFT, created_by=test_user
    )
    source = ProductionPlan.objects.create(
        branch=branch, plan_date=d1, status=ProductionPlanStatus.DRAFT, created_by=test_user
    )
    ProductionPlanLine.objects.create(plan=source, product=product_meatball, target_quantity=1)
    with pytest.raises(DRFValidationError):
        copy_production_plan_to_date(source, d2, test_user)

