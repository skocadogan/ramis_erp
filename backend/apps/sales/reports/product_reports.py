from django.utils.dateparse import parse_date
from django.utils.translation import gettext, gettext_lazy

from apps.reporting.reports.base_report import BaseModuleReport
from apps.reporting.registry import report_registry
from apps.dashboard.selectors import (
    get_menu_engineering_analytics,
    get_product_sales_analytics,
)


def _menu_class_label(value: str | None) -> str:
    labels = {
        "STAR": gettext("Yıldız"),
        "PLOWHORSE": gettext("At"),
        "PUZZLE": gettext("Bulmaca"),
        "DOG": gettext("Köpek"),
    }
    if not value:
        return gettext("Sınıflandırılamadı")
    return labels.get(value, value)


def _estimated_coverage_label(row: dict) -> str:
    mode_labels = {
        "INGREDIENT": gettext("Ingredient mod"),
        "PRODUCT": gettext("Product mod"),
        "MIXED": gettext("Karma mod"),
    }
    variance_labels = {
        "NONE": gettext("Ürün bazlı sapma yok"),
        "STOCK_ONLY": gettext("Yalnızca stok bazlı sapma"),
    }
    mode = mode_labels.get(row.get("stock_tracking_mode_coverage"), row.get("stock_tracking_mode_coverage") or "")
    variance = variance_labels.get(row.get("variance_coverage"), row.get("variance_coverage") or "")
    if mode and variance:
        return f"{mode} / {variance}"
    return mode or variance


def _actual_coverage_label(value: str | None) -> str:
    labels = {
        "FULL": gettext("Tam Kapsama"),
        "PARTIAL": gettext("Kısmi Kapsama"),
        "NONE": gettext("Kapsama yok"),
    }
    if not value:
        return gettext("Kapsama yok")
    return labels.get(value, value)


def _action_recommendations_label(actions: list[str] | None) -> str:
    labels = {
        "INCREASE_PRICE": gettext("Fiyat artır"),
        "FEATURE": gettext("Öne çıkar"),
        "REMOVE_FROM_MENU": gettext("Menüden çıkar"),
        "COST_INCREASED": gettext("Maliyet arttı"),
    }
    if not actions:
        return "—"
    return ", ".join(labels.get(action, action) for action in actions)

class ProductSalesAnalyticsReport(BaseModuleReport):
    """
    Ürün Satış Analizi Raporu (Excel/PDF).
    """
    slug = 'product-sales-analytics'
    name = gettext_lazy('Ürün Satış Analiz Raporu')
    description = gettext_lazy('Belirli tarih aralığı ve şube bazında ürünlerin satış performans analizi.')
    category = 'SALES'
    template_name = 'reports/product_analytics.html'

    def get_context(self) -> dict:
        filters = self.kwargs.copy()
        
        if filters.get('start_date'):
            filters['start_date'] = parse_date(filters['start_date'])
        if filters.get('end_date'):
            filters['end_date'] = parse_date(filters['end_date'])

        branch_id = filters.get('branch_id')
        branch_ids = [branch_id] if branch_id and branch_id != 'ALL' else None

        # Veriyi çek (Mevcut selector'ı kullan)
        data = get_product_sales_analytics(
            branch_ids=branch_ids,
            start_date=filters.get('start_date'),
            end_date=filters.get('end_date')
        )
        
        products = data.get('products', [])

        return {
            'report_name': self.name,
            'report_description': self.description,
            'products': products,
            'filters': filters,
            'count': len(products)
        }

    def get_excel_data(self, context: dict):
        """Excel çıktısı için veri ve kolon tanımlarını döner."""
        products = context.get('products', [])
        columns = [
            {'key': 'name', 'label': gettext('Ürün Adı')},
            {'key': 'category', 'label': gettext('Kategori')},
            {'key': 'quantity', 'label': gettext('Satılan Miktar')},
            {'key': 'revenue', 'label': gettext('Toplam Ciro')},
        ]
        # Veriyi Excel dostu formatta (basit tipler) hazırla
        data = [
            {
                'name': p['name'],
                'category': p['category'],
                'quantity': float(p['quantity']),
                'revenue': float(p['revenue']),
            }
            for p in products
        ]
        return data, columns

report_registry.register(ProductSalesAnalyticsReport)


class MenuEngineeringAnalyticsReport(BaseModuleReport):
    """
    Menü mühendisliği ve tahmini kârlılık raporu.
    """

    slug = "menu-engineering-analytics"
    name = gettext_lazy("Menü Mühendisliği Raporu")
    description = gettext_lazy("Ürün bazlı tahmini kârlılık ve menü sınıflandırma raporu.")
    category = "SALES"
    template_name = "reports/menu_engineering.html"

    def get_context(self) -> dict:
        filters = self.kwargs.copy()
        if filters.get("start_date"):
            filters["start_date"] = parse_date(filters["start_date"])
        if filters.get("end_date"):
            filters["end_date"] = parse_date(filters["end_date"])

        branch_id = filters.get("branch_id")
        branch_ids = [branch_id] if branch_id and branch_id != "ALL" else None
        analysis_mode = filters.get("analysis_mode") or "estimated"
        if filters.get("menu_class"):
            filters["menu_class_label"] = _menu_class_label(filters.get("menu_class"))
        data = get_menu_engineering_analytics(
            branch_ids=branch_ids,
            start_date=filters.get("start_date"),
            end_date=filters.get("end_date"),
            product_id=filters.get("product_id"),
            category_id=filters.get("category_id"),
            menu_class=filters.get("menu_class"),
            top_limit=int(filters.get("limit") or 10),
        )
        products = data.get("products", [])
        if analysis_mode == "actual":
            summary = data.get("actual_summary", {})
            report_rows = [
                {
                    "product_name": row.get("product_name", ""),
                    "category_name": row.get("category_name", ""),
                    "menu_class": _menu_class_label(row.get("actual_menu_class")),
                    "sold_qty": float(row.get("sold_qty") or 0),
                    "revenue": float(row.get("revenue") or 0),
                    "unit_cost": row.get("actual_unit_cost"),
                    "food_cost": row.get("actual_food_cost"),
                    "gross_profit": row.get("actual_gross_profit"),
                    "margin_pct": row.get("actual_margin_pct"),
                    "coverage_note": _actual_coverage_label(row.get("actual_coverage")),
                    "action_recommendations": _action_recommendations_label(row.get("action_recommendations")),
                }
                for row in products
            ]
        else:
            summary = data.get("summary", {})
            report_rows = [
                {
                    "product_name": row.get("product_name", ""),
                    "category_name": row.get("category_name", ""),
                    "menu_class": _menu_class_label(row.get("menu_class")),
                    "sold_qty": float(row.get("sold_qty") or 0),
                    "revenue": float(row.get("revenue") or 0),
                    "unit_cost": row.get("estimated_unit_cost"),
                    "food_cost": row.get("estimated_food_cost"),
                    "gross_profit": row.get("estimated_gross_profit"),
                    "margin_pct": row.get("estimated_margin_pct"),
                    "coverage_note": _estimated_coverage_label(row),
                    "action_recommendations": _action_recommendations_label(row.get("action_recommendations")),
                }
                for row in products
            ]
        return {
            "report_name": self.name,
            "report_description": self.description,
            "products": report_rows,
            "summary": summary,
            "analysis_mode": analysis_mode,
            "stock_variance_summary": data.get("stock_variance_summary", {}),
            "filters": filters,
            "count": len(report_rows),
        }

    def get_excel_data(self, context: dict):
        products = context.get("products", [])
        analysis_mode = context.get("analysis_mode") or "estimated"
        unit_cost_label = gettext("Gerçek Birim Maliyet") if analysis_mode == "actual" else gettext("Tahmini Birim Maliyet")
        food_cost_label = gettext("Gerçek Toplam Maliyet") if analysis_mode == "actual" else gettext("Tahmini Toplam Maliyet")
        profit_label = gettext("Gerçek Brüt Kar") if analysis_mode == "actual" else gettext("Tahmini Brüt Kar")
        margin_label = gettext("Gerçek Marj %") if analysis_mode == "actual" else gettext("Tahmini Marj %")
        coverage_label = gettext("Gerçek Kapsam") if analysis_mode == "actual" else gettext("Sapma Kapsamı")
        columns = [
            {"key": "product_name", "label": gettext("Ürün Adı")},
            {"key": "category_name", "label": gettext("Kategori")},
            {"key": "menu_class", "label": gettext("Menü Sınıfı")},
            {"key": "sold_qty", "label": gettext("Satılan Miktar")},
            {"key": "revenue", "label": gettext("Ciro")},
            {"key": "unit_cost", "label": unit_cost_label},
            {"key": "food_cost", "label": food_cost_label},
            {"key": "gross_profit", "label": profit_label},
            {"key": "margin_pct", "label": margin_label},
            {"key": "coverage_note", "label": coverage_label},
            {"key": "action_recommendations", "label": gettext("Aksiyon Önerileri")},
        ]
        data = [
            {
                "product_name": row.get("product_name", ""),
                "category_name": row.get("category_name", ""),
                "menu_class": row.get("menu_class", ""),
                "sold_qty": float(row.get("sold_qty") or 0),
                "revenue": float(row.get("revenue") or 0),
                "unit_cost": float(row.get("unit_cost") or 0),
                "food_cost": float(row.get("food_cost") or 0),
                "gross_profit": float(row.get("gross_profit") or 0),
                "margin_pct": float(row.get("margin_pct") or 0),
                "coverage_note": row.get("coverage_note", ""),
                "action_recommendations": row.get("action_recommendations", ""),
            }
            for row in products
        ]
        return data, columns


report_registry.register(MenuEngineeringAnalyticsReport)
