"""InventoryService — Facade: geriye dönük uyumluluk için tüm public API'yi tek noktada toplar."""


from ._helpers import (InsufficientStockError, 
                       normalize_quantity_to_item_unit,
                       ROUND_HALF_UP)
from .stock_movement_service import (
    adjust_stock,
    delete_movement,
    deduct_stock,
    receive_stock,
    receive_stock_lots,
    waste_stock,
    return_stock,
    cancel_stock,
    dispose_stock,
)
from .pos_stock_check_service import check_pos_cart_station_stock
from .order_deduction_service import deduct_for_order
from .stock_reservation_service import StockReservationService
from .stock_receipt_service import finalize_stock_receipt_draft


class InventoryService:
    """Stok yönetimi iş mantığı - Depo bazlı çalışır.

    Bu sınıf bir facade'dır; asıl iş mantığı ayrı modüllerde yaşar:
    - stock_movement_service: receive, deduct, waste, adjust, delete
    - pos_stock_check_service: POS sepet stok kontrolü
    - order_deduction_service: sipariş stok düşümü ve kritik uyarılar
    - stock_receipt_service: taslak mal kabul kesinleştirme
    """

    receive_stock = staticmethod(receive_stock)
    receive_stock_lots = staticmethod(receive_stock_lots)
    deduct_stock = staticmethod(deduct_stock)
    waste_stock = staticmethod(waste_stock)
    return_stock = staticmethod(return_stock)
    cancel_stock = staticmethod(cancel_stock)
    dispose_stock = staticmethod(dispose_stock)
    adjust_stock = staticmethod(adjust_stock)
    delete_movement = staticmethod(delete_movement)
    check_pos_cart_station_stock = staticmethod(check_pos_cart_station_stock)
    deduct_for_order = staticmethod(deduct_for_order)
    reserve_for_order = staticmethod(StockReservationService.reserve_for_order)
    commit_reservations = staticmethod(StockReservationService.commit_reservations)
    release_reservations = staticmethod(StockReservationService.release_reservations)
    finalize_stock_receipt_draft = staticmethod(finalize_stock_receipt_draft)

    # Harici kodun doğrudan çağırdığı dahili yardımcı — geriye dönük uyumluluk
    _normalize_quantity_to_item_unit = staticmethod(normalize_quantity_to_item_unit)
