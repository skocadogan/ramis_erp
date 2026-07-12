from .order_core_service import OrderCoreService
from .table_flow_service import TableFlowService
from .discount_service import DiscountService
from .item_service import ItemService
from .sale_helper import resolve_pos_terminal, OrderValidationError

class OrderService:
    """
    Sipariş Servisi - Modüler yapıya bölünmüştür.
    Geriye dönük uyumluluk için bu sınıf metodları yönlendirir.
    """
    resolve_pos_terminal = staticmethod(resolve_pos_terminal)
    
    # Core
    create_order = staticmethod(OrderCoreService.create_order)
    complete_order = staticmethod(OrderCoreService.complete_order)
    cancel_order = staticmethod(OrderCoreService.cancel_order)
    force_close = staticmethod(OrderCoreService.force_close)
    
    # Table
    complete_table = staticmethod(TableFlowService.complete_table)
    transfer_table = staticmethod(TableFlowService.transfer_table)
    
    # Discount
    apply_discount = staticmethod(DiscountService.apply_discount)
    remove_discount = staticmethod(DiscountService.remove_discount)
    
    # Item
    cancel_item = staticmethod(ItemService.cancel_item)
    recall_item = staticmethod(ItemService.recall_item)
    update_item_quantity = staticmethod(ItemService.update_item_quantity)

__all__ = ['OrderService', 'OrderValidationError']
