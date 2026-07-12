from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BranchViewSet, ZoneViewSet, TableViewSet, KitchenStationViewSet
from .views_call_waiter import CallWaiterView
from .views_waiter_call_dismiss import WaiterCallDismissView
from .views_waiter_call_pending import WaiterCallPendingView
from .views_smart_button import SmartButtonTableView

router = DefaultRouter()
router.register(r'branches', BranchViewSet, basename='branch')
router.register(r'zones', ZoneViewSet, basename='zone')
router.register(r'tables', TableViewSet, basename='table')
router.register(r'stations', KitchenStationViewSet, basename='station')

urlpatterns = [
    path('call-waiter/', CallWaiterView.as_view(), name='call-waiter'),
    path('waiter-calls/dismiss/', WaiterCallDismissView.as_view(), name='waiter-calls-dismiss'),
    path('waiter-calls/pending/', WaiterCallPendingView.as_view(), name='waiter-calls-pending'),
    path('smart-button/table/', SmartButtonTableView.as_view(), name='smart-button-table'),
    path('', include(router.urls)),
]
