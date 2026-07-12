# Generated manually for branch-scoped menu tags

import django.db.models.deletion
from django.db import migrations, models


def assign_default_branch(apps, schema_editor):
    Branch = apps.get_model('branches', 'Branch')
    MenuTag = apps.get_model('menu', 'MenuTag')
    MenuCatalogSettings = apps.get_model('menu', 'MenuCatalogSettings')
    branch = Branch.objects.order_by('created_at').first()
    if not branch:
        return
    MenuTag.objects.filter(branch__isnull=True).update(branch_id=branch.id)
    for row in MenuCatalogSettings.objects.filter(branch__isnull=True):
        if not MenuCatalogSettings.objects.filter(branch_id=branch.id).exclude(pk=row.pk).exists():
            row.branch_id = branch.id
            row.save(update_fields=['branch_id'])
        else:
            row.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('branches', '0001_initial'),
        ('menu', '0027_menu_tags'),
    ]

    operations = [
        migrations.AddField(
            model_name='menutag',
            name='branch',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='menu_tags',
                to='branches.branch',
                verbose_name='Şube',
            ),
        ),
        migrations.AddField(
            model_name='menucatalogsettings',
            name='branch',
            field=models.OneToOneField(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='menu_catalog_settings',
                to='branches.branch',
                verbose_name='Şube',
            ),
        ),
        migrations.RunPython(assign_default_branch, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='menutag',
            name='branch',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='menu_tags',
                to='branches.branch',
                verbose_name='Şube',
            ),
        ),
        migrations.AlterField(
            model_name='menucatalogsettings',
            name='branch',
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='menu_catalog_settings',
                to='branches.branch',
                verbose_name='Şube',
            ),
        ),
        migrations.AlterField(
            model_name='menutag',
            name='name',
            field=models.CharField(max_length=100, verbose_name='Etiket Adı'),
        ),
        migrations.AddConstraint(
            model_name='menutag',
            constraint=models.UniqueConstraint(
                fields=('branch', 'name'),
                name='menu_menutag_branch_name_uniq',
            ),
        ),
    ]
