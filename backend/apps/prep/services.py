import logging
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils.translation import gettext as _
from rest_framework.exceptions import ValidationError

from .models import PrepBranchSettings, PrepTask, PrepStatus

logger = logging.getLogger(__name__)

class PrepService:
    @staticmethod
    def _branch_completed_order_items_qs(branch_id: str):
        """Tamamlanmış sipariş kalemleri — yalnızca verilen şubenin gerçek satışları."""
        from apps.orders.models import OrderItem, OrderStatus

        return OrderItem.objects.filter(
            order__branch_id=branch_id,
            order__status=OrderStatus.COMPLETED,
        ).exclude(status=OrderStatus.CANCELLED)

    @staticmethod
    @transaction.atomic
    def upsert_prep_branch_settings(
        branch_id, *, management_hide_old_completed: bool
    ) -> PrepBranchSettings:
        obj, _ = PrepBranchSettings.objects.update_or_create(
            branch_id=branch_id,
            defaults={"management_hide_old_completed": management_hide_old_completed},
        )
        return obj

    @staticmethod
    @transaction.atomic
    def create_prep_task(data: dict) -> PrepTask:
        """Yeni bir hazırlık görevi oluşturur."""
        return PrepTask.objects.create(**data)

    @staticmethod
    @transaction.atomic
    def update_prep_task(task: PrepTask, data: dict) -> PrepTask:
        """Görev bilgilerini günceller."""
        for field, value in data.items():
            setattr(task, field, value)
        task.save()
        return task

    @staticmethod
    @transaction.atomic
    def complete_task(task: PrepTask, user, completed_quantity=None) -> PrepTask:
        """Görevi tamamlandı olarak işaretler."""
        task.status = PrepStatus.COMPLETED
        task.completed_by = user
        if completed_quantity is not None:
            task.completed_quantity = completed_quantity
        else:
            task.completed_quantity = task.target_quantity
        task.save()
        
        # Stok rezervasyonlarını CONSUMED'e çek
        PrepService._deduct_stock_for_completed_task(task)
        
        # WebSocket bildirimi burada tetiklenebilir (ws_broadcast.py üzerinden)
        from core.ws_deferred import schedule_prep_update

        schedule_prep_update(task.branch_id, task.station_id, task_pk=task.pk)

        return task

    @staticmethod
    @transaction.atomic
    def set_status(task: PrepTask, status: str, user=None) -> PrepTask:
        """Görevin durumunu değiştirir."""
        task.status = status
        if status == PrepStatus.COMPLETED:
            task.completed_by = user
            task.completed_quantity = task.target_quantity
        task.save()

        # Stok rezervasyonlarını CONSUMED'e çek
        if status == PrepStatus.COMPLETED:
            PrepService._deduct_stock_for_completed_task(task)
        
        from core.ws_deferred import schedule_prep_update

        schedule_prep_update(task.branch_id, task.station_id, task_pk=task.pk)

        return task

    @staticmethod
    @transaction.atomic
    def record_progress(task: PrepTask, completed_quantity) -> PrepTask:
        """
        Tamamlanan miktarı günceller (görev açıkken kademeli ilerleme).
        Tamamlanmış veya iptal görevlerde kullanılamaz.
        """
        if task.status in (PrepStatus.COMPLETED, PrepStatus.CANCELLED):
            raise ValidationError(
                {"detail": _("Tamamlanmış veya iptal edilmiş görevde ilerleme güncellenemez.")}
            )
        try:
            qty = Decimal(str(completed_quantity))
        except (InvalidOperation, TypeError, ValueError):
            raise ValidationError(
                {"completed_quantity": _("Geçerli bir sayı girin.")}
            )
        if qty < 0:
            raise ValidationError({"completed_quantity": _("Negatif miktar olamaz.")})
        if qty > task.target_quantity:
            raise ValidationError(
                {
                    "completed_quantity": (
                        _("Miktar hedefi (%(target)s) aşamaz.")
                        % {"target": task.target_quantity}
                    )
                }
            )
        task.completed_quantity = qty
        if qty == 0:
            task.status = PrepStatus.PENDING
        else:
            task.status = PrepStatus.IN_PROGRESS
        task.save()

        from core.ws_deferred import schedule_prep_update

        schedule_prep_update(task.branch_id, task.station_id, task_pk=task.pk)
        return task

    @staticmethod
    @transaction.atomic
    def generate_tasks_from_templates() -> int:
        """Aktif şablonlardan günlük görevleri üretir. Dönen: yeni oluşturulan görev sayısı."""
        from .models import PrepTemplate, PrepTask
        from django.utils import timezone
        import datetime

        now_dt = timezone.now()
        today_date = now_dt.date()
        day_of_week = now_dt.strftime('%A').lower() # 'monday', 'tuesday', etc.
        day_field = f"every_{day_of_week}"

        # 1. Bugüne uygun aktif şablonları getir
        filter_kwargs = {
            'is_enabled': True,
            day_field: True,
        }
        # Pasif (soft delete) şablonlar görev üretmesin
        templates = list(
            PrepTemplate.objects.filter(**filter_kwargs, is_active=True).select_related('branch', 'station')
        )
        if not templates:
            return 0

        template_ids = [t.id for t in templates]

        # Bugün bu şablondan üretilmiş HERHANGİ bir görev (aktif veya soft delete):
        # is_active filtrelenmez; aksi halde çöp kutusuna gönderilen kayıt sayılmaz ve aynı gün ikinci kez üretilir.
        template_ids_used_today = set(
            PrepTask.objects.filter(
                created_at__date=today_date,
                source_template_id__in=template_ids,
            ).values_list('source_template_id', flat=True)
        )

        # Eski kayıtlar (source_template boş): (şube, başlık) ile tekil kontrol — yine is_active yok
        legacy_keys = set(
            PrepTask.objects.filter(
                created_at__date=today_date,
                is_recurring=True,
                source_template__isnull=True,
            ).values_list('branch_id', 'title')
        )

        tasks_to_create = []
        affected_branches = set()

        for template in templates:
            if template.id in template_ids_used_today:
                continue
            if (template.branch_id, template.title) in legacy_keys:
                continue
            tasks_to_create.append(
                PrepTask(
                    branch=template.branch,
                    station=template.station,
                    title=template.title,
                    description=template.description,
                    target_quantity=template.target_quantity,
                    unit=template.unit,
                    is_recurring=True,
                    source_template=template,
                    assigned_to=template.assigned_to,
                    product=template.product,
                    deadline=timezone.make_aware(
                        datetime.datetime.combine(today_date, datetime.time(23, 59, 59))
                    ),
                )
            )
            affected_branches.add(template.branch_id)

        if not tasks_to_create:
            return 0

        PrepTask.objects.bulk_create(tasks_to_create)

        # display_name ataması olan şablonlar için PrepTaskAssignment oluştur
        from .models import PrepTaskAssignment
        assignments_to_create = []
        for template in templates:
            if not template.display_name:
                continue
            # bulk_create sonrası oluşturulan task'leri bul
            created_tasks = PrepTask.objects.filter(
                source_template=template,
                created_at__date=now_dt.date(),
            )
            for task in created_tasks:
                assignments_to_create.append(
                    PrepTaskAssignment(prep_task=task, display_name=template.display_name)
                )

        if assignments_to_create:
            PrepTaskAssignment.objects.bulk_create(assignments_to_create)

        from core.ws_deferred import schedule_prep_update

        for branch_id in affected_branches:
            schedule_prep_update(branch_id, refresh_all=True)

        return len(tasks_to_create)

    @staticmethod
    def calculate_smart_prep_suggestions(branch_id: str):
        """Akıllı kurallara göre hazırlık önerileri hesaplar. Geliştirilmiş mantık."""
        from .models import PrepSmartRule
        from django.db.models import Sum
        from django.utils import timezone
        import datetime

        if not branch_id:
            return []

        rules = PrepSmartRule.objects.filter(
            branch_id=branch_id, is_active=True
        ).select_related('base_product')
        suggestions = []
        sales_qs = PrepService._branch_completed_order_items_qs(branch_id)

        today = timezone.now().date()
        # 1. Strateji: Son 4 haftanın aynı günü (Sezonluk/Günlük trend için en iyisi)
        past_dates = [today - datetime.timedelta(weeks=i) for i in range(1, 5)]

        for rule in rules:
            sales_data = sales_qs.filter(
                product=rule.base_product,
                created_at__date__in=past_dates,
            ).values('created_at__date').annotate(daily_total=Sum('quantity'))
            
            total_qty_sold = sum(item['daily_total'] for item in sales_data)
            found_days = len(sales_data)

            if found_days < 2:
                # 2. Strateji (Yetersiz veri): Son 7 günün ortalamasını al
                seven_days_ago = today - datetime.timedelta(days=7)
                recent_sales = sales_qs.filter(
                    product=rule.base_product,
                    created_at__date__gte=seven_days_ago,
                    created_at__date__lt=today,
                ).aggregate(total=Sum('quantity'))['total'] or 0
                avg_sales = float(recent_sales) / 7
            else:
                avg_sales = float(total_qty_sold) / 4 # 4 haftalık ortalama
            
            suggested_qty = avg_sales * float(rule.ratio)

            if suggested_qty > 0:
                suggestions.append({
                    "id": rule.id,
                    "title": rule.title,
                    "base_product_name": rule.base_product.name,
                    "target_item": rule.target_item,
                    "suggested_quantity": round(suggested_qty, 2),
                    "unit": rule.unit,
                    "ratio": float(rule.ratio),
                    "avg_sales": round(avg_sales, 2),
                    "confidence": "high" if found_days >= 2 else "medium"
                })

        return suggestions

    @staticmethod
    def get_rule_discovery_suggestions(branch_id: str):
        """Satış verilerinden yeni kural önerileri keşfeder (şube bazlı)."""
        from .models import PrepSmartRule
        from django.db.models import Sum
        from django.utils import timezone
        import datetime

        if not branch_id:
            return []

        # Son 30 günde bu şubede en çok satılan ilk 10 ürün
        thirty_days_ago = timezone.now() - datetime.timedelta(days=30)
        sales_qs = PrepService._branch_completed_order_items_qs(branch_id)
        top_products = (
            sales_qs.filter(created_at__gte=thirty_days_ago)
            .values('product_id', 'product__name')
            .annotate(total_sold=Sum('quantity'))
            .order_by('-total_sold')[:10]
        )

        # Halihazırda kuralı olan ürünleri filtrele
        existing_product_ids = PrepSmartRule.objects.filter(
            branch_id=branch_id
        ).values_list('base_product_id', flat=True)

        new_suggestions = []
        for item in top_products:
            if item['product_id'] not in existing_product_ids:
                new_suggestions.append({
                    "product_id": item['product_id'],
                    "product_name": item['product__name'],
                    "total_sold_30d": item['total_sold'],
                    "reason": _("Yüksek satış hacmi tespit edildi."),
                })
        
        return new_suggestions

    @staticmethod
    @transaction.atomic
    def _deduct_stock_for_completed_task(task: PrepTask) -> None:
        """PrepTask tamamlanınca stok düşümü ve rezervasyon güncellemesi yapar.

        1. Ürün ve plan_line bilgisini bul (öncelik FK, fallback title/tarih eşleştirmesi)
        2. Reçete ihtiyacını hesapla
        3. Mevcut ACTIVE ProductionReservation'ı CONSUMED'e çek (yeni kayıt oluşturma!)
        4. Fiziksel stoğu düş (StockMovement OUT kaydı oluştur)
        """
        from django.conf import settings

        if not getattr(settings, 'PRODUCTION_STOCK_RESERVATION_ENABLED', False):
            return

        from apps.menu.models import Product
        from apps.production_planning.models import (
            ProductionPlanLine,
            ProductionPlanStatus,
        )
        from apps.inventory.models import ProductionReservation, ProductionReservationStatus
        from apps.inventory.services.recipe_requirements import compute_recipe_requirements
        from apps.inventory.services.stock_movement_service import deduct_stock
        from apps.warehouse.models import Warehouse, WarehouseType
        from decimal import Decimal

        # Öncelikle task.plan_line FK'sını dene
        plan_line = task.plan_line
        product = task.product

        if not plan_line and product:
            # Fallback: task.product üzerinden ProductionPlanLine bul
            plan_line = ProductionPlanLine.objects.filter(
                plan__branch_id=task.branch_id,
                plan__plan_date=task.created_at.date(),
                plan__status=ProductionPlanStatus.APPROVED,
                product=product,
                is_active=True,
            ).first()
            if plan_line:
                # PrepTask'a plan_line FK'sını geri yaz (sonraki sorgular için)
                PrepTask.objects.filter(id=task.id).update(plan_line=plan_line)
                task.plan_line = plan_line

        if not product:
            logger.warning(
                "PrepTask %s has no product FK — trying title match", task.id,
            )
            product = Product.objects.filter(
                name__icontains=task.title,
                is_active=True,
            ).first()

        if not product:
            logger.warning(
                "No product found for task %s (title: %s) — stock deduction skipped",
                task.id, task.title,
            )
            return

        # Mutfak deposunu bul
        kitchen_wh = Warehouse.objects.filter(
            branches__id=task.branch_id,
            warehouse_type=WarehouseType.KITCHEN,
            is_active=True,
        ).first()
        if not kitchen_wh:
            logger.warning(
                "No kitchen warehouse for branch %s — stock deduction skipped",
                task.branch_id,
            )
            return

        wh_id = kitchen_wh.id

        # Reçete ihtiyacını hesapla
        qty_to_deduct = task.completed_quantity or task.target_quantity
        items_to_compute = [{
            "product": product,
            "quantity": qty_to_deduct,
            "portion_multiplier": Decimal("1"),
            "parent_recipe": False,
        }]
        required_by_stock_item = compute_recipe_requirements(items_to_compute)

        if not required_by_stock_item:
            return

        for stock_item_id, qty in required_by_stock_item.items():
            # BUG #1 FİX: Mevcut ACTIVE rezervasyonu bul ve CONSUMED'e çek
            # (update_or_create yerine filter + update + create fallback)
            updated = ProductionReservation.objects.filter(
                plan_line=plan_line,
                stock_item_id=stock_item_id,
                warehouse_id=wh_id,
                status=ProductionReservationStatus.ACTIVE,
                is_active=True,
            ).update(
                status=ProductionReservationStatus.CONSUMED,
                prep_task=task,
                quantity=qty,
            )

            if not updated:
                # ACTIVE kayıt yoksa direkt CONSUMED oluştur
                ProductionReservation.objects.create(
                    plan_line=plan_line,
                    stock_item_id=stock_item_id,
                    warehouse_id=wh_id,
                    prep_task=task,
                    quantity=qty,
                    status=ProductionReservationStatus.CONSUMED,
                )

            # BUG #2 FİX: Fiziksel stok düşümü — StockMovement OUT kaydı oluştur
            try:
                deduct_stock(
                    warehouse_id=wh_id,
                    stock_item_id=stock_item_id,
                    quantity=qty,
                    reference=f"prep_task_{task.id}",
                    notes=_("PrepTask tamamlanmasıyla stok düşümü: %(task_title)s") % {
                        "task_title": task.title,
                    },
                    movement_type='OUT',
                    allow_negative=True,  # Mutfak stoğu eksiye düşebilir
                )
            except Exception:
                logger.exception(
                    "Physical stock deduction failed for prep task %s "
                    "(stock_item=%s, qty=%s) — reservation CONSUMED but stock not deducted",
                    task.id, stock_item_id, qty,
                )

        logger.info(
            "CONSUMED %d reservation(s) and deducted stock for prep task %s (plan_line=%s)",
            len(required_by_stock_item), task.id, plan_line.id if plan_line else None,
        )
