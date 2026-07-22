import json
import logging
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from core.ws_consumer import (
    ws_allow_connection,
    ws_handle_client_ping,
    ws_on_connect,
    ws_on_disconnect,
    ws_safe_send,
    ws_send_pong,
)

logger = logging.getLogger(__name__)

class ProductionStatusConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        if not await ws_allow_connection(self, use_authenticated_user=False):
            return
        user = await self._authenticate_ws()
        if user is None or not user.is_authenticated:
            await self.close()
            return

        self.user = user
        if not await ws_allow_connection(self, user):
            return
        self.branch_id = self.scope["url_route"]["kwargs"].get("branch_id")
        if not self.branch_id:
            await self.close()
            return

        eff_id, mode = await self._resolve_ws_branch(self.user, self.branch_id)
        if mode == "deny":
            await self.close()
            return

        if mode != "global" and str(eff_id) != str(self.branch_id):
            await self.close()
            return

        self.group_name = f"production_status_{self.branch_id}"
        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )
        ws_on_connect("production_status")
        await self.accept()
        logger.info("ProductionStatus WS Connected: Group=%s, User=%s", self.group_name, self.user.username)

    @database_sync_to_async
    def _authenticate_ws(self):
        from apps.users.ws_auth import get_user_for_websocket

        return get_user_for_websocket(self.scope)

    @database_sync_to_async
    def _resolve_ws_branch(self, user, branch_id_raw):
        from core.branch_scope import resolve_websocket_branch_subscription

        return resolve_websocket_branch_subscription(user, branch_id_raw)

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name
            )
        ws_on_disconnect("production_status")
        logger.info("ProductionStatus WS Disconnected: %s", getattr(self, "group_name", ""))

    async def receive(self, text_data=None, bytes_data=None):
        if await ws_handle_client_ping(text_data):
            await ws_send_pong(self)
            return

    async def production_status_update(self, event):
        logger.info("ProductionStatus WS Sending Update to %s: %s", self.group_name, event.get("message"))
        await ws_safe_send(self, text_data=json.dumps(event["message"]))
