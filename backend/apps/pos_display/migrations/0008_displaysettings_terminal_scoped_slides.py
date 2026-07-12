# Generated manually — şube varsayılanı + POS terminali başına müşteri ekranı ayarı; slaytlar opsiyonel terminal.

import django.db.models.deletion
from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ("pos_display", "0007_pos_terminal"),
    ]

    operations = [
        migrations.AlterField(
            model_name="displaysettings",
            name="branch",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="display_settings",
                to="branches.branch",
            ),
        ),
        migrations.AddField(
            model_name="displaysettings",
            name="pos_terminal",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="display_settings",
                to="pos_display.posterminal",
                verbose_name="POS terminali",
                help_text="Boş bırakılırsa şube varsayılanıdır.",
            ),
        ),
        migrations.AddField(
            model_name="promotionslide",
            name="pos_terminal",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="promotion_slides",
                to="pos_display.posterminal",
                verbose_name="POS terminali",
                help_text="Boş ise şube geneli tüm müşteri ekranlarında gösterilir.",
            ),
        ),
        migrations.AddConstraint(
            model_name="displaysettings",
            constraint=models.UniqueConstraint(
                condition=Q(pos_terminal__isnull=True),
                fields=("branch",),
                name="pos_display_displaysettings_branch_default_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="displaysettings",
            constraint=models.UniqueConstraint(
                condition=Q(pos_terminal__isnull=False),
                fields=("branch", "pos_terminal"),
                name="pos_display_displaysettings_branch_terminal_uniq",
            ),
        ),
    ]
