from apps.reporting.reports.base_report import BaseModuleReport
from apps.reporting.registry import report_registry
from apps.production_planning.services.mrp_service import calculate_mrp_for_plan
from apps.production_planning.services.approximate_cost_service import calculate_approximate_cost_for_plan
from apps.production_planning.models import ProductionPlan
from django.utils import timezone
from django.utils.translation import gettext, gettext_lazy

class ProductionPlanMrpReport(BaseModuleReport):
    """
    MRP (Malzeme İhtiyaç Planlaması) Raporu.
    Üretim planı bazlı malzeme gereksinimlerini ve stok açıklarını listeler.
    """
    slug = 'production-plan-mrp'
    name = gettext_lazy('MRP (Malzeme İhtiyaç Planlaması)')
    description = gettext_lazy('Üretim planı bazlı malzeme gereksinim raporu.')
    category = 'PRODUCTION'
    template_name = 'reports/mrp_pdf.html'

    def get_context(self) -> dict:
        filters = self.kwargs
        plan_id = filters.get('plan_id')
        station_id = filters.get('station_id')
        station_name = filters.get('station_name', gettext('Tüm İstasyonlar'))
        
        if not plan_id:
            return {"error": gettext("Plan ID belirtilmedi.")}
            
        plan = ProductionPlan.objects.filter(id=plan_id).first()
        if not plan:
            return {"error": gettext("Plan bulunamadı.")}
            
        mrp_data = calculate_mrp_for_plan(str(plan.id), station_id=station_id)
        
        return {
            "report_name": self.name,
            "plan": plan,
            "mrp": mrp_data,
            "station_name": station_name,
            "today": timezone.now(),
            "filters": filters
        }

report_registry.register(ProductionPlanMrpReport)


class ProductionPlanApproximateCostReport(BaseModuleReport):
    """
    Üretim planı yaklaşık maliyet raporu (FEFO birim fiyat).
    """
    slug = 'production-plan-approximate-cost'
    name = gettext_lazy('Üretim Planı Yaklaşık Maliyet')
    description = gettext_lazy('FEFO lot birim fiyatları ile üretim planı yaklaşık maliyet raporu.')
    category = 'PRODUCTION'
    template_name = 'reports/approximate_cost_pdf.html'

    def get_context(self) -> dict:
        filters = self.kwargs
        plan_id = filters.get('plan_id')
        station_id = filters.get('station_id')
        station_name = filters.get('station_name', gettext('Tüm İstasyonlar'))

        if not plan_id:
            return {"error": gettext("Plan ID belirtilmedi.")}

        plan = ProductionPlan.objects.filter(id=plan_id).select_related('branch').first()
        if not plan:
            return {"error": gettext("Plan bulunamadı.")}

        cost_data = calculate_approximate_cost_for_plan(
            str(plan.id),
            station_id=station_id,
            page=1,
            page_size=10000,
        )

        return {
            "report_name": self.name,
            "plan": plan,
            "cost_data": cost_data,
            "station_name": station_name,
            "today": timezone.now(),
            "filters": filters,
        }

    def get_excel_data(self, context: dict):
        columns = [
            {'key': 'product_name', 'label': str(gettext('Ürün / Hammadde'))},
            {'key': 'station_name', 'label': str(gettext('İstasyon'))},
            {'key': 'quantity', 'label': str(gettext('Miktar'))},
            {'key': 'unit', 'label': str(gettext('Birim'))},
            {'key': 'unit_cost', 'label': str(gettext('Birim Maliyet (FEFO)'))},
            {'key': 'line_total', 'label': str(gettext('Toplam'))},
        ]
        cost_data = context.get('cost_data') or {}
        rows = []
        for item in cost_data.get('items', []):
            rows.append({
                'product_name': item.get('product_name', ''),
                'station_name': item.get('station_name', ''),
                'quantity': float(item.get('quantity') or 0),
                'unit': str(gettext('Porsiyon')),
                'unit_cost': float(item.get('unit_cost') or 0),
                'line_total': float(item.get('line_total') or 0),
            })
            for ing in item.get('ingredients') or []:
                rows.append({
                    'product_name': f"  → {ing.get('stock_item_name', '')}",
                    'station_name': '',
                    'quantity': float(ing.get('quantity') or 0),
                    'unit': ing.get('unit', ''),
                    'unit_cost': float(ing.get('unit_cost') or 0),
                    'line_total': float(ing.get('line_total') or 0),
                })
        rows.append({
            'product_name': '',
            'station_name': '',
            'quantity': '',
            'unit': '',
            'unit_cost': str(gettext('Genel Toplam')),
            'line_total': float(cost_data.get('grand_total') or 0),
        })
        return rows, columns


report_registry.register(ProductionPlanApproximateCostReport)
