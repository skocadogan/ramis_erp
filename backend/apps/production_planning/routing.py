from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/production-status/(?P<branch_id>[^/]+)/$', consumers.ProductionStatusConsumer.as_asgi()),
]
