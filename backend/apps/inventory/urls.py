from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    StockItemViewSet,
    StockMovementViewSet,
    SupplierViewSet,
    StockCategoryViewSet,
    StockUnitViewSet,
    AllergenViewSet,
    StockReceiptDraftViewSet,
    ReturnDisposalFlowViewSet,
)
from .expiry_warning_view import ExpiryWarningViewSet

router = DefaultRouter()
router.register(r'stock-items', StockItemViewSet, basename='stockitem')
router.register(r'stock-movements', StockMovementViewSet, basename='stockmovement')
router.register(r'suppliers', SupplierViewSet, basename='supplier')
router.register(r'categories', StockCategoryViewSet, basename='stockcategory')
router.register(r'stock-units', StockUnitViewSet, basename='stockunit')
router.register(r'allergens', AllergenViewSet, basename='allergen')
router.register(r'stock-receipt-drafts', StockReceiptDraftViewSet, basename='stockreceiptdraft')
router.register(r'expiry-warnings', ExpiryWarningViewSet, basename='expiry-warning')
router.register(r'return-disposal-flows', ReturnDisposalFlowViewSet, basename='returndisposalflow')

urlpatterns = [
    path('', include(router.urls)),
]
