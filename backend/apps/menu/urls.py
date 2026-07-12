from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CategoryViewSet, ProductViewSet, ProductVariantViewSet,
    ModifierGroupViewSet, ModifierViewSet,
    MenuTagViewSet, MenuCatalogSettingsViewSet,
)

router = DefaultRouter()
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'products', ProductViewSet, basename='product')
router.register(r'variants', ProductVariantViewSet, basename='productvariant')
router.register(r'modifier-groups', ModifierGroupViewSet, basename='modifiergroup')
router.register(r'tags', MenuTagViewSet, basename='menutag')
router.register(r'catalog-settings', MenuCatalogSettingsViewSet, basename='menu-catalog-settings')

urlpatterns = [
    path('', include(router.urls)),
]
