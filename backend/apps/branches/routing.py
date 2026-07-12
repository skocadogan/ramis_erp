from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'^ws/pos/sync/$', consumers.PosSyncConsumer.as_asgi()),
    re_path(r'^ws/staff/notifications/$', consumers.StaffNotificationConsumer.as_asgi()),
    re_path(r'^ws/waiter/calls/$', consumers.WaiterCallConsumer.as_asgi()),
]
