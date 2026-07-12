from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'^ws/warehouse/notifications/$', consumers.WarehouseNotificationConsumer.as_asgi()),
]
