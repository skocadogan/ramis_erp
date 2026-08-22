import logging
import uuid
from decimal import Decimal
from datetime import timedelta
from collections import defaultdict
from django.conf import settings
from django.db import transaction
from django.utils.translation import gettext as _
from django.utils.timezone import now
from core.decimal_constants import ZERO_MONEY
from ..models import Order, OrderItem, OrderItemModifier, OrderStatus
from ..order_scope import OPEN_ORDER_STATUSES
from .sale_helper import OrderValidationError, create_sale_for_order
from .combined_order_items import build_combined_component_order_items

logger = logging.getLogger(__name__)


def _lock_order_row(order):
    """Sipariş satırını nowait kilitleyerek aynı Python nesnesini günceller."""
    Order.objects.select_for_update(nowait=True).get(pk=order.pk)
    order.refresh_from_db()
    return order


class OrderCoreService:
    @staticmethod
    @transaction.atomic
    def create_order(branch_id, table_id, order_type, user, notes, items_data, stock_tracking_mode="PRODUCT", *, customer_id=None, skip_station_stock_check=False):
        """Yeni sipariş oluşturur."""
        from apps.menu.models import Product
        from apps.branches.services import TableService
        from apps.production_planning.services.portion_service import (
            PortionAvailabilityError,
            PortionService,
        )
        from ..order_validation_service import validate_create_order_invariants

        if not skip_station_stock_check:
            validate_create_order_invariants(str(branch_id), items_data, stock_tracking_mode)

        from apps.menu.services import MenuService, MenuValidationError
        for item_data in items_data:
            try:
                item_data['modifier_ids'] = MenuService.resolve_order_item_modifiers(
                    item_data['product_id'],
                    item_data.get('modifier_ids') or [],
                )
            except MenuValidationError as exc:
                raise OrderValidationError(str(exc)) from exc

        ot = order_type or 'TABLE'
        if ot == 'TABLE' and (not table_id or str(table_id).strip() == ''):
            raise OrderValidationError(_("Masa siparişi için masa seçilmelidir."))

        today = now().date()

        takeaway_zone_id = None
        if ot == 'TAKEAWAY':
            from apps.branches.models import Zone, Table as BranchTable
            from apps.branches.virtual_table_ids import resolve_takeaway_table_id_for_create
 
            try:
                table_id, virtual_zone_id = resolve_takeaway_table_id_for_create(
                    table_id, branch_id=branch_id, order_type=ot
                )
            except ValueError as exc:
                raise OrderValidationError(str(exc)) from exc
            if virtual_zone_id:
                takeaway_zone_id = virtual_zone_id

            if table_id:
                t_row = (
                    BranchTable.objects.select_related('zone')
                    .filter(pk=table_id, zone__branch_id=branch_id)
                    .first()
                )
                if t_row and t_row.zone_id:
                    takeaway_zone_id = t_row.zone_id
            if takeaway_zone_id is None:
                tz = (
                    Zone.objects.filter(branch_id=branch_id, is_active=True, is_takeaway=True)
                    .order_by('name')
                    .first()
                )
                if not tz:
                    raise OrderValidationError(_("Bu şube için paket (takeaway) bölgesi tanımlı değil."))
                takeaway_zone_id = tz.id
        
        # Günlük sıfırlanan sipariş numarası (cache + DB kalıcılık)
        from ..order_number import allocate_branch_order_number

        order_number = allocate_branch_order_number(branch_id, today)

        order = Order.objects.create(
            branch_id=branch_id,
            table_id=table_id,
            takeaway_zone_id=takeaway_zone_id,
            order_type=order_type or 'TABLE',
            user=user if user and user.is_authenticated else None,
            order_number=order_number,
            notes=notes or '',
            status=OrderStatus.PENDING,
            stock_tracking_mode=stock_tracking_mode,
            customer_id=customer_id,
        )

        if table_id:
            from apps.branches.virtual_table_ids import is_virtual_table_id

            if not is_virtual_table_id(table_id):
                TableService.open_table(table_id)

        product_ids = [item['product_id'] for item in items_data]
        products_map = {
            str(p.id): p
            for p in Product.objects.select_related('category__station', 'recipe')
            .prefetch_related(
                'combined_items__product__category__station',
                'combined_items__product__recipe',
                'combined_items__product_unit',
            )
            .filter(id__in=product_ids)
        }

        # Smart Firing Calculation (S basitleştirildi, detaylar smart_firing.py'de)
        current_time = now()
        item_lead_times = {}
        max_lead_time = 0
        station_buffers = {}
        stations_in_cart = set()
        stations_by_id = {}
        
        v2 = getattr(settings, 'ENABLE_SMART_FIRING_V2', False)
        if v2:
            from apps.branches.models import KitchenStation
            from ..smart_firing import (
                effective_combined_lead_minutes,
                effective_lead_minutes,
                product_has_actionable_recipe_timing,
            )
            
            sid_collect = set()
            for item_data in items_data:
                p = products_map.get(str(item_data['product_id']))
                if p:
                    sid = getattr(getattr(p.category, 'station', None), 'id', None)
                    if sid: sid_collect.add(sid)
                    if p.is_combined:
                        for c in p.combined_items.all():
                            cs = getattr(getattr(c.product.category, 'station', None), 'id', None)
                            if cs: sid_collect.add(cs)
            
            stations_by_id = {
                s.id: s for s in KitchenStation.objects.filter(id__in=sid_collect, branch_id=branch_id)
            }

            for item_data in items_data:
                p = products_map.get(str(item_data['product_id']))
                lead_time = 0
                if p:
                    station_id = getattr(getattr(p.category, 'station', None), 'id', None)
                    if station_id:
                        stations_in_cart.add(station_id)
                    qty = int(item_data.get('quantity', 1))
                    if p.is_combined and not getattr(p, 'recipe', None):
                        eff, combo_bufs = effective_combined_lead_minutes(
                            branch_id,
                            p,
                            quantity=qty,
                            stations_by_id=stations_by_id,
                        )
                        lead_time = eff
                        for sid, buf in combo_bufs.items():
                            station_buffers[sid] = max(station_buffers.get(sid, 0), buf)
                            stations_in_cart.add(sid)
                    else:
                        eff, buf = effective_lead_minutes(
                            branch_id,
                            p,
                            station_id,
                            quantity=qty,
                            station_row=stations_by_id.get(station_id),
                        )
                        if station_id:
                            station_buffers[station_id] = max(
                                station_buffers.get(station_id, 0), buf
                            )
                        if product_has_actionable_recipe_timing(p):
                            lead_time = eff
                item_lead_times[str(item_data['product_id'])] = lead_time
                if lead_time > 0:
                    max_lead_time = max(max_lead_time, lead_time)
            
            target_completion_time = current_time + timedelta(minutes=max_lead_time)
        else:
            from ..smart_firing import (
                resolve_combined_static_lead_minutes,
                resolve_recipe_lead_minutes as _resolve_lead,
            )
            for item_data in items_data:
                p = products_map.get(str(item_data['product_id']))
                qty = int(item_data.get('quantity', 1))
                if p and p.is_combined and not getattr(p, 'recipe', None):
                    lead_time = resolve_combined_static_lead_minutes(p, quantity=qty)
                elif p:
                    lead_time = _resolve_lead(p, quantity=qty)
                else:
                    lead_time = 0
                item_lead_times[str(item_data['product_id'])] = lead_time
                if lead_time > 0:
                    max_lead_time = max(max_lead_time, lead_time)
            target_completion_time = current_time + timedelta(minutes=max_lead_time)

        # Items & Modifiers creation logic
        from apps.menu.models import Modifier, ProductUnit
        all_modifier_ids = [mid for item in items_data for mid in item.get('modifier_ids', [])]
        modifiers_map = {
            m.id: m
            for m in Modifier.objects.filter(
                id__in=all_modifier_ids,
                is_active=True,
                group__is_active=True,
            )
        }
        product_units_map = defaultdict(dict)
        for unit in ProductUnit.objects.filter(product_id__in=product_ids):
            product_units_map[unit.product_id][unit.name] = unit

        order_items_to_create = []
        order_item_modifiers_to_create = []

        for item_data in items_data:
            product = products_map.get(str(item_data['product_id']))
            item_modifiers = [modifiers_map[mid] for mid in item_data.get('modifier_ids', []) if mid in modifiers_map]
            modifier_sum = sum((m.price_adjustment for m in item_modifiers), ZERO_MONEY)
            item_total = (item_data['unit_price'] + modifier_sum) * item_data['quantity']
            
            lead_time = item_lead_times.get(str(item_data['product_id']), 0)
            scheduled_start = (
                target_completion_time - timedelta(minutes=lead_time)
                if lead_time > 0 else None
            )
            
            p_unit = product_units_map[product.id].get(item_data.get('unit_name')) if product else None
            mult = Decimal(str(p_unit.multiplier)) if p_unit else Decimal('1.00')

            oi = OrderItem(
                id=uuid.uuid4(), order=order, product_id=item_data['product_id'],
                variant_id=item_data.get('variant_id'), unit_name=item_data.get('unit_name'),
                portion_multiplier=mult, quantity=item_data['quantity'],
                unit_price=item_data['unit_price'], total_price=item_total,
                status=OrderStatus.PENDING, scheduled_start_time=scheduled_start,
                notes=item_data.get('notes', ''),
                station_id=getattr(getattr(product.category, 'station', None), 'id', None) if product else None
            )
            order_items_to_create.append(oi)
            for mod in item_modifiers:
                order_item_modifiers_to_create.append(OrderItemModifier(order_item=oi, modifier=mod, price=mod.price_adjustment))

        OrderItem.objects.bulk_create(order_items_to_create)
        OrderItemModifier.objects.bulk_create(order_item_modifiers_to_create)

        component_items_to_create = []
        for parent_oi in order_items_to_create:
            product = products_map.get(str(parent_oi.product_id))
            if not product or not product.is_combined:
                continue
            # Parent'ın kendi reçetesi varsa, child OrderItem EKLENMEZ.
            # Parent'ın reçetesi zaten tüm malzemeleri kapsıyor; bu durumda
            # child'ları ayrı satır olarak eklemek stok/maliyet çift sayımına
            # yol açar (kombine ürün reçetesi zaten tüm malzemeleri içerir).
            #
            # Parent'ın reçetesi YOKSA (örn. paket menüler — sadece farklı
            # istasyonlara yönlendirme için kullanılan kombinasyonlar), child
            # OrderItem'lar KDS routing için ayrı satır olarak eklenir.
            if getattr(product, 'recipe', None):
                continue
            component_items_to_create.extend(
                build_combined_component_order_items(
                    parent_oi,
                    product,
                    target_completion_time=target_completion_time,
                    branch_id=branch_id,
                    stations_by_id=stations_by_id if v2 else None,
                )
            )
        if component_items_to_create:
            OrderItem.objects.bulk_create(component_items_to_create)

        order.total_amount = sum((i.total_price for i in order_items_to_create), ZERO_MONEY)
        order.save(update_fields=['total_amount'])

        if v2 and stations_in_cart:
            from ..smart_firing import kitchen_queue_notice_for_cart
            notice = kitchen_queue_notice_for_cart(
                branch_id,
                stations_in_cart,
                station_buffers=station_buffers,
            )
            if notice:
                order._kitchen_queue_notice = notice

        if stock_tracking_mode == "PRODUCT":
            products_with_qty = [
                (item.product_id, item.quantity * item.portion_multiplier)
                for item in order_items_to_create
            ]
            try:
                PortionService.bulk_deduct_portions(
                    branch_id=order.branch_id,
                    products_with_qty=products_with_qty,
                )
            except PortionAvailabilityError as exc:
                # Stok/porsiyon yetersiz — iş kuralı ihlali. 500 yerine
                # 400 ile kullanıcıya anlamlı bir mesaj dön.
                logger.info(
                    "create_order portion_unavailable order=%s reason=%s",
                    getattr(order, "id", None), exc,
                )
                raise OrderValidationError(str(exc)) from exc
        elif stock_tracking_mode == "INGREDIENT":
            from apps.inventory.services import InventoryService
            from apps.inventory.services.cart_recipe_requirements import (
                build_order_recipe_requirements,
            )

            reservations = InventoryService.reserve_for_order(order)
            if getattr(settings, "INGREDIENT_STOCK_STRICT_RESERVE", False):
                expected = build_order_recipe_requirements(order)
                if expected and not reservations:
                    raise OrderValidationError(
                        _(
                            "Hammadde rezervasyonu oluşturulamadı. Reçete, mutfak/istasyon "
                            "deposu ve şube depo bağlantılarını kontrol edin."
                        )
                    )
        from apps.branches.services import clear_tables_cache
        bid = str(order.branch_id) if getattr(order, 'branch_id', None) else None
        transaction.on_commit(lambda b=bid: clear_tables_cache(b))
        return order

    @staticmethod
    @transaction.atomic
    def complete_order(order, payment_method, user, payments=None, shift=None, pos_terminal=None, allow_negative_stock=False):
        """Siparişi tamamlar."""
        from apps.branches.services import TableService
        order = _lock_order_row(order)
        if order.status in [OrderStatus.COMPLETED, OrderStatus.CANCELLED]:
            raise OrderValidationError(_("Sipariş zaten tamamlanmış veya iptal edilmiş."))
        
        order.status = OrderStatus.COMPLETED
        order.save(update_fields=['status', 'updated_at'])
        order.items.exclude(status=OrderStatus.CANCELLED).update(status=OrderStatus.COMPLETED)

        create_sale_for_order(order, payment_method, user, payments=payments, shift=shift, pos_terminal=pos_terminal)
        
        if order.stock_tracking_mode == "INGREDIENT":
            from apps.inventory.services import InventoryService
            InventoryService.commit_reservations(order, performed_by=user, allow_negative=allow_negative_stock)

        if order.table_id:
            if not Order.objects.filter(
                table_id=order.table_id,
                status__in=OPEN_ORDER_STATUSES,
            ).exists():
                from apps.branches.models import Table
                from apps.branches.table_cleaning import table_zone_is_takeaway

                table_row = Table.objects.select_related('zone').filter(pk=order.table_id).first()
                if table_row and table_zone_is_takeaway(table_row):
                    TableService.close_table(order.table_id)
                else:
                    TableService.start_cleaning(order.table_id)
        from apps.branches.services import clear_tables_cache
        bid = str(order.branch_id) if getattr(order, 'branch_id', None) else None
        transaction.on_commit(lambda b=bid: clear_tables_cache(b))
        return order

    @staticmethod
    @transaction.atomic
    def cancel_order(order, reason_code=None, reason_text=None):
        """Siparişi iptal eder."""
        from apps.branches.services import TableService
        from apps.audit.services import record_audit
        order = _lock_order_row(order)
        if order.status in [OrderStatus.COMPLETED, OrderStatus.CANCELLED]:
            raise OrderValidationError(_("Sipariş zaten tamamlanmış veya iptal edilmiş."))

        from ..cancellation_reasons import normalize_cancellation_reason_inputs
        reason_code, reason_text = normalize_cancellation_reason_inputs(reason_code, reason_text)

        before_state = {"status": order.status}
        order.status = OrderStatus.CANCELLED
        order.cancel_reason_code, order.cancel_reason_text = reason_code, reason_text
        order.save(update_fields=['status', 'cancel_reason_code', 'cancel_reason_text', 'updated_at'])
        order.items.update(status=OrderStatus.CANCELLED, cancel_reason_code=reason_code, cancel_reason_text=reason_text)

        audit_meta = {
            "reason_code": reason_code,
            "reason_text": reason_text,
            "order_type": order.order_type,
        }
        if order.takeaway_zone_id:
            audit_meta["takeaway_zone_id"] = str(order.takeaway_zone_id)
        record_audit(
            action='order.cancelled',
            target_instance=order,
            before_json=before_state,
            after_json={"status": order.status},
            metadata=audit_meta,
        )

        if order.stock_tracking_mode == "PRODUCT":
            from apps.production_planning.services.portion_service import PortionService
            products_with_qty = [(item.product_id, item.quantity * item.portion_multiplier) for item in order.items.filter(parent_item__isnull=True)]
            PortionService.bulk_reverse_portions(branch_id=order.branch_id, products_with_qty=products_with_qty)
        elif order.stock_tracking_mode == "INGREDIENT":
            from apps.inventory.services import InventoryService
            InventoryService.release_reservations(order)

        if order.table_id and not Order.objects.filter(table_id=order.table_id, status__in=OPEN_ORDER_STATUSES).exists():
            TableService.close_table(order.table_id)
        from apps.branches.services import clear_tables_cache
        bid = str(order.branch_id) if getattr(order, 'branch_id', None) else None
        transaction.on_commit(lambda b=bid: clear_tables_cache(b))
        if bid:
            from apps.orders.ws_broadcast import broadcast_kitchen_order_cancelled

            transaction.on_commit(
                lambda b=bid, o=order: broadcast_kitchen_order_cancelled(b, o)
            )
        return order

    @staticmethod
    @transaction.atomic
    def force_close(order, user):
        """Siparişi zorla kapatır (satış oluşturmadan, admin müdahalesi)."""
        from apps.branches.services import TableService
        from apps.audit.services import record_audit

        order = _lock_order_row(order)
        if order.status in [OrderStatus.COMPLETED, OrderStatus.CANCELLED]:
            raise OrderValidationError(_("Sipariş zaten tamamlanmış veya iptal edilmiş."))

        before_state = {"status": order.status}

        # Kapatma notu
        from django.utils import timezone
        actor_name = user.get_full_name() or str(user) if user and user.is_authenticated else _("Sistem")
        close_note = _("Zorla kapatıldı ({actor} — {ts})").format(
            actor=actor_name,
            ts=timezone.localtime().strftime("%d.%m.%Y %H:%M"),
        )
        if order.notes:
            order.notes = f"{order.notes}\n{close_note}"
        else:
            order.notes = close_note

        order.status = OrderStatus.COMPLETED
        order.save(update_fields=['status', 'notes', 'updated_at'])
        order.items.exclude(status=OrderStatus.CANCELLED).update(status=OrderStatus.COMPLETED)

        # Stok rezervasyonlarını serbest bırak
        if order.stock_tracking_mode == "PRODUCT":
            from apps.production_planning.services.portion_service import PortionService
            products_with_qty = [
                (item.product_id, item.quantity * item.portion_multiplier)
                for item in order.items.filter(parent_item__isnull=True)
                if item.status not in [OrderStatus.CANCELLED]
            ]
            if products_with_qty:
                PortionService.bulk_reverse_portions(
                    branch_id=order.branch_id,
                    products_with_qty=products_with_qty,
                )
        elif order.stock_tracking_mode == "INGREDIENT":
            from apps.inventory.services import InventoryService
            InventoryService.release_reservations(order)

        audit_meta = {
            "action": "force_close",
            "order_type": order.order_type,
            "performed_by": str(user.id) if user and user.is_authenticated else None,
        }
        if order.takeaway_zone_id:
            audit_meta["takeaway_zone_id"] = str(order.takeaway_zone_id)
        record_audit(
            action='order.force_closed',
            target_instance=order,
            before_json=before_state,
            after_json={"status": order.status},
            metadata=audit_meta,
        )

        if order.table_id and not Order.objects.filter(
            table_id=order.table_id,
            status__in=[OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.READY],
        ).exists():
            TableService.close_table(order.table_id)

        from apps.branches.services import clear_tables_cache
        bid = str(order.branch_id) if getattr(order, 'branch_id', None) else None
        transaction.on_commit(lambda b=bid: clear_tables_cache(b))
        return order
