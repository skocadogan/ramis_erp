from django.urls import path, include
from rest_framework.routers import DefaultRouter

from apps.shifts.views import ShiftViewSet, CashierPinAssignmentViewSet

router = DefaultRouter()
router.register("cashier-pins", CashierPinAssignmentViewSet, basename="cashier-pin-assignment")
router.register("", ShiftViewSet, basename="shift")

urlpatterns = [
    path("", include(router.urls)),
]

