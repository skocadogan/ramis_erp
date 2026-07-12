"""
Warehouse services module - Modüler stok ve depo yönetimi hizmetleri.

Bu modül, warehouse uygulamasındaki tüm service sınıflarını içerir:
- WarehouseService: Depo CRUD ve stok seviyesi iş mantığı
- PurchaseOrderService: Satın alma siparişi iş mantığı
- GoodsReceivingService: Mal kabul iş mantığı
- TransferService: Depolar arası transfer iş mantığı
- StockCountingService: Stok sayımı iş mantığı
- DeficiencyFulfillmentService: Eksik listesi karşılanması iş mantığı
- DeficiencyReportService: Eksik listesi oluşturma ve yaşam döngüsü
- PurchaseRecommendationService: Talep bazlı satın alma öneri motoru
"""

from .warehouse_service import WarehouseService
from .purchase_order_service import PurchaseOrderService
from .goods_receiving_service import GoodsReceivingService
from .transfer_service import TransferService, TransferStockValidationError
from .stock_counting_service import StockCountingService
from .fulfillment_service import DeficiencyFulfillmentService
from .deficiency_report_service import DeficiencyReportService
from .deficiency_action_service import DeficiencyActionService
from .purchase_recommendation_service import PurchaseRecommendationService

__all__ = [
    "WarehouseService",
    "PurchaseOrderService",
    "GoodsReceivingService",
    "TransferService",
    "TransferStockValidationError",
    "StockCountingService",
    "DeficiencyFulfillmentService",
    "DeficiencyReportService",
    "DeficiencyActionService",
    "PurchaseRecommendationService",
]
