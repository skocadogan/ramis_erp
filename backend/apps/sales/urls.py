from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SaleViewSet
from .views_fiscal_webhook import FiscalWebhookView

router = DefaultRouter()
router.register(r'', SaleViewSet, basename='sale')

urlpatterns = [
    path('fiscal/webhook/<uuid:terminal_id>/', FiscalWebhookView.as_view(), name='fiscal-webhook'),
    path('', include(router.urls)),
]
