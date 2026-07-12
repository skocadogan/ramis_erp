from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DisplaySettingsViewSet,
    PromotionSlideViewSet,
    PosDisplayWsSubscribeTokenView,
    PosTerminalViewSet,
)

router = DefaultRouter()
router.register(r'settings', DisplaySettingsViewSet, basename='display-settings')
router.register(r'slides', PromotionSlideViewSet, basename='promotion-slides')
router.register(r'terminals', PosTerminalViewSet, basename='pos-terminals')

urlpatterns = [
    path('ws-subscribe-token/', PosDisplayWsSubscribeTokenView.as_view(), name='pos-display-ws-token'),
    path('', include(router.urls)),
]
