from django.urls import path, include
from rest_framework.routers import DefaultRouter

from apps.reservations.views import ReservationViewSet, ReservationBranchSettingsViewSet

router = DefaultRouter()
router.register("branch-settings", ReservationBranchSettingsViewSet, basename="reservation-branch-settings")
router.register("", ReservationViewSet, basename="reservation")

urlpatterns = [
    path("", include(router.urls)),
]
