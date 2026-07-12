import logging

from django.utils.translation import gettext as _

logger = logging.getLogger(__name__)


def create_reservations_for_plan(plan):
    """
    Onaylanan üretim planındaki her satır için reçete ihtiyaçlarını hesaplar
    ve ilgili mutfak istasyonunun deposunda ProductionReservation (ACTIVE) olarak kaydeder.

    Depo çözümleme sırası (her satır için):
      1. line.station.warehouse
      2. line.product.category.station.warehouse
      3. branch seviyesinde KITCHEN tipi depo
      4. Varsayılan depo (get_default_warehouse)

    prep_task=NULL olarak kaydedilir — PrepTask tamamlanınca
    _deduct_stock_for_completed_task() bu kayıtları bulup CONSUMED yapacak.
    """
    from decimal import Decimal

    from apps.production_planning.models import ProductionPlanLine
    from apps.inventory.models import ProductionReservation, ProductionReservationStatus
    from apps.inventory.services.recipe_requirements import compute_recipe_requirements
    from apps.warehouse.models import Warehouse, WarehouseType

    lines = plan.lines.filter(is_active=True).select_related(
        'product__recipe',
        'product__category__station__warehouse',
        'station__warehouse',
    ).prefetch_related(
        'product__recipe__ingredients__stock_item',
    )

    if not lines:
        return

    # Branch seviyesinde fallback depo (hiçbir istasyonun deposu yoksa kullanılır)
    fallback_wh = Warehouse.objects.filter(
        branches__id=plan.branch_id,
        warehouse_type=WarehouseType.KITCHEN,
        is_active=True,
    ).first()

    if not fallback_wh:
        logger.warning(
            "No kitchen warehouse for plan %s branch, falling back to default warehouse",
            plan.id,
        )
        from apps.inventory.services._helpers import get_default_warehouse
        fallback_wh = get_default_warehouse()

    if not fallback_wh:
        logger.warning(
            "Cannot create reservations for plan %s: no warehouse found at all",
            plan.id,
        )
        return

    # Mevcut ACTIVE rezervasyonları kontrol et (aynı plan için daha önce oluşturulmuş mu?)
    existing_keys = set(
        ProductionReservation.objects.filter(
            plan_line__plan=plan,
            status=ProductionReservationStatus.ACTIVE,
            is_active=True,
        ).values_list('plan_line_id', 'stock_item_id')
    )

    reservations_to_create = []

    for line in lines:
        # Her satır için hangi depoda üretileceğini çöz
        station = line.station or getattr(line.product.category, 'station', None)
        wh = getattr(station, 'warehouse', None) if station else None
        line_wh_id = wh.id if wh else fallback_wh.id

        # Her plan satırı için ayrı reçete hesabı
        line_items = [{
            "product": line.product,
            "quantity": line.target_quantity,
            "portion_multiplier": Decimal("1"),
            "parent_recipe": False,
        }]
        line_requirements = compute_recipe_requirements(line_items)

        if not line_requirements:
            continue

        for stock_item_id, required_qty in line_requirements.items():
            key = (str(line.id), str(stock_item_id))
            if key in existing_keys:
                continue

            reservations_to_create.append(
                ProductionReservation(
                    plan_line=line,
                    stock_item_id=stock_item_id,
                    warehouse_id=line_wh_id,
                    quantity=required_qty,
                    status=ProductionReservationStatus.ACTIVE,
                    prep_task=None,
                )
            )

    if reservations_to_create:
        created = ProductionReservation.objects.bulk_create(reservations_to_create)
        logger.info(
            "Created %d production reservations for plan %s",
            len(created), plan.id,
        )


def sync_availability_for_plan(plan, user=None):
    """
    Üretim planındaki her satır için ProductDayAvailability kaydını
    upsert eder (yoksa oluşturur, varsa günceller).

    - mode = LIMITED (üretim planı kadar porsiyon satışa sunulur)
    - remaining_portions = line.target_quantity
    - user: onay/upsert akışında set_by alanına yazılır. None ise plan.approved_by kullanılır.
    """
    from decimal import Decimal
    from apps.production_planning.models import ProductDayAvailability, AvailabilityMode

    lines = plan.lines.filter(is_active=True)

    if not lines:
        return

    updated_count = 0
    created_count = 0

    set_by = user or plan.approved_by

    for line in lines:
        availability, created = ProductDayAvailability.objects.update_or_create(
            branch_id=plan.branch_id,
            product_id=line.product_id,
            effective_date=plan.plan_date,
            defaults={
                'is_active': True,
                'mode': AvailabilityMode.LIMITED,
                'remaining_portions': line.target_quantity,
                'reason': _('Üretim planından otomatik oluşturuldu'),
                'set_by': set_by,
            },
        )
        if created:
            created_count += 1
        else:
            updated_count += 1

    # WebSocket broadcast — menü kataloğunu güncelle
    from apps.menu.ws_broadcast import broadcast_menu_catalog_refresh
    broadcast_menu_catalog_refresh(
        reason="production_plan_approved",
        branch_id=str(plan.branch_id),
    )

    logger.info(
        "Synced %d product availabilities for plan %s (created=%d, updated=%d)",
        len(lines), plan.id, created_count, updated_count,
    )
