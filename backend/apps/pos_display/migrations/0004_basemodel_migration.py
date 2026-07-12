"""
PERF-3: DisplaySettings ve PromotionSlide modellerini BaseModel ile hizala.

DisplaySettings için değişiklikler:
  - id: BigAutoField → UUIDField (primary key)
  - last_updated (auto_now) → updated_at
  - created_at eklendi (auto_now_add)
  - is_active eklendi

PromotionSlide için değişiklikler:
  - id: BigAutoField → UUIDField (primary key)
  - is_active verbose_name kaldırıldı (BaseModel alanıyla hizalandı)

PostgreSQL: bigint → uuid düz `ALTER ... USING (id::uuid)` ile mümkün değildir; PK
yeniden inşa edilir. SQLite/ORM: Django'nun orijinal AlterField (tablo kopyalama) yolu.
"""
import uuid

import django.utils.timezone
from django.db import connection, migrations, models
from django.db.migrations import Migration
from django.db.migrations.loader import MigrationLoader

MIG_0003 = "0003_displaysettings_order_success_subtitle_and_more"

# Django varsayılan tablo adları
T_DISPLAY = "pos_display_displaysettings"
T_SLIDE = "pos_display_promotionslide"


def _state_operations():
    return [
        migrations.AlterField(
            model_name="displaysettings",
            name="id",
            field=models.UUIDField(
                primary_key=True,
                serialize=False,
                default=uuid.uuid4,
                editable=False,
            ),
        ),
        migrations.RenameField(
            model_name="displaysettings",
            old_name="last_updated",
            new_name="updated_at",
        ),
        migrations.AddField(
            model_name="displaysettings",
            name="created_at",
            field=models.DateTimeField(default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="displaysettings",
            name="is_active",
            field=models.BooleanField(default=True),
        ),
        migrations.AlterField(
            model_name="promotionslide",
            name="id",
            field=models.UUIDField(
                primary_key=True,
                serialize=False,
                default=uuid.uuid4,
                editable=False,
            ),
        ),
        migrations.AlterField(
            model_name="promotionslide",
            name="is_active",
            field=models.BooleanField(default=True),
        ),
    ]


def _pg_pkey_name(cursor, table: str) -> str:
    cursor.execute(
        """
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = %s AND c.contype = 'p'
        """,
        [table],
    )
    row = cursor.fetchone()
    if not row:
        msg = f"PostgreSQL: {table} için birincil anahtar kısıtı bulunamadı"
        raise RuntimeError(msg)
    return row[0]


def _apply_postgresql_only(schema_editor) -> None:
    qn = connection.ops.quote_name
    t_ds = qn(T_DISPLAY)
    t_sl = qn(T_SLIDE)
    with connection.cursor() as cursor:
        # DisplaySettings
        cursor.execute(
            f"ALTER TABLE {t_ds} DROP CONSTRAINT {qn(_pg_pkey_name(cursor, T_DISPLAY))}"
        )
        cursor.execute(f"ALTER TABLE {t_ds} RENAME COLUMN {qn('id')} TO {qn('id_old')}")
        cursor.execute(f"ALTER TABLE {t_ds} ADD COLUMN {qn('id')} uuid")
        cursor.execute(f"UPDATE {t_ds} SET {qn('id')} = gen_random_uuid()")
        cursor.execute(f"ALTER TABLE {t_ds} ALTER COLUMN {qn('id')} SET NOT NULL")
        cursor.execute(f"ALTER TABLE {t_ds} DROP COLUMN {qn('id_old')}")
        cursor.execute(f"ALTER TABLE {t_ds} ADD PRIMARY KEY ({qn('id')})")
        cursor.execute(
            f"ALTER TABLE {t_ds} RENAME COLUMN {qn('last_updated')} TO {qn('updated_at')}"
        )
        cursor.execute(
            f"ALTER TABLE {t_ds} ADD COLUMN {qn('created_at')} timestamptz NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')"
        )
        cursor.execute(
            f"ALTER TABLE {t_ds} ALTER COLUMN {qn('created_at')} DROP DEFAULT"
        )
        cursor.execute(
            f"ALTER TABLE {t_ds} ADD COLUMN {qn('is_active')} boolean NOT NULL DEFAULT true"
        )

        # PromotionSlide
        cursor.execute(
            f"ALTER TABLE {t_sl} DROP CONSTRAINT {qn(_pg_pkey_name(cursor, T_SLIDE))}"
        )
        cursor.execute(f"ALTER TABLE {t_sl} RENAME COLUMN {qn('id')} TO {qn('id_old')}")
        cursor.execute(f"ALTER TABLE {t_sl} ADD COLUMN {qn('id')} uuid")
        cursor.execute(f"UPDATE {t_sl} SET {qn('id')} = gen_random_uuid()")
        cursor.execute(f"ALTER TABLE {t_sl} ALTER COLUMN {qn('id')} SET NOT NULL")
        cursor.execute(f"ALTER TABLE {t_sl} DROP COLUMN {qn('id_old')}")
        cursor.execute(f"ALTER TABLE {t_sl} ADD PRIMARY KEY ({qn('id')})")


def _apply_database(apps, schema_editor) -> None:
    vendor = schema_editor.connection.vendor
    if vendor == "postgresql":
        _apply_postgresql_only(schema_editor)
        return

    # SQLite ve diğer: Django'nun ürettiği AlterField (tablo kopyalama) yolu
    loader = MigrationLoader(schema_editor.connection, replace_migrations=True)
    key_0003 = ("pos_display", MIG_0003)
    if key_0003 not in loader.graph.nodes:
        msg = f"Yüklü graph’ta yok: {key_0003!r} — build_graph hatası mı var?"
        raise RuntimeError(msg)
    state = loader.graph.make_state(
        [key_0003], at_end=True, real_apps=loader.unmigrated_apps
    )

    class _DbOnlyMigration(Migration):
        atomic = False
        operations = []

    m = _DbOnlyMigration("0004_basemodel_migration", "pos_display")
    m.operations = _state_operations()
    m.apply(state, schema_editor)


class Migration(migrations.Migration):
    dependencies = [
        ("pos_display", "0003_displaysettings_order_success_subtitle_and_more"),
        ("branches", "0011_kitchenstation_warehouse"),
    ]

    # SQLite PK değişikliği tablo yeniden oluşturmayı gerektirebilir; PG’de büyük DDL
    atomic = False

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=_state_operations(),
            database_operations=[
                migrations.RunPython(
                    _apply_database, reverse_code=None, atomic=False
                ),
            ],
        )
    ]
