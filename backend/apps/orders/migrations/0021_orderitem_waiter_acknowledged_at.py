from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0020_add_branch_denormalize'),
    ]

    operations = [
        migrations.AddField(
            model_name='orderitem',
            name='waiter_acknowledged_at',
            field=models.DateTimeField(
                blank=True,
                help_text='READY kalem garson tarafından görüldü işaretlendiğinde set edilir; teslim (DELIVERED) ayrıdır.',
                null=True,
                verbose_name='Garson mutfak bildiriminde görüldü',
            ),
        ),
    ]
