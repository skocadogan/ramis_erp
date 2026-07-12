import json
from urllib.parse import parse_qs
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async


class WarehouseNotificationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # --- WS Authentication ---
        user = await self._authenticate_ws()
        if user is None or not user.is_authenticated:
            await self.close()
            return

        self.user = user
        query = parse_qs((self.scope.get("query_string") or b"").decode("utf-8"))
        branch_id = (query.get("branch_id") or [None])[0]
        eff_id, mode = await self._resolve_ws_branch(self.user, branch_id)
        if mode == "deny":
            await self.close()
            return

        if mode == "global":
            self.group_name = "warehouse_notifications_global"
        else:
            self.group_name = f"warehouse_notifications_{eff_id}"

        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )

        await self.accept()

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

    # Olay fırlatıldığında tetiklenir
    async def deficiency_created(self, event):
        """Yeni bir eksik listesi oluşturulduğunda."""
        await self.send(text_data=json.dumps({
            'type': 'deficiency_created',
            'data': event['message']
        }))

    async def deficiency_status_changed(self, event):
        """Eksik listesinin durumu değiştiğinde."""
        await self.send(text_data=json.dumps({
            'type': 'deficiency_status_changed',
            'data': event['message']
        }))

    async def expiry_transfer_draft_created(self, event):
        """SKT transfer önerisi taslağı oluşturulduğunda."""
        await self.send(text_data=json.dumps({
            'type': 'expiry_transfer_draft_created',
            'data': event['message']
        }))

    async def stock_low_alert(self, event):
        """Depoda kritik stok (diğer depolar) uyarısı."""
        await self.send(
            text_data=json.dumps(
                {
                    "type": "stock_low_alert",
                    "data": event["message"],
                }
            )
        )

    async def procurement_overdue_alert(self, event):
        """Geciken satın alma siparişi uyarısı."""
        await self.send(
            text_data=json.dumps(
                {
                    "type": "procurement_overdue_alert",
                    "data": event["message"],
                }
            )
        )
