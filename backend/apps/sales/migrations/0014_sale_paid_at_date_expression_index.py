# K-4: paid_at__date filtresi için expression index
# PostgreSQL'de DATE(paid_at) fonksiyonu indeks kullanamaz;
# expression index ile bu sorgular hızlanır.
# NOT: SQLite test veritabanında çalışmaz, sadece PostgreSQL'de uygulanır.

from django.conf import settings
from django.db import migrations


def create_expression_index(apps, schema_editor):
    """Sadece PostgreSQL'de expression index oluştur."""
    if schema_editor.connection.vendor != 'postgresql':
        return
    # paid_at timestamptz olduğu için ::date STABLE olur (IMMUTABLE değil).
    # PostgreSQL expression index için IMMUTABLE fonksiyon gerektirir.
    # AT TIME ZONE ile sabit timezone kullanarak ifadeyi IMMUTABLE yapar.
    # TIME_ZONE ayarı değişirse, indeksin yeniden oluşturulması gerekir.
    tz = settings.TIME_ZONE
    schema_editor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_sales_sale_paid_at_date "
        f"ON sales_sale (((paid_at AT TIME ZONE {tz!r})::date)) "
        f"WHERE is_deleted = false;"
    )


def drop_expression_index(apps, schema_editor):
    """Sadece PostgreSQL'de expression index kaldır."""
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute(
        "DROP INDEX IF EXISTS idx_sales_sale_paid_at_date;"
    )


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0013_sale_sales_sale_del_br_paidat_idx'),
    ]

    operations = [
        migrations.RunPython(
            create_expression_index,
            reverse_code=drop_expression_index,
        ),
    ]
