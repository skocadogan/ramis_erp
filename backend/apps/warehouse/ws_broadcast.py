import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

from apps.orders.ws_broadcast import broadcast_to_kitchen_ws_groups

logger = logging.getLogger(__name__)


def schedule_deficiency_created(report) -> None:
    """Oluşturma/yazma transaction'ı commit olduktan sonra depo WebSocket yayını."""

    rid = report.pk

    def _send() -> None:
        from apps.warehouse.models import DeficiencyReport

        r = DeficiencyReport.objects.select_related("kitchen_station__branch").get(pk=rid)
        broadcast_deficiency_created(r)

    transaction.on_commit(_send)


def schedule_deficiency_status_changed(report) -> None:
    """Transaction commit sonrası eksik listesi durum yayını (KDS refetch ile tutarlı veri)."""

    rid = report.pk

    def _send() -> None:
        from apps.warehouse.models import DeficiencyReport

        r = DeficiencyReport.objects.select_related("kitchen_station__branch").get(pk=rid)
        broadcast_deficiency_status_changed(r)

    transaction.on_commit(_send)


def schedule_kitchen_transfer_status_changed(transfer) -> None:
    """Transfer kaydı commit olduktan sonra mutfak WS yayını."""

    tid = transfer.pk

    def _send() -> None:
        from apps.warehouse.models import WarehouseTransfer

        t = WarehouseTransfer.objects.select_related(
            "deficiency_report__kitchen_station__branch",
        ).get(pk=tid)
        if t.deficiency_report_id:
            broadcast_kitchen_transfer_status_changed(t)

    transaction.on_commit(_send)


def broadcast_deficiency_created(report) -> None:
    """Yeni bir eksik listesi oluşturulduğunda depo tarafına haber verir."""
    channel_layer = get_channel_layer()
    if not channel_layer:
        return

    message = {
        "id": str(report.id),
        "report_number": report.report_number,
        "station_name": report.kitchen_station.name,
        "branch_name": report.kitchen_station.branch.name,
        "created_at": report.created_at.isoformat(),
        "status": report.status,
    }

    # Depo tarafını bilgilendir (şubeye özel + süper kullanıcıların bağlı olduğu global grup)
    branch_id = report.kitchen_station.branch_id
    event = {"type": "deficiency.created", "message": message}
    try:
        async_to_sync(channel_layer.group_send)(
            f"warehouse_notifications_{branch_id}",
            event,
        )
        async_to_sync(channel_layer.group_send)(
            "warehouse_notifications_global",
            event,
        )
    except Exception:
        logger.exception("Warehouse WebSocket broadcast failed for report creation")


def broadcast_deficiency_status_changed(report) -> None:
    """Eksik listesinin durumu değiştiğinde hem depo hem de mutfak (KDS) tarafına haber verir."""
    channel_layer = get_channel_layer()
    if not channel_layer:
        return

    message = {
        "id": str(report.id),
        "report_number": report.report_number,
        "status": report.status,
        "station_id": str(report.kitchen_station_id),
        "branch_id": str(report.kitchen_station.branch_id),
    }

    branch_id = report.kitchen_station.branch_id
    wh_event = {"type": "deficiency.status_changed", "message": message}
    try:
        async_to_sync(channel_layer.group_send)(
            f"warehouse_notifications_{branch_id}",
            wh_event,
        )
        async_to_sync(channel_layer.group_send)(
            "warehouse_notifications_global",
            wh_event,
        )

        broadcast_to_kitchen_ws_groups(
            channel_layer,
            str(branch_id),
            {"type": "deficiency.status_changed", "message": message},
        )
    except Exception:
        logger.exception("Deficiency Status WebSocket broadcast failed")


def broadcast_kitchen_transfer_status_changed(transfer) -> None:
    """
    Eksik listesine bağlı depo transferinin durumu değiştiğinde KDS mutfağına haber verir.
    (Örn. onay → IN_TRANSIT, iptal; tamamlanmada ayrıca deficiency_status_changed gider.)
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    rid = getattr(transfer, "deficiency_report_id", None)
    if not rid:
        return

    try:
        report = getattr(transfer, "deficiency_report", None)
        if report is None:
            from apps.warehouse.models import DeficiencyReport

            report = DeficiencyReport.objects.select_related("kitchen_station").get(pk=rid)
    except Exception:
        logger.exception("Kitchen transfer WS: deficiency report load failed")
        return

    branch_id = report.kitchen_station.branch_id
    message = {
        "deficiency_report_id": str(report.id),
        "transfer_id": str(transfer.id),
        "transfer_number": transfer.transfer_number,
        "status": transfer.status,
        "station_id": str(report.kitchen_station_id),
        "branch_id": str(branch_id),
    }
    try:
        broadcast_to_kitchen_ws_groups(
            channel_layer,
            str(branch_id),
            {"type": "transfer.status_changed", "message": message},
        )
    except Exception:
        logger.exception("Kitchen transfer WebSocket broadcast failed")


def schedule_expiry_transfer_draft_created(transfer, action) -> None:
    """SKT transfer önerisi DRAFT oluşturulduktan sonra depo WS yayını."""
    tid = transfer.pk
    aid = action.pk

    def _send() -> None:
        from apps.inventory.models import ExpiryAction
        from apps.warehouse.models import WarehouseTransfer

        t = WarehouseTransfer.objects.select_related(
            'source_warehouse',
            'source_expiry_action__stock_lot__stock_item',
        ).get(pk=tid)
        a = ExpiryAction.objects.select_related('stock_lot__stock_item').get(pk=aid)
        broadcast_expiry_transfer_draft_created(t, a)

    transaction.on_commit(_send)


def broadcast_expiry_transfer_draft_created(transfer, action) -> None:
    """SKT transfer taslağı oluşturulduğunda depo tarafına haber verir."""
    channel_layer = get_channel_layer()
    if not channel_layer:
        return

    lot = action.stock_lot
    branch = transfer.source_warehouse.branches.filter(is_active=True).order_by('name').first()
    branch_id = branch.id if branch else None

    message = {
        'transfer_id': str(transfer.id),
        'transfer_number': transfer.transfer_number,
        'lot_id': str(lot.id),
        'stock_item_name': lot.stock_item.name,
        'action_id': str(action.id),
    }

    event = {'type': 'expiry.transfer_draft_created', 'message': message}
    try:
        if branch_id:
            async_to_sync(channel_layer.group_send)(
                f'warehouse_notifications_{branch_id}',
                event,
            )
        async_to_sync(channel_layer.group_send)(
            'warehouse_notifications_global',
            event,
        )
    except Exception:
        logger.exception('Expiry transfer draft WebSocket broadcast failed')


def broadcast_procurement_overdue_alert(*, branch_id: str, overdue_count: int) -> None:
    """Geciken satın alma siparişleri için depo WebSocket uyarısı."""
    channel_layer = get_channel_layer()
    if not channel_layer or overdue_count <= 0:
        return

    message = {
        'branch_id': str(branch_id),
        'overdue_orders_count': overdue_count,
    }
    event = {'type': 'procurement.overdue_alert', 'message': message}
    try:
        async_to_sync(channel_layer.group_send)(
            f'warehouse_notifications_{branch_id}',
            event,
        )
        async_to_sync(channel_layer.group_send)(
            'warehouse_notifications_global',
            event,
        )
    except Exception:
        logger.exception('Procurement overdue WebSocket broadcast failed')
