from django.urls import path, include
from rest_framework.routers import DefaultRouter

from apps.dashboard.views import DashboardViewSet

router = DefaultRouter()
router.register("", DashboardViewSet, basename="dashboard")

urlpatterns = [
    path("", include(router.urls)),
]
