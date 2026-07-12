# Generated manually for soft-delete: liste yalnızca aktif planlar; aynı şube+tarih yeni plan (aktif) eşsizliği

from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ("production_planning", "0001_initial"),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name="productionplan",
            unique_together=set(),
        ),
        migrations.AddConstraint(
            model_name="productionplan",
            constraint=models.UniqueConstraint(
                condition=Q(is_active=True),
                fields=("branch", "plan_date"),
                name="prodplan_uniq_branch_date_active",
            ),
        ),
    ]
