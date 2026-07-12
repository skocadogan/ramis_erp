from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("menu", "0004_category_station"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="show_on_pos",
            field=models.BooleanField(default=True, verbose_name="POS'ta göster"),
        ),
    ]
