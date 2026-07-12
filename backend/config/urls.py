from django.contrib import admin
from django.http import JsonResponse
from django.urls import path, include
from apps.users.views import (
    CustomTokenObtainPairView,
    CustomTokenRefreshView,
)
from django.conf import settings
from django.conf.urls.static import static


def api_v1_health(_request):
    """Genel sağlık kontrolü (auth yok); frontend runtime / proxy doğrulaması için."""
    from core.ws_metrics import get_ws_metrics_snapshot

    return JsonResponse({
        'status': 'ok',
        'service': 'ramis-erp-api',
        'websocket': get_ws_metrics_snapshot(),
    })


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/v1/auth/token/refresh/', CustomTokenRefreshView.as_view(), name='token_refresh'),
    path('api/v1/auth/', include('apps.users.auth_urls')),
    path('api/v1/health/', api_v1_health),
    path('api/v1/', include('core.urls')),
    path('api/v1/', include('apps.branches.urls')),
    path('api/v1/menu/', include('apps.menu.urls')),
    path('api/v1/orders/', include('apps.orders.urls')),
    path('api/v1/inventory/', include('apps.inventory.urls')),
    path('api/v1/recipes/', include('apps.recipes.urls')),
    path('api/v1/audit/', include('apps.audit.urls')),
    path('api/v1/shifts/', include('apps.shifts.urls')),
    path('api/v1/sales/', include('apps.sales.urls')),
    path('api/v1/dashboard/', include('apps.dashboard.urls')),
    path('api/v1/invoices/', include('apps.invoices.urls')),
    path('api/v1/reservations/', include('apps.reservations.urls')),
    path('api/v1/admin/', include('apps.users.urls')),
    path('api/v1/warehouse/', include('apps.warehouse.urls')),
    path('api/v1/pos-display/', include('apps.pos_display.urls')),
    path('api/v1/prep-display/', include('apps.prep_display.urls')),
    path('api/v1/search/', include('apps.search.urls')),
    path('api/v1/reporting/', include('apps.reporting.urls')),
    path('api/v1/printing/', include('apps.printing.urls')),
    path('api/v1/production-planning/', include('apps.production_planning.urls')),
    path('api/v1/prep/', include('apps.prep.urls')),
    path('api/v1/performances/', include('apps.performances.urls')),
    path('api/v1/credit/', include('apps.credit.urls')),
    path('api/v1/customers/', include('apps.customers.urls')),
    path('api/v1/guest-feedback/', include('apps.guest_feedback.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
