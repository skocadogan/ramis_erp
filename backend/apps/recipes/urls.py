from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RecipeViewSet, RecipeCategoryViewSet

router = DefaultRouter()
router.register(r'recipes', RecipeViewSet, basename='recipe')
router.register(r'categories', RecipeCategoryViewSet, basename='recipe-category')

urlpatterns = [
    path('', include(router.urls)),
]
