# Uvicorn ile çalıştırmak için: uvicorn config.asgi:application --workers 4 --ws ping_interval 25
# veya: uvicorn config.asgi:application --workers 2 --ws ping_interval 25 --loop asyncio
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django_asgi_app = get_asgi_application()

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
import apps.orders.routing
import apps.branches.routing
import apps.menu.routing
import apps.warehouse.routing
import apps.production_planning.routing

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(
            apps.orders.routing.websocket_urlpatterns +
            apps.branches.routing.websocket_urlpatterns +
            apps.menu.routing.websocket_urlpatterns +
            apps.warehouse.routing.websocket_urlpatterns +
            apps.production_planning.routing.websocket_urlpatterns
        )
    ),
})
