from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PrepBranchSettingsViewSet,
    PrepTaskViewSet,
    PrepTemplateViewSet,
    PrepSmartRuleViewSet,
)

router = DefaultRouter()
router.register(r'tasks', PrepTaskViewSet, basename='prep-tasks')
router.register(r'templates', PrepTemplateViewSet, basename='prep-templates')
router.register(r'smart-rules', PrepSmartRuleViewSet, basename='prep-smart-rules')
router.register(
    r"branch-settings", PrepBranchSettingsViewSet, basename="prep-branch-settings"
)

urlpatterns = [
    path('', include(router.urls)),
]
