from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CreditAccountViewSet

router = DefaultRouter()
router.register(r"accounts", CreditAccountViewSet, basename="credit-account")

urlpatterns = [
    path("", include(router.urls)),
]
