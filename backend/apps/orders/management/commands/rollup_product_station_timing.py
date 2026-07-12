"""Son tamamlanmış kalemlerden ProductStationTimingStats EMA günceller (Smart Firing v3+)."""


from collections import defaultdict
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.orders.models import OrderItem, OrderStatus, ProductStationTimingStats

# Yeni örneğin ağırlığı; EMA_t = alpha * x + (1-alpha) * EMA_{t-1}
_ALPHA = 0.25
_MAX_OBS_MINUTES = 180


class Command(BaseCommand):
    help = 'READY kalemler için ürün×istasyon süre EMA rollup (manuel / Celery).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--since-hours',
            type=int,
            default=24,
            help='Kaç saat geriye bakılsın (varsayılan 24).',
        )

    def handle(self, *args, **options):
        since = timezone.now() - timedelta(hours=int(options['since_hours']))
        # Üst kalem (satış satırı) READY veya tamamlanan siparişle birlikte COMPLETED kalemler
        qs = (
            OrderItem.objects.filter(
                parent_item__isnull=True,
                station_id__isnull=False,
                updated_at__gte=since,
                status__in=[OrderStatus.READY, OrderStatus.COMPLETED, OrderStatus.DELIVERED],
            )
            .exclude(status=OrderStatus.CANCELLED)
            .only('id', 'branch_id', 'product_id', 'station_id', 'created_at', 'updated_at')
        )
        buckets: dict[tuple, list[int]] = defaultdict(list)
        for row in qs.iterator(chunk_size=500):
            delta = row.updated_at - row.created_at
            minutes = max(1, min(_MAX_OBS_MINUTES, int(delta.total_seconds() // 60)))
            key = (row.branch_id, row.product_id, row.station_id)
            buckets[key].append(minutes)

        updated = 0
        with transaction.atomic():
            for (branch_id, product_id, station_id), samples in buckets.items():
                if not samples:
                    continue
                batch_mean = sum(samples) / len(samples)
                obj, created = ProductStationTimingStats.objects.get_or_create(
                    branch_id=branch_id,
                    product_id=product_id,
                    station_id=station_id,
                    defaults={'ema_minutes': batch_mean, 'sample_count': len(samples)},
                )
                if created:
                    updated += 1
                    continue
                locked = ProductStationTimingStats.objects.select_for_update().get(pk=obj.pk)
                old_ema = float(locked.ema_minutes) if locked.sample_count else batch_mean
                new_ema = _ALPHA * batch_mean + (1 - _ALPHA) * old_ema
                locked.ema_minutes = new_ema
                locked.sample_count = locked.sample_count + len(samples)
                locked.save(update_fields=['ema_minutes', 'sample_count', 'updated_at'])
                updated += 1

        self.stdout.write(self.style.SUCCESS(f'ProductStationTimingStats güncellendi/gruplandı: {updated} kayıt.'))
