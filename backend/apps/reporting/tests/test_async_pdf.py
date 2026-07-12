"""Tests for async PDF export flow."""
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.core.cache import cache
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


class AsyncPdfExportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_superuser(
            username="testadmin", password="testpass123", email="testadmin@example.com"
        )
        self.client.force_authenticate(user=self.user)
        self.base_url = "/api/v1/reporting/module-reports"

    def tearDown(self):
        cache.delete("pdf:export:test-key")
        cache.delete("pdf:export:nonexistent")

    def test_async_generate_returns_202_with_cache_key(self):
        with patch("apps.reporting.async_service.enqueue_pdf_export") as mock_enqueue:
            mock_enqueue.return_value = {
                "task_id": "abc123",
                "cache_key": "pdf:export:test-key",
                "status": "processing",
            }
            response = self.client.post(
                f"{self.base_url}/sales-list/generate/?async=true",
                {"params": {}},
                format="json",
            )
        self.assertEqual(response.status_code, 202)
        self.assertIn("cache_key", response.data)
        self.assertIn("task_id", response.data)
        self.assertEqual(response.data["status"], "processing")
        mock_enqueue.assert_called_once()

    def test_sync_generate_still_works(self):
        response = self.client.post(
            f"{self.base_url}/sales-list/generate/?async=false",
            {"params": {}},
            format="json",
        )
        self.assertNotEqual(response.status_code, 202)

    def test_export_status_returns_processing(self):
        cache.set(
            "pdf:export:test-key",
            {"status": "processing", "task_id": "abc123"},
            timeout=600,
        )
        response = self.client.get(
            f"{self.base_url}/export-status/",
            {"cache_key": "pdf:export:test-key"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "processing")
        cache.delete("pdf:export:test-key")

    def test_export_status_returns_not_found_for_missing_key(self):
        response = self.client.get(
            f"{self.base_url}/export-status/",
            {"cache_key": "pdf:export:nonexistent"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "not_found")

    def test_export_status_missing_cache_key_param(self):
        response = self.client.get(
            f"{self.base_url}/export-status/",
        )
        self.assertEqual(response.status_code, 400)

    @override_settings(PDF_EXPORT_ASYNC_ENABLED=False)
    def test_async_disabled_returns_503(self):
        response = self.client.post(
            f"{self.base_url}/sales-list/generate/?async=true",
            {"params": {}},
            format="json",
        )
        self.assertEqual(response.status_code, 503)

    def test_async_nonexistent_report_returns_404(self):
        response = self.client.post(
            f"{self.base_url}/nonexistent-report/generate/?async=true",
            {"params": {}},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
