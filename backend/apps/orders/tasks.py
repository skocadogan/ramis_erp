"""
Smart Firing v2 — Celery entegrasyonu.

Periyodik EMA güncellemesi: Beat schedule 03:15 (`rollup-product-station-timing-nightly`).
"""

from celery import shared_task

from core.celery_task_options import MAINTENANCE_TASK_OPTIONS


@shared_task(name='apps.orders.tasks.roll_up_product_station_timing_stats', **MAINTENANCE_TASK_OPTIONS)
def roll_up_product_station_timing_stats():
    """Ürün×istasyon EMA rollup — yönetim komutunu çağırır."""
    from django.core.management import call_command

    call_command('rollup_product_station_timing')


@shared_task(
    name='apps.orders.tasks.broadcast_kds_refresh_task',
    bind=True,
    max_retries=3,
    default_retry_delay=5,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def broadcast_kds_refresh_task(self, branch_id, reason="unknown", **extra):
    """KDS yenileme sinyalini senkron olarak gönderir (Celery worker içinde çalışır)."""
    from apps.orders.ws_broadcast import _broadcast_kds_refresh_now
    _broadcast_kds_refresh_now(branch_id, reason, **extra)


@shared_task(
    name='apps.orders.tasks.broadcast_kitchen_order_status_changed_task',
    bind=True,
    max_retries=3,
    default_retry_delay=5,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def broadcast_kitchen_order_status_changed_task(self, branch_id, message):
    """Sipariş durumu değişiklik sinyalini senkron olarak gönderir (Celery worker içinde çalışır)."""
    from apps.orders.ws_broadcast import _broadcast_kitchen_order_status_changed_now
    _broadcast_kitchen_order_status_changed_now(branch_id, message)


@shared_task(name='apps.orders.tasks.auto_close_active_tables_task', **MAINTENANCE_TASK_OPTIONS)
def auto_close_active_tables_task():
    """Hesabı kapanmamış masaların hesaplarını kapatır, sipariş ve satış notlarına otomatik kapama notu yazar.

    Optimized: batch-loads tables and orders to eliminate N+1 queries.
    """
    import logging
    from collections import defaultdict
    from django.utils import timezone
    from django.utils.translation import gettext as _
    from apps.branches.models import Table, TableStatus
    from apps.orders.models import Order, OrderStatus
    from apps.orders.services import OrderService
    from apps.branches.services import TableService
    from apps.sales.models import Sale
    from apps.audit.models import AuditLog

    logger = logging.getLogger("django")

    from apps.orders.order_scope import OPEN_ORDER_STATUSES

    # Batch-load table IDs with active orders (single query)
    active_order_table_ids = set(
        Order.objects.filter(
            status__in=OPEN_ORDER_STATUSES,
            table_id__isnull=False,
        ).values_list('table_id', flat=True).distinct()
    )

    # Batch-load occupied table IDs (single query)
    occupied_table_ids = set(
        Table.objects.filter(status=TableStatus.OCCUPIED).values_list('id', flat=True)
    )
    table_ids = active_order_table_ids | occupied_table_ids

    if not table_ids:
        return {"closed_tables_count": 0}

    # Batch-load ALL tables in one query (eliminates per-table query)
    tables_qs = Table.objects.select_related('zone__branch').filter(pk__in=table_ids)
    tables_by_id = {t.id: t for t in tables_qs}

    # Batch-load ALL orders for these tables in one query (eliminates per-table order query)
    orders_qs = Order.objects.filter(
        table_id__in=table_ids,
        status__in=OPEN_ORDER_STATUSES,
    ).select_related('table', 'branch')

    # Group orders by table in memory
    orders_by_table = defaultdict(list)
    for order in orders_qs:
        orders_by_table[order.table_id].append(order)

    closed_count = 0
    note_text = _("Sistem tarafından OTOMATİK kapama")
    auto_close_ts = timezone.now()
    audit_records = []

    for table_id in table_ids:
        try:
            table = tables_by_id.get(table_id)
            if table is None:
                continue

            if table_id in active_order_table_ids:
                orders = orders_by_table.get(table_id, [])
                if not orders:
                    continue

                # Update notes for all orders (single query per table)
                Order.objects.filter(pk__in=[o.pk for o in orders]).update(notes=note_text)

                # Build audit records for auto_close_initiated
                for order in orders:
                    before_state = {"status": order.status, "notes": order.notes or ""}
                    after_state = {"status": order.status, "notes": note_text}
                    audit_records.append(AuditLog(
                        action="order.auto_close_initiated",
                        target_type=f"{order._meta.app_label}.{order._meta.model_name}",
                        target_id=str(order.pk),
                        branch=getattr(order, 'branch', None),
                        before_json=before_state,
                        after_json=after_state,
                        metadata={
                            "reason": "auto_close",
                            "table_id": str(table_id),
                            "table_name": table.name if table else None,
                            "auto_close_ts": auto_close_ts.isoformat(),
                        },
                    ))

                # Delegate to service for full business logic (sale creation, inventory, etc.)
                order_ids = OrderService.complete_table(
                    table_id=table_id,
                    payment_method='CASH',
                    user=None
                )

                if order_ids:
                    Sale.objects.filter(order_id__in=order_ids).update(notes=note_text)

                    # Build audit records for completed orders
                    completed_orders = Order.objects.filter(pk__in=order_ids).select_related('branch')
                    for order in completed_orders:
                        audit_records.append(AuditLog(
                            action="order.auto_closed",
                            target_type=f"{order._meta.app_label}.{order._meta.model_name}",
                            target_id=str(order.pk),
                            branch=getattr(order, 'branch', None),
                            before_json={"status": "PENDING/PREPARING/READY"},
                            after_json={"status": order.status, "notes": note_text},
                            metadata={
                                "reason": "auto_close",
                                "payment_method": "CASH",
                                "table_id": str(table_id),
                                "table_name": table.name if table else None,
                            },
                        ))
            else:
                # Occupied table without active orders
                before_status = table.status
                TableService.close_table(table_id)

                # Audit: siparişsiz dolu masa kapatma kaydı
                audit_records.append(AuditLog(
                    action="table.auto_closed",
                    target_type=f"{table._meta.app_label}.{table._meta.model_name}",
                    target_id=str(table.pk),
                    branch=getattr(getattr(table, 'zone', None), 'branch', None),
                    before_json={"status": before_status},
                    after_json={"status": "FREE"},
                    metadata={
                        "reason": "auto_close",
                        "had_active_orders": False,
                    },
                ))

            closed_count += 1
        except Exception as e:
            logger.exception(f"Masa kapatma hatası (Masa ID: {table_id}): {e}")

    # Bulk-create all audit records (single query instead of N)
    if audit_records:
        AuditLog.objects.bulk_create(audit_records, batch_size=500)

    return {"closed_tables_count": closed_count}

