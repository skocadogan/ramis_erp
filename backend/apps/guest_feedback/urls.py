from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    DisplaySurveyCloseView,
    DisplaySurveyCurrentView,
    DisplaySurveyOpenView,
    DisplaySurveySubmitView,
    SmartTableSurveyAvailableView,
    SmartTableSurveyCloseView,
    SmartTableSurveyOpenView,
    SmartTableSurveySubmitView,
    SurveyResponseViewSet,
    SurveyViewSet,
)

router = DefaultRouter()
router.register(r'surveys', SurveyViewSet, basename='guest-feedback-survey')
router.register(r'responses', SurveyResponseViewSet, basename='guest-feedback-response')

urlpatterns = [
    path('', include(router.urls)),
    path('display/open/', DisplaySurveyOpenView.as_view(), name='guest-feedback-display-open'),
    path('display/current/<str:terminal_code>/', DisplaySurveyCurrentView.as_view(), name='guest-feedback-display-current'),
    path('display/close/', DisplaySurveyCloseView.as_view(), name='guest-feedback-display-close'),
    path('display/submit/', DisplaySurveySubmitView.as_view(), name='guest-feedback-display-submit'),
    path('smart-table/available/', SmartTableSurveyAvailableView.as_view(), name='guest-feedback-smart-table-available'),
    path('smart-table/open/', SmartTableSurveyOpenView.as_view(), name='guest-feedback-smart-table-open'),
    path('smart-table/close/', SmartTableSurveyCloseView.as_view(), name='guest-feedback-smart-table-close'),
    path('smart-table/submit/', SmartTableSurveySubmitView.as_view(), name='guest-feedback-smart-table-submit'),
]
