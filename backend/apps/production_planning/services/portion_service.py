from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as _
from apps.production_planning.models import ProductDayAvailability, AvailabilityMode
from apps.menu.ws_broadcast import broadcast_menu_catalog_refresh
from apps.production_planning.ws_broadcast import broadcast_production_status_update


class PortionAvailabilityError(Exception):
    """Ürün o gün satışa kapalı veya porsiyon kotası yetersiz."""


class PortionService:
    """
    Ürün porsiyon kotalarının (86/Limited) anlık takibi ve düşümü.
    Sipariş verildiğinde, iptal edildiğinde veya fire işlendiğinde çağrılır.
    """

    @staticmethod
    @transaction.atomic
    def deduct_portions(branch_id, product_id, quantity, effective_date=None):
        """Porsiyon sayısını düşürür."""
        if not effective_date:
            effective_date = timezone.localdate()
            
        avail = ProductDayAvailability.objects.filter(
            branch_id=branch_id,
            product_id=product_id,
            effective_date=effective_date,
            is_active=True,
        ).select_for_update(nowait=True).first()
        
        if not avail:
            return

        qty_decimal = Decimal(str(quantity))
        if qty_decimal <= 0:
            return

        if avail.mode == AvailabilityMode.SOLD_OUT:
            raise PortionAvailabilityError(
                _("Ürün o gün için 'Ürün kalmadı' olarak işaretli.")
            )

        # Sadece LIMITED modundaysa takip ediyoruz. AVAILABLE ise sınırsızdır.
        if avail.mode == AvailabilityMode.LIMITED and avail.remaining_portions is not None:
            if avail.remaining_portions < qty_decimal:
                raise PortionAvailabilityError(
                    _("Yeterli porsiyon yok. Kalan: %(left)s.")
                    % {"left": avail.remaining_portions}
                )
            avail.remaining_portions -= qty_decimal

            if avail.remaining_portions <= 0:
                avail.remaining_portions = Decimal("0")
                avail.mode = AvailabilityMode.SOLD_OUT

            avail.save(update_fields=['remaining_portions', 'mode', 'updated_at'])
            
            # Yayınları transaction commit olduktan sonraya ertele (yarış durumunu önlemek için)
            transaction.on_commit(lambda: broadcast_menu_catalog_refresh(
                reason="portion_updated", 
                product_id=str(product_id),
                branch_id=str(branch_id)
            ))
            transaction.on_commit(lambda: broadcast_production_status_update(
                branch_id=str(branch_id),
                message={"type": "availability_update", "product_id": str(product_id)}
            ))

    @staticmethod
    @transaction.atomic
    def bulk_deduct_portions(branch_id, products_with_qty, effective_date=None):
        """Birden fazla ürünün porsiyonunu toplu düşürür. products_with_qty: list of (product_id, qty)"""
        if not effective_date:
            effective_date = timezone.localdate()
        
        product_ids = [p[0] for p in products_with_qty]
        avails = ProductDayAvailability.objects.filter(
            branch_id=branch_id,
            product_id__in=product_ids,
            effective_date=effective_date,
            is_active=True,
        ).select_for_update(nowait=True)

        avail_map = {str(a.product_id): a for a in avails}
        
        for pid, qty in products_with_qty:
            avail = avail_map.get(str(pid))
            if not avail: continue
            
            qty_decimal = Decimal(str(qty))
            if qty_decimal <= 0: continue
            
            if avail.mode == AvailabilityMode.SOLD_OUT:
                raise PortionAvailabilityError(
                    _("Ürün (%(name)s) kalmadı.") % {"name": avail.product.name}
                )
            
            if avail.mode == AvailabilityMode.LIMITED and avail.remaining_portions is not None:
                if avail.remaining_portions < qty_decimal:
                    raise PortionAvailabilityError(
                        _("Yeterli porsiyon yok: %(name)s.")
                        % {"name": avail.product.name}
                    )
                avail.remaining_portions -= qty_decimal
                if avail.remaining_portions <= 0:
                    avail.remaining_portions = Decimal("0")
                    avail.mode = AvailabilityMode.SOLD_OUT
                avail.save(update_fields=['remaining_portions', 'mode', 'updated_at'])
                
                # WS yayınlarını commit sonrası için planla
                transaction.on_commit(lambda p=pid: broadcast_menu_catalog_refresh(reason="portion_updated", product_id=str(p), branch_id=str(branch_id)))

    @staticmethod
    @transaction.atomic
    def bulk_reverse_portions(branch_id, products_with_qty, effective_date=None):
        """Birden fazla ürünün porsiyonunu toplu geri yükler."""
        if not effective_date:
            effective_date = timezone.localdate()
            
        product_ids = [p[0] for p in products_with_qty]
        avails = ProductDayAvailability.objects.filter(
            branch_id=branch_id,
            product_id__in=product_ids,
            effective_date=effective_date,
            is_active=True,
        ).select_for_update(nowait=True)

        avail_map = {str(a.product_id): a for a in avails}
        
        for pid, qty in products_with_qty:
            avail = avail_map.get(str(pid))
            if not avail or avail.remaining_portions is None: continue
            
            qty_decimal = Decimal(str(qty))
            avail.remaining_portions += qty_decimal
            if avail.mode == AvailabilityMode.SOLD_OUT and avail.remaining_portions > 0:
                avail.mode = AvailabilityMode.LIMITED
            avail.save(update_fields=['remaining_portions', 'mode', 'updated_at'])
            
            transaction.on_commit(lambda p=pid: broadcast_menu_catalog_refresh(reason="portion_updated", product_id=str(p), branch_id=str(branch_id)))
