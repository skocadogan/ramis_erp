import json
import logging
from typing import Any

from channels.layers import get_channel_layer
from django.core.serializers.json import DjangoJSONEncoder

from apps.orders.ws_broadcast import broadcast_to_kitchen_ws_groups

logger = logging.getLogger(__name__)


def _json_safe(data: dict[str, Any] | None) -> dict[str, Any] | None:
    """
    DRF serializer'dan gelen UUID objelerini ve diğer non-JSON-safe tipleri
    string'e çevirir. channels_redis (msgpack) serialize ederken
    ``TypeError: can not serialize 'UUID' object`` hatasını engeller.
    """
    if data is None:
        return None
    return json.loads(json.dumps(data, cls=DjangoJSONEncoder))


def serialize_prep_task_for_ws(task) -> dict[str, Any] | None:
    """Liste API ile aynı şekilde görev özeti (WebSocket istemci önbelleği için)."""
    from .models import PrepTask
    from .serializers import PrepTaskSerializer

    obj = (
        PrepTask.objects.filter(pk=task.pk, is_active=True)
        .select_related("station", "assigned_to", "completed_by")
        .first()
    )
    if obj is None:
        return None
    return _json_safe(PrepTaskSerializer(obj).data)


def broadcast_prep_update(
    branch_id,
    station_id=None,
    *,
    task=None,
    removed_task_id=None,
    refresh_all=False,
):
    """
    Hazırlık listesi güncellendiğinde mutfak WebSocket istemcilerine bildirir.

    - ``task``: güncel görev özeti (istemci önbelleğini nokta atışı günceller)
    - ``removed_task_id``: soft delete vb. — listeden düşürülür
    - ``refresh_all``: toplu üretim (şablon) — istemci tam refetch yapar
    """
    channel_layer = get_channel_layer()
    if channel_layer is None or not branch_id:
        return

    task_data = None
    do_refresh_all = bool(refresh_all)
    if task is not None and not do_refresh_all:
        task_data = serialize_prep_task_for_ws(task)
        if task_data is None:
            # ORM anlık durumda kayıt okunamadıysa istemci önbelleği kısmi güncellenemez
            do_refresh_all = True

    message = {
        "reason": "prep_update",
        "sub_type": "prep_update",
        "station_id": str(station_id) if station_id else None,
        "refresh_all": do_refresh_all,
        "removed_task_id": str(removed_task_id) if removed_task_id else None,
        "task": task_data,
    }
    event = {"type": "prep_updated", "message": message}
    try:
        broadcast_to_kitchen_ws_groups(channel_layer, str(branch_id), event)
    except Exception:
        logger.exception("Prep WebSocket yayını başarısız (branch_id=%s)", branch_id)
