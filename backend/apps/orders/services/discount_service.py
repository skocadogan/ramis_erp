from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from django.utils.translation import gettext as _
from core.decimal_constants import ZERO_MONEY
from ..models import OrderItem, OrderStatus
from .order_core_service import OrderValidationError
from apps.audit.services import record_audit

class DiscountService:
    @staticmethod
    @transaction.atomic
    def apply_discount(order, discount_type, discount_amount, applied_by, order_item_id=None):
        """Siparişe veya kaleme indirim uygular."""
        if order.status in [OrderStatus.COMPLETED, OrderStatus.CANCELLED]:
            raise OrderValidationError(_("Tamamlanmış veya iptal edilmiş siparişe indirim uygulanamaz."))

        if discount_amount <= 0:
            raise OrderValidationError(_("İndirim tutarı sıfırdan büyük olmalıdır."))

        discount_decimal = Decimal(str(discount_amount))

        if discount_type == 'ORDER':
            order.total_amount = max(ZERO_MONEY, order.total_amount - discount_decimal)
            order.discount_amount, order.discount_type, order.discount_by = discount_decimal, 'ORDER', applied_by
            order.save(update_fields=['total_amount', 'discount_amount', 'discount_type', 'discount_by', 'updated_at'])
            record_audit(action='order.discount_applied', target_instance=order, after_json={"discount_amount": str(discount_decimal), "discount_type": "ORDER"})

        elif discount_type == 'ITEM':
            if not order_item_id:
                raise OrderValidationError(_("ITEM tipinde order_item_id zorunludur."))
            try:
                item = order.items.get(id=order_item_id)
            except OrderItem.DoesNotExist:
                raise OrderValidationError(_("Ürün bu siparişe ait değil."))

            item.total_price = max(ZERO_MONEY, item.total_price - discount_decimal)
            item.save(update_fields=['total_price'])
            order.total_amount = order.items.exclude(status=OrderStatus.CANCELLED).aggregate(t=Sum('total_price'))['t'] or ZERO_MONEY
            order.discount_amount = (order.discount_amount or ZERO_MONEY) + discount_decimal
            order.discount_type, order.discount_by = 'ITEM', applied_by
            order.save(update_fields=['total_amount', 'discount_amount', 'discount_type', 'discount_by', 'updated_at'])
            record_audit(action='order_item.discount_applied', target_instance=item, after_json={"discount_amount": str(discount_decimal), "discount_type": "ITEM"})
        return order

    @staticmethod
    @transaction.atomic
    def remove_discount(order):
        """Tüm indirimleri kaldırır."""
        if order.status in [OrderStatus.COMPLETED, OrderStatus.CANCELLED]:
            raise OrderValidationError(_("Sipariş tamamlanmış veya iptal edilmiş."))

        items = list(order.items.prefetch_related('modifiers').all())
        for item in items:
            modifier_sum = sum((m.price for m in item.modifiers.all()), ZERO_MONEY)
            item.total_price = (item.unit_price * item.quantity) + modifier_sum
        OrderItem.objects.bulk_update(items, ['total_price'])

        order.total_amount = order.items.exclude(status=OrderStatus.CANCELLED).aggregate(t=Sum('total_price'))['t'] or ZERO_MONEY
        order.discount_amount, order.discount_type, order.discount_by = ZERO_MONEY, None, None
        order.save(update_fields=['total_amount', 'discount_amount', 'discount_type', 'discount_by', 'updated_at'])
        record_audit(action='order.discount_removed', target_instance=order)
        return order
