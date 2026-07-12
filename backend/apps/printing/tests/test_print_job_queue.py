from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.branches.models import Branch, KitchenStation
from apps.printing.models import PrintJob, PrintJobStatus, Printer, UsageType
from apps.printing.services.print_job_dispatch import enqueue_print_job
from apps.printing.tasks import maintain_print_job_queue


class MaintainPrintJobQueueTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Test Şube", code="TST")
        self.station = KitchenStation.objects.create(
            branch=self.branch,
            name="Ana Mutfak",
            code="ana",
        )
        self.printer = Printer.objects.create(
            branch=self.branch,
            name="Mutfak",
            connection_type="NETWORK",
            ip_address="192.168.1.50",
            port=9100,
            usage_type=UsageType.KITCHEN,
            kitchen_station=self.station,
            receipt_template_slug="kitchen-default",
        )

    def _create_job(self, status: str, *, age_seconds: int = 120) -> PrintJob:
        job = PrintJob.objects.create(
            printer=self.printer,
            receipt_slug="kitchen-default",
            context={"items": []},
            status=status,
        )
        PrintJob.objects.filter(pk=job.pk).update(
            created_at=timezone.now() - timedelta(seconds=age_seconds),
            updated_at=timezone.now() - timedelta(seconds=age_seconds),
        )
        job.refresh_from_db()
        return job

    @override_settings(
        PRINT_JOB_REQUEUE_PENDING_SECONDS=60,
        PRINT_JOB_STALE_PROCESSING_SECONDS=90,
        PRINT_JOB_MAINTENANCE_BATCH_SIZE=10,
    )
    @patch("apps.printing.tasks.execute_receipt_print_job.delay")
    def test_requeues_old_pending_jobs(self, mock_delay):
        job = self._create_job(PrintJobStatus.PENDING, age_seconds=120)

        maintain_print_job_queue()

        mock_delay.assert_called_once_with(str(job.id))

    @override_settings(
        PRINT_JOB_REQUEUE_PENDING_SECONDS=60,
        PRINT_JOB_STALE_PROCESSING_SECONDS=90,
    )
    def test_fails_stale_processing_jobs(self):
        job = self._create_job(PrintJobStatus.PROCESSING, age_seconds=200)

        maintain_print_job_queue()

        job.refresh_from_db()
        self.assertEqual(job.status, PrintJobStatus.FAILED)
        self.assertIn("zaman aşımı", job.error_message.lower())

    @patch("apps.printing.tasks.execute_receipt_print_job.delay")
    def test_enqueue_skips_completed(self, mock_delay):
        job = PrintJob.objects.create(
            printer=self.printer,
            receipt_slug="kitchen-default",
            context={},
            status=PrintJobStatus.COMPLETED,
        )
        enqueue_print_job(job)
        mock_delay.assert_not_called()
