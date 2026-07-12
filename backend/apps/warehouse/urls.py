from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    WarehouseViewSet,
    PurchaseOrderViewSet,
    GoodsReceivingViewSet,
    WarehouseTransferViewSet,
    StockCountingViewSet,
    DeficiencyReportViewSet,
    PurchaseRecommendationViewSet,
    ProcurementAlertViewSet,
)

router = DefaultRouter()
router.register(r'warehouses', WarehouseViewSet, basename='warehouse')
router.register(r'purchase-orders', PurchaseOrderViewSet, basename='purchaseorder')
router.register(r'goods-receiving', GoodsReceivingViewSet, basename='goodsreceiving')
router.register(r'transfers', WarehouseTransferViewSet, basename='warehousetransfer')
router.register(r'stock-counting', StockCountingViewSet, basename='stockcounting')
router.register(r'deficiency-reports', DeficiencyReportViewSet, basename='deficiencyreport')
router.register(r'purchase-recommendations', PurchaseRecommendationViewSet, basename='purchaserecommendation')
router.register(r'procurement-alerts', ProcurementAlertViewSet, basename='procurementalert')

urlpatterns = [
    path('', include(router.urls)),
]
