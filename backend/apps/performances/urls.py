from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import WaiterCallLogViewSet, WaiterOrderSalesViewSet

router = DefaultRouter()
router.register(r'waiter-calls', WaiterCallLogViewSet, basename='waiter-call-log')
router.register(r'waiter-sales', WaiterOrderSalesViewSet, basename='waiter-order-sales')

urlpatterns = [
    path('', include(router.urls)),
]
