"""İade/İmha akışı tamamlama ve stok hareketi oluşturma."""


from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import (
    ReturnDisposalFlow,
    ReturnDisposalFlowItem,
    ReturnDisposalFlowStatus,
    ReturnDisposalFlowType,
    StockMovementType,
)
from apps.inventory.services import InventoryService, InsufficientStockError


@transaction.atomic
def complete_return_disposal_flow(flow: ReturnDisposalFlow, performed_by=None) -> ReturnDisposalFlow:
    """Onaylanmış akışı tamamlar; kalemler için stok hareketi oluşturur."""
    if flow.status != ReturnDisposalFlowStatus.APPROVED:
        raise ValueError('Yalnızca onaylanmış akışlar tamamlanabilir.')

    items = ReturnDisposalFlowItem.objects.filter(flow=flow, is_active=True).select_related('stock_item')
    movement_type_map = {
        ReturnDisposalFlowType.RETURN_TO_SUPPLIER: StockMovementType.RETURN,
        ReturnDisposalFlowType.CUSTOMER_RETURN: StockMovementType.RETURN,
        ReturnDisposalFlowType.DISPOSAL: StockMovementType.DISPOSAL,
        ReturnDisposalFlowType.END_OF_DAY_SURPLUS: StockMovementType.CANCEL,
    }
    movement_type = movement_type_map.get(flow.flow_type, StockMovementType.RETURN)
    reference = flow.reason_code or flow.get_flow_type_display()

    for item in items:
        notes_parts = []
        if flow.reason_text:
            notes_parts.append(flow.reason_text)
        if item.is_packaging_intact is not None:
            notes_parts.append(
                'Ambalaj sağlam' if item.is_packaging_intact else 'Ambalaj hasarlı'
            )
        notes = ' | '.join(notes_parts)

        common = {
            'warehouse_id': flow.source_warehouse_id,
            'stock_item_id': item.stock_item_id,
            'quantity': Decimal(str(item.quantity)),
            'reference': reference,
            'notes': notes,
            'performed_by': performed_by,
            'supplier_id': flow.supplier_id,
        }

        if movement_type == StockMovementType.RETURN:
            InventoryService.return_stock(**common)
        elif movement_type == StockMovementType.DISPOSAL:
            InventoryService.dispose_stock(**common)
        elif movement_type == StockMovementType.CANCEL:
            InventoryService.cancel_stock(**common)
        else:
            InventoryService.deduct_stock(**common, movement_type=movement_type)

    flow.status = ReturnDisposalFlowStatus.COMPLETED
    flow.completed_at = timezone.now()
    flow.save(update_fields=['status', 'completed_at', 'updated_at'])
    return flow
