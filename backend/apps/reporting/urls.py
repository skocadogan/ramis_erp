from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ReportTemplateViewSet
from .module_views import ModuleReportViewSet
from .receipt_views import ReceiptTemplateViewSet

router = DefaultRouter()
router.register(r'templates', ReportTemplateViewSet, basename='report-template')
router.register(r'module-reports', ModuleReportViewSet, basename='module-report')
router.register(r'receipts', ReceiptTemplateViewSet, basename='receipt-template')

urlpatterns = [
    path('', include(router.urls)),
]

