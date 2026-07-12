import json

from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

from core.ws_consumer import ws_handle_client_ping, ws_on_connect, ws_on_disconnect, ws_send_pong


class MenuCatalogConsumer(AsyncWebsocketConsumer):
    """Menü kategorisi/ürün listesi değişince POS tarafını tetikler."""

    async def connect(self):
        # --- WS Authentication ---
        user = await self._authenticate_ws()
        if user is None or not user.is_authenticated:
            await self.close()
            return

        self.user = user
        self.group_name = "menu_catalog"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        ws_on_connect("menu_catalog")
        await self.accept()

    @database_sync_to_async
    def _authenticate_ws(self):
        from apps.users.ws_auth import get_user_for_websocket

        return get_user_for_websocket(self.scope)

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        ws_on_disconnect("menu_catalog")

    async def receive(self, text_data=None, bytes_data=None):
        if await ws_handle_client_ping(text_data):
            await ws_send_pong(self)
            return

    async def menu_catalog_refresh(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "menu_catalog_refresh",
                    "data": event.get("message", {}),
                }
            )
        )
