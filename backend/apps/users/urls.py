from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UserAdminViewSet, RoleAdminViewSet,
    PermissionAdminViewSet, PermissionCategoryAdminViewSet,
)

router = DefaultRouter()
router.register(r'users', UserAdminViewSet, basename='admin-user')
router.register(r'roles', RoleAdminViewSet, basename='admin-role')
router.register(r'permissions', PermissionAdminViewSet, basename='admin-permission')
router.register(r'permission-categories', PermissionCategoryAdminViewSet, basename='admin-permission-category')

urlpatterns = [
    path('', include(router.urls)),
]
