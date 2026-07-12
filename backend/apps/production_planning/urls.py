from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import (
    ProductionPlanViewSet,
    ProductionPlanLineViewSet,
    ProductionDaySettingsViewSet,
    ProductDayAvailabilityViewSet
)

router = DefaultRouter()
router.register(r'plans', ProductionPlanViewSet, basename='production-plan')
router.register(r'plan-lines', ProductionPlanLineViewSet, basename='production-plan-line')
router.register(r'settings', ProductionDaySettingsViewSet, basename='production-settings')
router.register(r'availability', ProductDayAvailabilityViewSet, basename='product-availability')

urlpatterns = [
    path('', include(router.urls)),
]
