from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'^ws/kitchen/notifications/$', consumers.KitchenNotificationConsumer.as_asgi()),
    re_path(r'^ws/pos/display/(?P<terminal_id>[\w-]+)/$', consumers.PosDisplayConsumer.as_asgi()),
]
