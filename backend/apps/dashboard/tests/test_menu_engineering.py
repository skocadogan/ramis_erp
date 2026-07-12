from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from apps.branches.models import KitchenStation
from apps.inventory.models import StockItem, StockMovement, StockMovementType
from apps.inventory.services.stock_reservation_service import StockReservationService
from apps.menu.models import Category, CombinedProductItem, Product, ProductUnit
from apps.orders.models import Order, OrderItem, OrderStatus
from apps.recipes.models import Recipe, RecipeIngredient
from apps.reporting.services.renderer import ReportRenderer
from apps.sales.reports.product_reports import MenuEngineeringAnalyticsReport
from apps.sales.models import Sale
from apps.warehouse.models import Warehouse, WarehouseStockLevel, WarehouseType


def _make_sale(branch, product, *, stock_tracking_mode: str, total_price: Decimal, quantity: int = 1):
    order = Order.objects.create(
        branch=branch,
        status=OrderStatus.COMPLETED,
        total_amount=total_price,
        stock_tracking_mode=stock_tracking_mode,
    )
    OrderItem.objects.create(
        order=order,
        branch=branch,
        product=product,
        quantity=quantity,
        unit_price=total_price / Decimal(quantity),
        total_price=total_price,
        status=OrderStatus.COMPLETED,
    )
    sale = Sale.objects.create(
        order=order,
        branch=branch,
        total_amount=total_price,
    )
    Sale.objects.filter(id=sale.id).update(paid_at=timezone.now())
    return sale


@pytest.mark.django_db
class TestMenuEngineeringAnalytics:
    def test_menu_engineering_report_template_renders(self):
        context = {
            "report_name": "Menü Mühendisliği",
            "report_description": "Şablon render testi",
            "count": 1,
            "filters": {
                "start_date": None,
                "end_date": None,
                "branch_id": "ALL",
                "menu_class": None,
            },
            "summary": {
                "total_products": 1,
                "classified_products": 1,
                "stars_count": 1,
                "puzzlers_count": 0,
                "plowhorses_count": 0,
                "dogs_count": 0,
                "fully_costed_products": 1,
                "partial_coverage_products": 0,
            },
            "analysis_mode": "actual",
            "products": [
                {
                    "product_name": "Test Burger",
                    "category_name": "Ana Yemek",
                    "menu_class": "STAR",
                    "sold_qty": 3,
                    "revenue": 150,
                    "food_cost": 50,
                    "gross_profit": 100,
                    "margin_pct": 66.7,
                    "coverage_note": "FULL",
                }
            ],
            "stock_variance_summary": {
                "totals": {
                    "total_variance_cost": 10,
                    "waste_qty": 1,
                    "cancel_qty": 0,
                    "return_qty": 0,
                }
            },
        }

        html = ReportRenderer(language_code="tr").render_file(
            "reports/menu_engineering.html",
            context,
        )

        assert "Menü Mühendisliği" in html
        assert "Test Burger" in html
        assert "Tam kapsanan" in html

    def test_menu_engineering_report_context_humanizes_codes(self, monkeypatch):
        monkeypatch.setattr(
            "apps.sales.reports.product_reports.get_menu_engineering_analytics",
            lambda **kwargs: {
                "summary": {"total_products": 1, "classified_products": 1},
                "actual_summary": {"total_products": 1, "classified_products": 1},
                "stock_variance_summary": {"totals": {}},
                "products": [
                    {
                        "product_name": "Adana",
                        "category_name": "Izgara",
                        "menu_class": "STAR",
                        "actual_menu_class": "PLOWHORSE",
                        "sold_qty": 2,
                        "revenue": 100,
                        "estimated_unit_cost": 30,
                        "estimated_food_cost": 60,
                        "estimated_gross_profit": 40,
                        "estimated_margin_pct": 40,
                        "stock_tracking_mode_coverage": "INGREDIENT",
                        "variance_coverage": "STOCK_ONLY",
                        "actual_unit_cost": 32,
                        "actual_food_cost": 64,
                        "actual_gross_profit": 36,
                        "actual_margin_pct": 36,
                        "actual_coverage": "PARTIAL",
                    }
                ],
            },
        )

        estimated_context = MenuEngineeringAnalyticsReport(
            menu_class="STAR",
            analysis_mode="estimated",
        ).get_context()
        estimated_row = estimated_context["products"][0]
        assert estimated_row["menu_class"] == "Yıldız"
        assert estimated_row["coverage_note"] == "Ingredient mod / Yalnızca stok bazlı sapma"
        assert estimated_context["filters"]["menu_class_label"] == "Yıldız"

        actual_context = MenuEngineeringAnalyticsReport(
            analysis_mode="actual",
        ).get_context()
        actual_row = actual_context["products"][0]
        assert actual_row["menu_class"] == "At"
        assert actual_row["coverage_note"] == "Kısmi Kapsama"

    def test_menu_engineering_endpoint_returns_profitability_and_variance_summary(self, api_client, branch, user):
        warehouse = Warehouse.objects.create(
            name="Mutfak Deposu",
            code="KIT-TEST",
            warehouse_type=WarehouseType.KITCHEN,
            is_default=True,
        )
        warehouse.branches.add(branch)
        station = KitchenStation.objects.create(
            branch=branch,
            name="Ana Mutfak",
            code="ana-mutfak",
            warehouse=warehouse,
        )
        category = Category.objects.create(name="Izgara", station=station)
        product = Product.objects.create(
            category=category,
            name="Adana Kebap",
            base_price=Decimal("30.00"),
        )
        product.branches.add(branch)
        stock_item = StockItem.objects.create(
            name="Et",
            sku="ET-001",
            unit="adet",
            last_purchase_price=Decimal("12.00"),
            average_cost=Decimal("12.0000"),
        )
        recipe = Recipe.objects.create(product=product, name="Adana Reçete", servings=1)
        recipe.branches.add(branch)
        RecipeIngredient.objects.create(
            recipe=recipe,
            stock_item=stock_item,
            quantity=Decimal("1.000000"),
            normalized_quantity=Decimal("1.000000"),
            unit="adet",
        )

        _make_sale(branch, product, stock_tracking_mode="INGREDIENT", total_price=Decimal("60.00"), quantity=2)
        _make_sale(branch, product, stock_tracking_mode="PRODUCT", total_price=Decimal("30.00"), quantity=1)

        StockMovement.objects.create(
            stock_item=stock_item,
            warehouse=warehouse,
            movement_type=StockMovementType.WASTE,
            quantity=Decimal("1.000000"),
            unit="adet",
            unit_price=Decimal("12.00"),
            reference="Gün sonu kapanış",
        )

        api_client.force_authenticate(user=user)
        response = api_client.get(
            reverse("dashboard-menu-engineering"),
            {"start_date": timezone.now().date().isoformat(), "end_date": timezone.now().date().isoformat()},
        )

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        assert payload["summary"]["total_products"] == 1
        assert payload["summary"]["classified_products"] == 1
        assert payload["summary"]["stars_count"] == 1
        assert payload["stock_variance_summary"]["totals"]["waste_qty"] == 1.0

        row = payload["products"][0]
        assert row["product_name"] == "Adana Kebap"
        assert row["recipe_status"] == "HAS_RECIPE"
        assert row["stock_tracking_mode_coverage"] == "MIXED"
        assert row["variance_coverage"] == "STOCK_ONLY"
        assert row["menu_class"] == "STAR"
        assert row["estimated_unit_cost"] == 12.0
        assert row["estimated_gross_profit"] == 54.0
        assert row["action_recommendations"] == ["FEATURE"]
        assert payload["action_summary"]["FEATURE"] == 1

    def test_menu_engineering_marks_products_without_recipe(self, api_client, branch, user):
        category = Category.objects.create(name="İçecek")
        product = Product.objects.create(
            category=category,
            name="Ayran",
            base_price=Decimal("15.00"),
        )
        product.branches.add(branch)

        _make_sale(branch, product, stock_tracking_mode="PRODUCT", total_price=Decimal("15.00"), quantity=1)

        api_client.force_authenticate(user=user)
        response = api_client.get(
            reverse("dashboard-menu-engineering"),
            {"start_date": timezone.now().date().isoformat(), "end_date": timezone.now().date().isoformat()},
        )

        assert response.status_code == status.HTTP_200_OK
        row = response.json()["products"][0]
        assert row["recipe_status"] == "NO_RECIPE"
        assert row["estimated_unit_cost"] is None
        assert row["estimated_gross_profit"] is None
        assert row["menu_class"] is None

    def test_menu_engineering_returns_actual_margin_when_ledger_exists(self, api_client, branch, user):
        warehouse = Warehouse.objects.create(
            name="Gercek Maliyet Deposu",
            code="ACT-WH",
            warehouse_type=WarehouseType.KITCHEN,
            is_default=True,
        )
        warehouse.branches.add(branch)
        station = KitchenStation.objects.create(
            branch=branch,
            name="Hazırlık",
            code="hazirlik",
            warehouse=warehouse,
        )
        category = Category.objects.create(name="Dürüm", station=station)
        product = Product.objects.create(
            category=category,
            name="Adana Dürüm",
            base_price=Decimal("40.00"),
        )
        product.branches.add(branch)
        stock_item = StockItem.objects.create(
            name="Kıyma",
            sku="KIY-001",
            unit="adet",
            last_purchase_price=Decimal("18.00"),
            average_cost=Decimal("18.0000"),
        )
        recipe = Recipe.objects.create(product=product, name="Adana Dürüm Reçete", servings=1)
        recipe.branches.add(branch)
        RecipeIngredient.objects.create(
            recipe=recipe,
            stock_item=stock_item,
            quantity=Decimal("1.000000"),
            normalized_quantity=Decimal("1.000000"),
            unit="adet",
        )
        WarehouseStockLevel.objects.create(
            warehouse=warehouse,
            stock_item=stock_item,
            quantity=Decimal("10.000000"),
            minimum_quantity=Decimal("1.000000"),
        )

        order = Order.objects.create(
            branch=branch,
            status=OrderStatus.COMPLETED,
            total_amount=Decimal("80.00"),
            stock_tracking_mode="INGREDIENT",
        )
        OrderItem.objects.create(
            order=order,
            branch=branch,
            product=product,
            quantity=2,
            unit_price=Decimal("40.00"),
            total_price=Decimal("80.00"),
            status=OrderStatus.COMPLETED,
            station=station,
        )
        sale = Sale.objects.create(order=order, branch=branch, total_amount=Decimal("80.00"))
        Sale.objects.filter(id=sale.id).update(paid_at=timezone.now())

        reservations = StockReservationService.reserve_for_order(order)
        assert len(reservations) == 1
        StockReservationService.commit_reservations(order, performed_by=user)

        api_client.force_authenticate(user=user)
        response = api_client.get(
            reverse("dashboard-menu-engineering"),
            {"start_date": timezone.now().date().isoformat(), "end_date": timezone.now().date().isoformat()},
        )

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        row = next(item for item in payload["products"] if item["product_name"] == "Adana Dürüm")
        assert row["actual_coverage"] == "FULL"
        assert row["actual_unit_cost"] == 18.0
        assert row["actual_gross_profit"] == 44.0
        assert row["actual_menu_class"] == "STAR"
        assert payload["actual_summary"]["classified_products"] == 1
        assert payload["actual_summary"]["fully_costed_products"] == 1

    def test_menu_engineering_returns_combined_product_components(self, api_client, branch, user):
        category = Category.objects.create(name="Menü")
        child_a = Product.objects.create(
            category=category,
            name="Çorba",
            base_price=Decimal("40.00"),
        )
        child_b = Product.objects.create(
            category=category,
            name="Salata",
            base_price=Decimal("35.00"),
        )
        child_a.branches.add(branch)
        child_b.branches.add(branch)
        half_unit = ProductUnit.objects.create(
            product=child_a,
            name="Yarım",
            multiplier=Decimal("0.5000"),
            order=1,
        )
        combo = Product.objects.create(
            category=category,
            name="Öğle Menü",
            base_price=Decimal("75.00"),
            is_combined=True,
        )
        combo.branches.add(branch)
        CombinedProductItem.objects.create(
            parent_product=combo,
            product=child_a,
            quantity=Decimal("1.0000"),
            product_unit=half_unit,
        )
        CombinedProductItem.objects.create(
            parent_product=combo,
            product=child_b,
            quantity=Decimal("1.0000"),
        )

        _make_sale(branch, combo, stock_tracking_mode="PRODUCT", total_price=Decimal("75.00"), quantity=1)

        api_client.force_authenticate(user=user)
        response = api_client.get(
            reverse("dashboard-menu-engineering"),
            {"start_date": timezone.now().date().isoformat(), "end_date": timezone.now().date().isoformat()},
        )

        assert response.status_code == status.HTTP_200_OK
        row = next(item for item in response.json()["products"] if item["product_name"] == "Öğle Menü")
        assert row["is_combined"] is True
        assert len(row["combined_components"]) == 2

        soup = next(c for c in row["combined_components"] if c["product_name"] == "Çorba")
        assert soup["product_unit_name"] == "Yarım"
        assert soup["product_unit_multiplier"] == 0.5
        assert soup["effective_quantity"] == 0.5

        salad = next(c for c in row["combined_components"] if c["product_name"] == "Salata")
        assert salad["product_unit_name"] is None
        assert salad["product_unit_multiplier"] == 1.0
        assert salad["effective_quantity"] == 1.0


class TestMenuEngineeringActionRecommendations:
    def test_compute_action_recommendations_by_menu_class(self):
        from apps.dashboard.selectors import _compute_action_recommendations

        assert _compute_action_recommendations({
            "menu_class": "STAR",
            "actual_coverage": "NONE",
        }) == ["FEATURE"]
        assert _compute_action_recommendations({
            "menu_class": "PLOWHORSE",
            "actual_coverage": "NONE",
        }) == ["INCREASE_PRICE"]
        assert _compute_action_recommendations({
            "menu_class": "PUZZLE",
            "actual_coverage": "NONE",
        }) == ["FEATURE"]
        assert _compute_action_recommendations({
            "menu_class": "DOG",
            "actual_coverage": "NONE",
        }) == ["REMOVE_FROM_MENU"]

    def test_compute_action_recommendations_prefers_actual_class_and_cost_increase(self):
        from apps.dashboard.selectors import _compute_action_recommendations

        actions = _compute_action_recommendations({
            "menu_class": "STAR",
            "actual_menu_class": "PLOWHORSE",
            "actual_coverage": "FULL",
            "estimated_unit_cost": 10.0,
            "actual_unit_cost": 11.0,
        })
        assert actions == ["INCREASE_PRICE", "COST_INCREASED"]

        no_cost_spike = _compute_action_recommendations({
            "menu_class": "STAR",
            "actual_menu_class": "STAR",
            "actual_coverage": "FULL",
            "estimated_unit_cost": 10.0,
            "actual_unit_cost": 10.4,
        })
        assert no_cost_spike == ["FEATURE"]
