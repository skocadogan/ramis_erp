from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as _

from .models import Sale


class SaleValidationError(Exception):
    """Satış iş mantığı kural ihlali."""
    pass


SALES_SUMMARY_CACHE_GEN_KEY = "sales_summary_cache_gen"


def bump_sales_summary_cache_generation() -> None:
    """
    Satış özeti önbelleğini geçersiz kılar.
    Özet anahtarları nesil (generation) ile sürülür; böylece tüm kapsam varyantları tek hamlede düşer.
    """
    from django.core.cache import cache

    try:
        cache.incr(SALES_SUMMARY_CACHE_GEN_KEY)
    except ValueError:
        cache.set(SALES_SUMMARY_CACHE_GEN_KEY, 1, timeout=None)


def sales_summary_cache_key(request, today_iso: str) -> str:
    """
    Özet yanıtı kullanıcı şube kapsamına göre ayrıştırır (aynı branch_id parametresi
    olmadan 'tüm şubeler' ile çok şubeli kullanıcıların verisi karışmasın diye).
    """
    from django.core.cache import cache

    from core.branch_scope import accessible_branch_id_strings

    gen = cache.get(SALES_SUMMARY_CACHE_GEN_KEY)
    if gen is None:
        gen = 0

    qp = (request.query_params.get("branch_id") or "").strip() or None
    allowed = accessible_branch_id_strings(request.user)

    if allowed is None:
        segment = f"su:{qp or 'all'}"
    elif not allowed:
        uid = getattr(request.user, "pk", None) or "anon"
        segment = f"empty:{uid}"
    else:
        sig = ",".join(sorted(allowed))
        segment = f"sc:{sig}:b:{qp}" if qp else f"sc:{sig}:all"

    return f"sales_summary_{gen}_{segment}_{today_iso}"


def _invalidate_summary_cache(branch_id=None):
    """
    PERF-2: Satış verisi değiştiğinde özet önbelleğini geçersiz kılar.
    Eski anahtar biçimi (sales_summary_all / sales_summary_{branch_id}) için delete_many;
    ardından nesil artırılarak yeni anahtarlar kullanılır.
    branch_id geriye dönük uyumluluk için kabul edilir.
    """
    from django.core.cache import cache
    from django.utils import timezone as tz

    today = tz.now().date().isoformat()
    legacy_keys = [f"sales_summary_all_{today}"]
    if branch_id:
        legacy_keys.append(f"sales_summary_{branch_id}_{today}")
    cache.delete_many(legacy_keys)
    bump_sales_summary_cache_generation()


class SaleService:
    """Satış iş mantığı — view'ler sadece HTTP katmanını yönetir."""

    @staticmethod
    @transaction.atomic
    def soft_delete(sale_id):
        """Satışı soft-delete yapar (is_deleted=True, is_active=False)."""
        try:
            sale = Sale.objects.get(id=sale_id)
        except Sale.DoesNotExist:
            raise SaleValidationError(_("Satış kaydı bulunamadı."))

        if sale.is_deleted:
            raise SaleValidationError(_("Bu satış zaten silinmiş."))

        sale.is_deleted = True
        sale.is_active = False
        sale.deleted_at = timezone.now()
        sale.save(update_fields=['is_deleted', 'is_active', 'deleted_at', 'updated_at'])
        _invalidate_summary_cache(branch_id=sale.branch_id)
        from apps.dashboard.selectors import invalidate_dashboard_cache
        invalidate_dashboard_cache(branch_id=sale.branch_id)
        return sale

    @staticmethod
    @transaction.atomic
    def return_sale(sale_id, reason_code, reason_text=None, performed_by=None):
        """Satışı iade eder — stok iade/imha akışı başlatır.

        Epic-05: İade edilen satış için:
        1. Sale üzerinde return_reason_code, return_flow set eder
        2. ReturnDisposalFlow kaydı oluşturur (CUSTOMER_RETURN tipi)
        3. Her bir kalem için ReturnDisposalFlowItem oluşturur
        4. Stok iadesi/disposal için stock_movement servisini çağırır
        """
        from apps.inventory.models import (
            ReturnDisposalFlow,
            ReturnDisposalFlowItem,
            ReturnDisposalFlowType,
            ReturnDisposalFlowStatus,
        )
        from apps.inventory.services.stock_movement_service import return_stock

        try:
            sale = Sale.objects.get(id=sale_id)
        except Sale.DoesNotExist:
            raise SaleValidationError(_("Satış kaydı bulunamadı."))

        if sale.is_deleted:
            raise SaleValidationError(_("Silinmiş satış iade edilemez."))

        if sale.return_flow_id:
            raise SaleValidationError(_("Bu satış zaten iade edilmiş."))

        # 1. ReturnDisposalFlow oluştur — varsayılan depoyu bul
        from apps.warehouse.models import Warehouse
        default_warehouse = Warehouse.objects.filter(
            branches=sale.branch, is_default=True
        ).first()
        if not default_warehouse:
            default_warehouse = Warehouse.objects.filter(
                branches=sale.branch
            ).first()

        flow = ReturnDisposalFlow.objects.create(
            flow_type=ReturnDisposalFlowType.CUSTOMER_RETURN,
            status=ReturnDisposalFlowStatus.APPROVED,
            source_warehouse=default_warehouse,
            reason_code=reason_code,
            reason_text=reason_text or "",
            sale=sale,
            created_by=performed_by,
            approved_by=performed_by,
            completed_at=timezone.now(),
        )

        # 2. Satış kalemleri üzerinden ReturnDisposalFlowItem oluştur
        from apps.orders.models import OrderItem

        sale_items = OrderItem.objects.filter(
            order__sale=sale,
            status__in=['DELIVERED', 'COMPLETED'],
        )
        for item in sale_items:
            if item.product and item.product.ingredient_stock_item_id:
                ReturnDisposalFlowItem.objects.create(
                    flow=flow,
                    stock_item_id=item.product.ingredient_stock_item_id,
                    quantity=item.product.ingredient_quantity * item.quantity,
                    unit_price=item.unit_price if hasattr(item, 'unit_price') else Decimal('0'),
                )

        # 3. Sale alanlarını güncelle
        sale.return_reason_code = reason_code
        sale.return_reason_text = reason_text or ""
        sale.return_flow = flow
        sale.save(update_fields=['return_reason_code', 'return_reason_text', 'return_flow', 'updated_at'])

        _invalidate_summary_cache(branch_id=sale.branch_id)
        from apps.dashboard.selectors import invalidate_dashboard_cache
        invalidate_dashboard_cache(branch_id=sale.branch_id)
        return sale

    @staticmethod
    @transaction.atomic
    def bulk_restore(sale_ids):
        """Silinmiş satışları geri yükler (is_deleted=False, is_active=True)."""
        if not sale_ids:
            raise SaleValidationError(_("Geçerli id listesi gereklidir."))

        restored_count = Sale.objects.filter(
            id__in=sale_ids, is_deleted=True
        ).update(is_deleted=False, is_active=True, deleted_at=None)
        _invalidate_summary_cache()
        from apps.dashboard.selectors import invalidate_dashboard_cache
        invalidate_dashboard_cache()
        return restored_count

    @staticmethod
    @transaction.atomic
    def bulk_delete_permanent(sale_ids):
        """Silinmiş satışları kalıcı olarak siler (yalnızca is_deleted=True olanlar)."""
        if not sale_ids:
            raise SaleValidationError(_("Geçerli id listesi gereklidir."))

        deleted_count, _ = Sale.objects.filter(id__in=sale_ids, is_deleted=True).delete()
        _invalidate_summary_cache()
        from apps.dashboard.selectors import invalidate_dashboard_cache
        invalidate_dashboard_cache()
        return deleted_count
