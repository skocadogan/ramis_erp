from datetime import date

from django.db import transaction
from django.utils.translation import gettext as _
from rest_framework.exceptions import ValidationError

from apps.production_planning.models import (
    ProductionPlan,
    ProductionPlanLine,
    ProductionPlanStatus,
)


def copy_production_plan_to_date(source: ProductionPlan, target_date: date, user) -> ProductionPlan:
    """
    Kaynak planı aynı şubede yeni bir tarihe kopyalar (yeni plan taslak, satırlar aktarılır).
    Şube değişmez; çağıran tarafta yetki/şube kapsamı zaten denetlenir.
    """
    if target_date == source.plan_date:
        raise ValidationError(_("Hedef tarih, kaynak planın tarihiyle aynı olamaz."))

    exists = ProductionPlan.objects.filter(
        branch_id=source.branch_id,
        plan_date=target_date,
        is_active=True,
    ).exists()
    if exists:
        raise ValidationError(_("Bu şube ve tarih için zaten bir üretim planı var."))

    with transaction.atomic():
        new_plan = ProductionPlan.objects.create(
            branch_id=source.branch_id,
            plan_date=target_date,
            status=ProductionPlanStatus.DRAFT,
            notes=source.notes or "",
            created_by=user,
            approved_by=None,
            approved_at=None,
        )
        for line in source.lines.filter(is_active=True).order_by("id"):
            ProductionPlanLine.objects.create(
                plan=new_plan,
                product_id=line.product_id,
                target_quantity=line.target_quantity,
                station_id=line.station_id,
                source=line.source,
            )
    return new_plan
