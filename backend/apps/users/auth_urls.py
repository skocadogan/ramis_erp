from django.urls import path
from .views import (
    MeView,
    ChangePasswordView,
    LogoutView,
    PosScreenPreferencesView,
    CheckPinUserView,
    PinTokenObtainView,
    WsTicketView,
)

urlpatterns = [
    path('me/', MeView.as_view(), name='auth-me'),
    path(
        'me/pos-screen-preferences/',
        PosScreenPreferencesView.as_view(),
        name='auth-pos-screen-preferences',
    ),
    path('change-password/', ChangePasswordView.as_view(), name='auth-change-password'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
    path('check-pin/', CheckPinUserView.as_view(), name='auth-check-pin'),
    path('token/pin/', PinTokenObtainView.as_view(), name='auth-token-pin'),
    path('ws-ticket/', WsTicketView.as_view(), name='auth-ws-ticket'),
]
