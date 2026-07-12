"""Redis bakım servisi testleri."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from core.redis_maintenance import (
    RedisTargetStats,
    _clean_cache_db,
    _clean_celery_result_meta_by_idle,
    _clean_channels_without_ttl,
    run_redis_maintenance,
)


class RedisMaintenanceUnitTests(SimpleTestCase):
    def test_clean_celery_meta_by_idle_deletes_stale_only(self):
        client = MagicMock()
        client.scan.side_effect = [
            (0, [b"celery-task-meta-abc", b"celery-task-meta-fresh"]),
        ]
        client.object.side_effect = [7200, 30]

        stats = RedisTargetStats()
        _clean_celery_result_meta_by_idle(
            client, stats, dry_run=False, max_idle_seconds=3600
        )

        self.assertEqual(stats.scanned, 2)
        self.assertEqual(stats.deleted, 1)
        client.pipeline.return_value.execute.assert_called_once()

    def test_clean_channels_deletes_keys_without_ttl(self):
        client = MagicMock()
        client.scan.side_effect = [(0, [b"asgi:group:foo", b"asgi:group:bar"])]
        client.ttl.side_effect = [-1, 120]

        stats = RedisTargetStats()
        _clean_channels_without_ttl(client, stats, dry_run=False)

        self.assertEqual(stats.deleted, 1)

    @override_settings(
        REDIS_URL="redis://127.0.0.1:6379/0",
        REDIS_BROKER_URL="redis://127.0.0.1:6379/0",
        REDIS_CACHE_URL="redis://127.0.0.1:6379/1",
        REDIS_CHANNELS_URL="redis://127.0.0.1:6379/2",
        REDIS_MAINTENANCE_ENABLED=True,
    )
    @patch("core.redis_maintenance._make_client")
    @patch("core.redis_maintenance._current_rbac_version", return_value=5)
    @patch("core.redis_maintenance._current_sales_summary_generation", return_value=10)
    def test_clean_cache_db_prunes_old_generations(
        self, _sales_gen, _rbac_ver, make_client_mock
    ):
        client = MagicMock()
        make_client_mock.return_value = client
        client.scan.side_effect = [
            (
                0,
                [
                    b":1:rbac:user_perms:v3:42",
                    b":1:rbac:user_perms:v5:99",
                    b":1:sales_summary_7_seg_2026-05-30",
                    b":1:sales_summary_10_seg_2026-05-30",
                    b":1:branch_order_num:br1:2026-05-01",
                    b":1:branch_order_num:br1:2026-05-29",
                    b":1:rbac:perms_version",
                ],
            ),
        ]

        stats = RedisTargetStats()
        _clean_cache_db(
            client,
            stats,
            dry_run=False,
            order_counter_retention_days=3,
            rbac_versions_to_keep=2,
            sales_generations_to_keep=3,
        )

        self.assertEqual(stats.skipped_protected, 1)
        self.assertEqual(stats.deleted, 3)

    @override_settings(REDIS_MAINTENANCE_ENABLED=False)
    def test_run_skipped_when_disabled(self):
        report = run_redis_maintenance()
        self.assertTrue(report["skipped"])
        self.assertEqual(report["reason"], "REDIS_MAINTENANCE_ENABLED=false")

    @override_settings(REDIS_URL="", REDIS_BROKER_URL="")
    def test_run_skipped_without_redis(self):
        report = run_redis_maintenance()
        self.assertTrue(report["skipped"])
