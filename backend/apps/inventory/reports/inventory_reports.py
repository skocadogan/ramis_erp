from django.db.models import F, Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.utils.translation import gettext, gettext_lazy

from apps.reporting.reports.base_report import BaseModuleReport
from apps.reporting.registry import report_registry
from apps.inventory import selectors
from apps.inventory.models import StockMovementType
from core.branch_scope import user_accessible_warehouse_id_strings, filter_queryset_by_accessible_warehouses

class StockItemListReport(BaseModuleReport):
    """
    Filtrelenmiş Envanter Kalemleri Listesi.
    """
    slug = 'stock-item-list'
    name = gettext_lazy('Envanter Kalem Listesi')
    description = gettext_lazy('Stok miktarları, kategoriler ve depo bazlı envanter dökümü.')
    category = 'INVENTORY'
    template_name = 'reports/stock_item_list.html'

    def get_context(self) -> dict:
        filters = self.kwargs
        warehouse_id = filters.get('warehouse_id')
        category_id = filters.get('category_id')
        stock_status = filters.get('stock_status')
        search = filters.get('search')

        allowed_wh = user_accessible_warehouse_id_strings(self.request.user)
        limit_ids = None
        if allowed_wh is not None:
            limit_ids = list(allowed_wh)
            if warehouse_id and str(warehouse_id) not in allowed_wh:
                return {"items": [], "filters": filters}

        qs = selectors.get_active_stock_items(
            warehouse_id=warehouse_id,
            category_id=category_id,
            limit_warehouse_ids=None if warehouse_id else limit_ids,
        )

        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(sku__icontains=search) | Q(barcode__icontains=search))

        if stock_status:
            from apps.inventory.stock_minimum import MINIMUM_UNLIMITED_SENTINEL
            if stock_status == 'normal':
                qs = qs.filter(Q(current_quantity__gt=F('effective_minimum')) | Q(effective_minimum=MINIMUM_UNLIMITED_SENTINEL))
            elif stock_status == 'low':
                qs = qs.filter(Q(current_quantity__lt=F('effective_minimum')) & Q(current_quantity__gt=0) & Q(effective_minimum__gt=MINIMUM_UNLIMITED_SENTINEL))
            elif stock_status == 'critical':
                qs = qs.filter(Q(current_quantity__lte=0) & Q(effective_minimum__gt=MINIMUM_UNLIMITED_SENTINEL))
            elif stock_status == 'warning':
                qs = qs.filter(Q(current_quantity=F('effective_minimum')) & Q(effective_minimum__gt=MINIMUM_UNLIMITED_SENTINEL))

        total_count = qs.count()
        items = [
            {
                "id": str(item.id),
                "name": item.name,
                "sku": item.sku,
                "category_name": item.category.name if item.category else "—",
                "unit": item.unit,
                "current_quantity": item.current_quantity,
                "minimum_quantity": item.effective_minimum,
                "is_low_stock": item.is_low_stock,
                "last_purchase_price": item.last_purchase_price,
            }
            for item in qs[:2000]
        ]

        warehouse = selectors.get_warehouse(warehouse_id) if warehouse_id else None
        category = selectors.get_category(category_id) if category_id else None

        return {
            "report_name": self.name,
            "items": items,
            "filters": filters,
            "warehouse_name": warehouse.name if warehouse else (f"ID: {warehouse_id}" if warehouse_id else None),
            "category_name": category.name if category else (f"ID: {category_id}" if category_id else None),
            "count": len(items),
            "total_count": total_count,
            "limit_reached": total_count > 2000
        }

class StockMovementListReport(BaseModuleReport):
    """
    Filtrelenmiş Envanter Hareketleri.
    """
    slug = 'stock-movement-list'
    name = gettext_lazy('Envanter Hareket Raporu')
    description = gettext_lazy('Giriş, çıkış, fire ve düzeltme hareketlerinin detaylı dökümü.')
    category = 'INVENTORY'
    template_name = 'reports/stock_movement_list.html'

    def get_context(self) -> dict:
        filters = self.kwargs.copy()
        
        if filters.get('start_date'):
            filters['start_date'] = parse_date(filters['start_date'])
        if filters.get('end_date'):
            filters['end_date'] = parse_date(filters['end_date'])

        movement_types = None
        movement_types_raw = filters.get('movement_types')
        if movement_types_raw:
            if isinstance(movement_types_raw, str):
                movement_types = [t.strip() for t in movement_types_raw.split(',') if t.strip()]

        qs = selectors.get_stock_movements(
            stock_item_id=filters.get('stock_item_id'),
            warehouse_id=filters.get('warehouse_id'),
            movement_type=filters.get('movement_type') if filters.get('movement_type') != 'ALL' and not movement_types else None,
            movement_types=movement_types,
            start_date=filters.get('start_date'),
            end_date=filters.get('end_date'),
            reason_code=filters.get('reason_code'),
            supplier_id=filters.get('supplier_id'),
        )
        
        qs = filter_queryset_by_accessible_warehouses(qs, self.request.user)
        
        if filters.get('search'):
            s = filters['search']
            qs = qs.filter(Q(stock_item__name__icontains=s) | Q(stock_item__sku__icontains=s) | Q(reference__icontains=s))

        total_count = qs.count()
        movements = [
            {
                "date": m.created_at,
                "item_name": m.stock_item.name,
                "warehouse_name": m.warehouse.name,
                "type": m.movement_type,
                "type_display": m.get_movement_type_display(),
                "quantity": m.quantity,
                "unit": m.unit or m.stock_item.unit,
                "reference": m.reference,
                "notes": m.notes,
                "performed_by": m.performed_by.get_full_name() or m.performed_by.username if m.performed_by else gettext("Sistem"),
            }
            for m in qs[:2000]
        ]

        warehouse_id = filters.get('warehouse_id')
        stock_item_id = filters.get('stock_item_id')
        warehouse = selectors.get_warehouse(warehouse_id) if warehouse_id else None
        stock_item = selectors.get_stock_item(stock_item_id) if stock_item_id else None

        return {
            "report_name": self.name,
            "movements": movements,
            "filters": filters,
            "warehouse_name": warehouse.name if warehouse else (f"ID: {warehouse_id}" if warehouse_id else None),
            "stock_item_name": stock_item.name if stock_item else (f"ID: {stock_item_id}" if stock_item_id else None),
            "count": len(movements),
            "total_count": total_count,
            "limit_reached": total_count > 2000
        }

    def get_excel_data(self, context: dict):
        from apps.inventory.return_cancel_reasons import format_reason_display
        columns = [
            {'key': 'date', 'label': str(gettext('Tarih'))},
            {'key': 'type', 'label': str(gettext('Tip'))},
            {'key': 'item_name', 'label': str(gettext('Ürün'))},
            {'key': 'warehouse_name', 'label': str(gettext('Depo'))},
            {'key': 'quantity', 'label': str(gettext('Miktar'))},
            {'key': 'unit', 'label': str(gettext('Birim'))},
            {'key': 'reference', 'label': str(gettext('Neden'))},
            {'key': 'performed_by', 'label': str(gettext('İşlemi Yapan'))},
        ]
        rows = []
        for m in context.get('movements', []):
            rows.append({
                'date': m['date'].strftime('%d.%m.%Y %H:%M') if m.get('date') else '',
                'type': m.get('type', ''),
                'item_name': m.get('item_name', ''),
                'warehouse_name': m.get('warehouse_name', ''),
                'quantity': float(m.get('quantity') or 0),
                'unit': m.get('unit', ''),
                'reference': format_reason_display(m.get('reference'), m.get('notes')),
                'performed_by': m.get('performed_by', ''),
            })
        return rows, columns

class SupplierListReport(BaseModuleReport):
    """
    Tedarikçi Listesi.
    """
    slug = 'supplier-list'
    name = gettext_lazy('Tedarikçi Listesi')
    description = gettext_lazy('Aktif tedarikçiler ve iletişim bilgileri.')
    category = 'INVENTORY'
    template_name = 'reports/supplier_list.html'

    def get_context(self) -> dict:
        qs = selectors.get_suppliers(active_only=True)
        suppliers = [
            {
                "name": s.name,
                "phone": s.phone,
                "email": s.email,
                "address": s.address,
                "contact_person": s.contact_person,
            }
            for s in qs
        ]
        return {
            "report_name": self.name,
            "suppliers": suppliers,
            "count": len(suppliers)
        }

class FEFOInventoryReport(BaseModuleReport):
    """
    FEFO Envanter Raporu.
    """
    slug = 'fefo-inventory'
    name = gettext_lazy('FEFO Envanter Raporu')
    description = gettext_lazy('SKT bazlı (First-Expired-First-Out) detaylı envanter dökümü.')
    category = 'INVENTORY'
    template_name = 'reports/fefo_report.html'

    def get_context(self) -> dict:
        filters = self.kwargs
        warehouse_id = filters.get('warehouse_id')
        category_id = filters.get('category_id')
        search = filters.get('search')
        stock_item_id = filters.get('stock_item_id')
        stock_status = filters.get('stock_status')

        allowed_wh = user_accessible_warehouse_id_strings(self.request.user)
        limit_ids = list(allowed_wh) if allowed_wh is not None else None

        qs = selectors.get_detailed_fefo_inventory_report(
            warehouse_id=warehouse_id,
            category_id=category_id,
            limit_warehouse_ids=None if warehouse_id else limit_ids,
            search=search,
            stock_item_id=stock_item_id,
            stock_status=stock_status,
        )

        total_count = qs.count()
        results = []
        for item in qs[:1000]:
            active_lots = getattr(item, 'active_lots', [])
            if not active_lots:
                continue
            
            lots_data = [
                {
                    "lot_number": lot.lot_number,
                    "expiry_date": lot.expiry_date,
                    "quantity": lot.quantity,
                    "warehouse_name": lot.warehouse.name,
                    "received_at": lot.received_at,
                }
                for lot in active_lots
            ]
            
            results.append({
                "name": item.name,
                "sku": item.sku,
                "unit": item.unit,
                "total_quantity": sum(lot.quantity for lot in active_lots),
                "lots": lots_data
            })

        report_name = self.name
        if stock_item_id and results:
            report_name = gettext("%(product)s — Lot Detay Raporu") % {"product": results[0]["name"]}

        warehouse = selectors.get_warehouse(warehouse_id) if warehouse_id else None
        category = selectors.get_category(category_id) if category_id else None

        return {
            "report_name": report_name,
            "report_description": self.description,
            "data": results,
            "filters": filters,
            "warehouse_name": warehouse.name if warehouse else (f"ID: {warehouse_id}" if warehouse_id else None),
            "category_name": category.name if category else (f"ID: {category_id}" if category_id else None),
            "count": len(results),
            "total_count": total_count,
            "limit_reached": total_count > 1000
        }

class StockItemDetailReport(BaseModuleReport):
    """
    Tek bir stok kaleminin detaylı durum raporu.
    Depo dağılımı ve hareket geçmişini içerir.
    """
    slug = 'stock-item-detail'
    name = gettext_lazy('Ürün Detay Raporu')
    description = gettext_lazy('Ürünün depo stok dağılımı ve hareket geçmişi.')
    category = 'INVENTORY'
    template_name = 'reports/stock_item_detail.html'

    def get_context(self) -> dict:
        filters = self.kwargs
        stock_item_id = filters.get('stock_item_id')
        
        if not stock_item_id:
            return {"error": gettext("Stok kalemi belirtilmedi.")}
            
        # Ürünü getir (toplam miktarı hesaplayan annotate ile)
        item = selectors.get_active_stock_items().filter(id=stock_item_id).first()
        if not item:
            return {"error": gettext("Ürün bulunamadı.")}

        # Depo seviyelerini getir (yetkili depolar bazında)
        warehouse_levels = selectors.get_stock_item_warehouse_levels(stock_item_id, user=self.request.user)
        
        # Son hareketleri getir (son 50 hareket)
        # Filtreleri de hareket sorgusuna dahil et (modalda filtreleme varsa)
        movement_type = filters.get('movement_type', 'ALL')
        start_date = filters.get('start_date')
        end_date = filters.get('end_date')
        
        movements_qs = selectors.get_stock_movements(
            stock_item_id=stock_item_id,
            movement_type=movement_type if movement_type != 'ALL' else None,
            start_date=start_date,
            end_date=end_date
        ).select_related('warehouse', 'performed_by')[:50]

        return {
            "report_name": gettext("%(name)s — Ürün Kartı") % {"name": item.name},
            "report_description": self.description,
            "item": item,
            "warehouse_levels": warehouse_levels,
            "movements": movements_qs,
            "filters": filters
        }


class SupplierRejectedItemsReport(BaseModuleReport):
    """
    Bir tedarikçiden reddedilmiş tüm ürünlerin sipariş bazlı dökümü.
    """

    slug = "supplier-rejected-items"
    name = gettext_lazy("Tedarikçi Red Ürünleri")
    description = gettext_lazy("Seçili tedarikçiden reddedilen ürünlerin sipariş ve mal kabul bazlı listesi.")
    category = "INVENTORY"
    template_name = "reports/supplier_rejected_items.html"

    def get_context(self) -> dict:
        from apps.warehouse.models import GoodsReceivingItem

        supplier_id = self.kwargs.get("supplier_id")
        if not supplier_id:
            raise ValueError(gettext("supplier_id gerekli."))

        start_date = self.kwargs.get("start_date")
        end_date = self.kwargs.get("end_date")
        search = self.kwargs.get("search")

        supplier = selectors.get_supplier(supplier_id)

        qs = (
            GoodsReceivingItem.objects.filter(
                goods_receiving__supplier_id=supplier_id,
                goods_receiving__is_active=True,
                is_active=True,
                rejected_quantity__gt=0,
            )
            .select_related("stock_item", "goods_receiving")
            .order_by("-goods_receiving__received_date", "-id")
        )

        if start_date and not isinstance(start_date, str):
            pass
        if start_date:
            qs = qs.filter(goods_receiving__received_date__gte=parse_date(start_date) if isinstance(start_date, str) else start_date)
        if end_date:
            qs = qs.filter(goods_receiving__received_date__lte=parse_date(end_date) if isinstance(end_date, str) else end_date)

        if search:
            qs = qs.filter(
                Q(stock_item__name__icontains=search)
                | Q(stock_item__sku__icontains=search)
                | Q(goods_receiving__receiving_number__icontains=search)
            )

        total_count = qs.count()
        items = [
            {
                "id": str(item.id),
                "receiving_number": item.goods_receiving.receiving_number,
                "received_date": item.goods_receiving.received_date,
                "status": item.goods_receiving.get_status_display(),
                "stock_item_name": item.stock_item.name,
                "stock_item_sku": item.stock_item.sku,
                "expected_quantity": float(item.expected_quantity),
                "received_quantity": float(item.received_quantity),
                "rejected_quantity": float(item.rejected_quantity),
                "unit": item.unit,
                "unit_price": float(item.unit_price),
                "batch_number": item.batch_number or "—",
                "notes": item.notes or "—",
            }
            for item in qs[:2000]
        ]

        return {
            "report_name": self.name,
            "supplier_name": supplier.name if supplier else (f"ID: {supplier_id}"),
            "supplier_id": supplier_id,
            "items": items,
            "count": len(items),
            "total_count": total_count,
            "limit_reached": total_count > 2000,
            "filters": {
                "start_date": self.kwargs.get("start_date"),
                "end_date": self.kwargs.get("end_date"),
                "search": self.kwargs.get("search"),
            },
        }

    def get_excel_data(self, context: dict):
        columns = [
            {"key": "receiving_number", "label": str(gettext("Mal Kabul No"))},
            {"key": "received_date", "label": str(gettext("Tarih"))},
            {"key": "status", "label": str(gettext("Durum"))},
            {"key": "stock_item_name", "label": str(gettext("Ürün"))},
            {"key": "stock_item_sku", "label": str(gettext("SKU"))},
            {"key": "expected_quantity", "label": str(gettext("Beklenen"))},
            {"key": "received_quantity", "label": str(gettext("Alınan"))},
            {"key": "rejected_quantity", "label": str(gettext("Red"))},
            {"key": "unit", "label": str(gettext("Birim"))},
        ]
        rows = []
        for item in context.get("items", []):
            date_val = item.get("received_date")
            if hasattr(date_val, "strftime"):
                date_val = date_val.strftime("%d.%m.%Y")
            rows.append({**item, "received_date": date_val})
        return rows, columns


class SupplierGoodsReceivingReport(BaseModuleReport):
    """
    Bir tedarikçiye ait tüm mal kabul kayıtlarının dökümü.
    """

    slug = "supplier-goods-receiving"
    name = gettext_lazy("Tedarikçi Mal Kabul Raporu")
    description = gettext_lazy("Seçili tedarikçiye ait mal kabul kayıtlarının listesi.")
    category = "INVENTORY"
    template_name = "reports/supplier_goods_receivings.html"

    def get_context(self) -> dict:
        from apps.warehouse.models import GoodsReceiving

        supplier_id = self.kwargs.get("supplier_id")
        if not supplier_id:
            raise ValueError(gettext("supplier_id gerekli."))

        start_date = self.kwargs.get("start_date")
        end_date = self.kwargs.get("end_date")
        search = self.kwargs.get("search")

        supplier = selectors.get_supplier(supplier_id)

        qs = GoodsReceiving.objects.filter(
            supplier_id=supplier_id,
            is_active=True,
        ).select_related("warehouse", "received_by").order_by("-received_date", "-id")

        if start_date:
            qs = qs.filter(received_date__gte=parse_date(start_date) if isinstance(start_date, str) else start_date)
        if end_date:
            qs = qs.filter(received_date__lte=parse_date(end_date) if isinstance(end_date, str) else end_date)

        if search:
            qs = qs.filter(
                Q(receiving_number__icontains=search)
                | Q(invoice_number__icontains=search)
                | Q(waybill_number__icontains=search)
            )

        total_count = qs.count()
        records = []
        for gr in qs[:2000]:
            items_count = gr.items.filter(is_active=True).count()
            rejected_count = gr.items.filter(is_active=True, rejected_quantity__gt=0).count()
            accepted_count = gr.items.filter(is_active=True, received_quantity__gt=0).count()
            records.append(
                {
                    "id": str(gr.id),
                    "receiving_number": gr.receiving_number,
                    "received_date": gr.received_date,
                    "status": gr.get_status_display(),
                    "warehouse_name": gr.warehouse.name,
                    "total_amount": float(gr.total_amount),
                    "items_count": items_count,
                    "rejected_items_count": rejected_count,
                    "accepted_items_count": accepted_count,
                    "invoice_number": gr.invoice_number or "—",
                    "waybill_number": gr.waybill_number or "—",
                    "notes": gr.notes or "—",
                }
                for gr in qs[:2000]
            )

        return {
            "report_name": self.name,
            "supplier_name": supplier.name if supplier else (f"ID: {supplier_id}"),
            "supplier_id": supplier_id,
            "records": records,
            "count": len(records),
            "total_count": total_count,
            "limit_reached": total_count > 2000,
            "filters": {
                "start_date": self.kwargs.get("start_date"),
                "end_date": self.kwargs.get("end_date"),
                "search": self.kwargs.get("search"),
            },
        }

    def get_excel_data(self, context: dict):
        columns = [
            {"key": "receiving_number", "label": str(gettext("Mal Kabul No"))},
            {"key": "received_date", "label": str(gettext("Tarih"))},
            {"key": "status", "label": str(gettext("Durum"))},
            {"key": "warehouse_name", "label": str(gettext("Depo"))},
            {"key": "total_amount", "label": str(gettext("Toplam Tutar"))},
            {"key": "items_count", "label": str(gettext("Kalem"))},
            {"key": "rejected_items_count", "label": str(gettext("Red Kalem"))},
            {"key": "invoice_number", "label": str(gettext("Fatura No"))},
        ]
        rows = []
        for rec in context.get("records", []):
            date_val = rec.get("received_date")
            if hasattr(date_val, "strftime"):
                date_val = date_val.strftime("%d.%m.%Y")
            rows.append({**rec, "received_date": date_val})
        return rows, columns


# Raporları kaydet
report_registry.register(StockItemListReport)
report_registry.register(StockMovementListReport)
report_registry.register(SupplierListReport)
report_registry.register(FEFOInventoryReport)
report_registry.register(StockItemDetailReport)
report_registry.register(SupplierRejectedItemsReport)
report_registry.register(SupplierGoodsReceivingReport)
