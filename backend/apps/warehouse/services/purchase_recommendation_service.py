"""Talep bazlı satın alma öneri motoru."""

from __future__ import annotations

from decimal import Decimal, ROUND_UP

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.audit.services import record_audit
from apps.inventory.models import StockItem
from apps.production_planning.models import ProductionDaySettings
from apps.warehouse.models import PurchaseOrderStatus, Warehouse
from core.branch_scope import user_accessible_warehouse_id_strings
from core.decimal_constants import ZERO_QTY

from .purchase_order_service import PurchaseOrderService
from ..purchase_recommendation_selectors import (
    consumption_window_start,
    get_consumption_totals,
    get_in_transit_po_totals,
    get_tracked_stock_items_qs,
)


def _quantize_qty(value: Decimal) -> Decimal:
    if value <= ZERO_QTY:
        return ZERO_QTY
    return value.quantize(Decimal('0.01'), rounding=ROUND_UP)


def _resolve_safety_factor(branch_id: str | None) -> Decimal:
    if not branch_id:
        return Decimal('1.00')
    try:
        settings = ProductionDaySettings.objects.get(branch_id=branch_id)
        return settings.default_safety_factor
    except ProductionDaySettings.DoesNotExist:
        return Decimal('1.00')


DEFAULT_HORIZON_DAYS = 7
ALLOWED_HORIZON_DAYS = (3, 7, 14)


def _normalize_horizon_days(horizon_days: int | None) -> int:
    try:
        value = int(horizon_days) if horizon_days is not None else DEFAULT_HORIZON_DAYS
    except (TypeError, ValueError):
        value = DEFAULT_HORIZON_DAYS
    return value if value in ALLOWED_HORIZON_DAYS else DEFAULT_HORIZON_DAYS


def _compute_urgency(
    *,
    daily_avg: Decimal,
    current_qty: Decimal,
    horizon_days: int,
    is_low_stock: bool,
) -> str:
    if daily_avg > ZERO_QTY:
        days_until_stockout = current_qty / daily_avg
        if days_until_stockout < Decimal(str(horizon_days)):
            return 'critical'
    if is_low_stock:
        return 'warning'
    return 'ok'


def _assert_warehouse_access(user, warehouse_id: str) -> Warehouse:
    try:
        warehouse = Warehouse.objects.prefetch_related('branches').get(
            id=warehouse_id,
            is_active=True,
        )
    except (Warehouse.DoesNotExist, ValueError, TypeError):
        raise ValueError(_('Geçersiz depo.')) from None

    allowed = user_accessible_warehouse_id_strings(user)
    if allowed is not None and str(warehouse_id) not in allowed:
        raise ValueError(_('Bu depo için satın alma önerisi görüntüleme yetkiniz yok.'))
    return warehouse


class PurchaseRecommendationService:
    """Talep trendi + stok durumuna göre satın alma önerileri."""

    @staticmethod
    def compute_recommendations(
        *,
        warehouse_id: str,
        user,
        weeks: int = 4,
        branch_id: str | None = None,
        category_id: str | None = None,
        search: str | None = None,
        only_positive: bool = True,
        horizon_days: int | None = None,
    ) -> dict:
        warehouse = _assert_warehouse_access(user, warehouse_id)
        weeks = 4 if int(weeks) != 8 else 8
        resolved_horizon_days = _normalize_horizon_days(horizon_days)
        since = consumption_window_start(weeks)

        qs = get_tracked_stock_items_qs(
            warehouse_id,
            category_id=category_id,
            search=search,
            only_candidates=only_positive,
            consumption_since=since,
        )

        resolved_branch_id = branch_id
        if not resolved_branch_id:
            first_branch = warehouse.branches.filter(is_active=True).order_by('name').first()
            resolved_branch_id = str(first_branch.id) if first_branch else None
        safety_factor = _resolve_safety_factor(resolved_branch_id)

        return {
            'warehouse_id': str(warehouse_id),
            'weeks': weeks,
            'horizon_days': resolved_horizon_days,
            'safety_factor': str(safety_factor),
            'since': since.date().isoformat(),
            'queryset': qs,
        }

    @staticmethod
    def serialize_page(
        *,
        items_qs,
        warehouse_id: str,
        weeks: int,
        safety_factor: Decimal,
        since,
        horizon_days: int = DEFAULT_HORIZON_DAYS,
    ) -> list[dict]:
        page_items = list(items_qs)
        if not page_items:
            return []

        stock_item_ids = [item.id for item in page_items]
        consumption_map = get_consumption_totals(warehouse_id, since, stock_item_ids)
        in_transit_map = get_in_transit_po_totals(warehouse_id, stock_item_ids)

        suppliers_qs = StockItem.objects.filter(
            id__in=stock_item_ids,
        ).prefetch_related('suppliers')
        suppliers_by_item = {i.id: list(i.suppliers.all()) for i in suppliers_qs}

        weeks_dec = Decimal(str(weeks))
        horizon_dec = Decimal(str(horizon_days))
        rows: list[dict] = []

        for item in page_items:
            item_id = str(item.id)
            total_consumed = consumption_map.get(item_id, ZERO_QTY)
            weekly_avg = total_consumed / weeks_dec if weeks_dec else ZERO_QTY
            daily_avg = weekly_avg / Decimal('7') if weekly_avg > ZERO_QTY else ZERO_QTY
            current_qty = getattr(item, 'current_quantity', ZERO_QTY) or ZERO_QTY
            in_transit = in_transit_map.get(item_id, ZERO_QTY)
            effective_min = getattr(item, 'effective_minimum', item.minimum_quantity) or ZERO_QTY
            available = current_qty + in_transit
            is_low_stock = bool(getattr(item, 'is_low_stock', False))

            target_stock = daily_avg * horizon_dec * safety_factor
            demand_based = _quantize_qty(target_stock - available)
            min_gap = ZERO_QTY
            if effective_min > ZERO_QTY:
                min_gap = _quantize_qty(effective_min - available)
            recommended = max(demand_based, min_gap)

            estimated_days_until_stockout = None
            if daily_avg > ZERO_QTY:
                estimated_days_until_stockout = _quantize_qty(current_qty / daily_avg)

            suppliers = suppliers_by_item.get(item.id, [])
            rows.append({
                'stock_item_id': item_id,
                'stock_item_name': item.name,
                'stock_item_sku': item.sku,
                'unit': item.unit,
                'current_quantity': str(current_qty),
                'minimum_quantity': str(effective_min),
                'in_transit_quantity': str(in_transit),
                'weekly_average_consumption': str(_quantize_qty(weekly_avg)),
                'daily_average_consumption': str(_quantize_qty(daily_avg)),
                'total_consumption': str(total_consumed),
                'recommended_quantity': str(recommended),
                'horizon_days': horizon_days,
                'estimated_days_until_stockout': (
                    str(estimated_days_until_stockout)
                    if estimated_days_until_stockout is not None
                    else None
                ),
                'urgency': _compute_urgency(
                    daily_avg=daily_avg,
                    current_qty=current_qty,
                    horizon_days=horizon_days,
                    is_low_stock=is_low_stock,
                ),
                'is_low_stock': is_low_stock,
                'suppliers': [{'id': str(s.id), 'name': s.name} for s in suppliers],
                'has_supplier_conflict': len(suppliers) > 1,
            })

        return rows

    @staticmethod
    @transaction.atomic
    def commit_recommendations(
        *,
        warehouse_id: str,
        items: list[dict],
        user,
        preferred_suppliers: dict | None = None,
    ) -> dict:
        warehouse = _assert_warehouse_access(user, warehouse_id)
        if not items:
            raise ValueError(_('En az bir kalem seçilmelidir.'))

        stock_ids = [row['stock_item_id'] for row in items]
        stock_items = {
            str(i.id): i
            for i in StockItem.objects.filter(id__in=stock_ids, is_active=True).prefetch_related('suppliers')
        }
        if len(stock_items) != len(set(stock_ids)):
            raise ValueError(_('Geçersiz veya pasif stok kalemi seçildi.'))

        by_supplier: dict[str, list[dict]] = {}
        skipped_items: list[dict] = []
        audit_items: list[dict] = []

        for row in items:
            item_id = str(row['stock_item_id'])
            stock_item = stock_items.get(item_id)
            if not stock_item:
                continue

            qty = row.get('quantity', row.get('recommended_quantity'))
            try:
                qty_dec = Decimal(str(qty))
            except Exception as exc:
                raise ValueError(_('Geçersiz miktar.')) from exc
            qty_dec = _quantize_qty(qty_dec)
            if qty_dec <= ZERO_QTY:
                continue

            suppliers = list(stock_item.suppliers.all())
            if not suppliers:
                skipped_items.append({
                    'stock_item_id': item_id,
                    'stock_item_name': stock_item.name,
                    'reason': 'no_supplier',
                })
                continue

            preferred_id = (preferred_suppliers or {}).get(item_id)
            if preferred_id:
                supplier = next((s for s in suppliers if str(s.id) == preferred_id), suppliers[0])
            else:
                supplier = suppliers[0]

            by_supplier.setdefault(str(supplier.id), []).append({
                'stock_item_id': stock_item.id,
                'quantity': qty_dec,
                'unit': stock_item.unit,
                'unit_price': stock_item.last_purchase_price or ZERO_QTY,
                'notes': row.get('notes') or _('Talep bazlı satın alma önerisi'),
            })
            audit_items.append({
                'stock_item_id': item_id,
                'stock_item_name': stock_item.name,
                'quantity': str(qty_dec),
                'supplier_id': str(supplier.id),
                'recommended_quantity': str(row.get('recommended_quantity', qty_dec)),
            })

        if not by_supplier:
            raise ValueError(_('Tedarikçisi tanımlı seçili kalem bulunamadı.'))

        created_orders = []
        for supplier_id, items_data in by_supplier.items():
            order = PurchaseOrderService.create_order(
                {
                    'supplier_id': supplier_id,
                    'warehouse_id': warehouse_id,
                    'status': PurchaseOrderStatus.DRAFT,
                    'order_date': timezone.now().date(),
                    'notes': _('Talep bazlı satın alma önerisinden oluşturuldu'),
                },
                items_data,
                user=user,
            )
            created_orders.append(order)

        branch = warehouse.branches.filter(is_active=True).order_by('name').first()
        record_audit(
            action='warehouse.purchase_recommendation.committed',
            target_type='warehouse.purchase_recommendation',
            target_id=str(warehouse_id),
            branch=branch,
            after_json={
                'warehouse_id': str(warehouse_id),
                'created_po_ids': [str(o.id) for o in created_orders],
                'created_po_numbers': [o.order_number for o in created_orders],
                'items': audit_items,
            },
            metadata={
                'skipped_items': skipped_items,
                'preferred_suppliers': preferred_suppliers or {},
            },
        )

        return {
            'orders': created_orders,
            'created_count': len(created_orders),
            'skipped_items': skipped_items,
        }
