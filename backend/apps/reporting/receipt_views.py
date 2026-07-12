from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response

import hashlib
import logging

from .models import ReceiptTemplate
from .serializers import ReceiptTemplateSerializer
from .services.receipt_renderer import (
    ReceiptRenderer,
    SAMPLE_CONTEXTS,
    enrich_print_context_from_branch,
    enrich_print_context_from_order,
)
from rbac.drf import RBACPermission
from django.conf import settings
from django.utils.translation import gettext as _
from core.json_utils import to_json_safe


PRINT_IDEMPOTENCY_KEY_MAX_LENGTH = 128


def normalize_print_idempotency_key(value) -> str | None:
    if value is None:
        return None

    key = str(value).strip()
    if not key:
        return None

    if len(key) <= PRINT_IDEMPOTENCY_KEY_MAX_LENGTH:
        return key

    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


class ReceiptTemplateViewSet(viewsets.ModelViewSet):
    """
    ESC/POS termal yazıcılar için fiş şablonu yönetimi.
    Şablonlar layout_json blokları üzerinden tasarlanır;
    hem monospace metin önizleme hem de fiziksel baskı desteklenir.

    Desteklenen filtreler:
      ?category=POS_RECEIPT | KITCHEN_TICKET | WAITER_TICKET
      ?is_default=true
    """
    serializer_class = ReceiptTemplateSerializer
    permission_classes = [RBACPermission]
    renderer_classes = [JSONRenderer]
    lookup_field = 'slug'
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'slug']

    def get_queryset(self):
        qs = ReceiptTemplate.objects.filter(is_active=True)
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)
        is_default = self.request.query_params.get('is_default')
        if is_default in ('true', '1'):
            qs = qs.filter(is_default=True)
        return qs

    required_permissions = {
        'list':           'reporting.view_report_template',
        'retrieve':       'reporting.view_report_template',
        'create':         'reporting.manage_report_template',
        'update':         'reporting.manage_report_template',
        'partial_update': 'reporting.manage_report_template',
        'destroy':        'reporting.manage_report_template',
        'preview_text':   'reporting.view_report_template',
        'print_thermal':  ['reporting.generate_report', 'printing.direct_print'],
        'set_default':    'reporting.manage_report_template',
    }

    # ── Önizleme ─────────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'])
    def preview_text(self, request, slug=None):
        """
        layout_json bloklarını monospace metin olarak döner (frontend önizleme).
        İsteğe bağlı: body'de `context` gönderilebilir; yoksa kategori bazlı
        örnek veriler kullanılır.
        """
        template = self.get_object()
        context = request.data.get(
            'context',
            SAMPLE_CONTEXTS.get(template.category, {})
        )
        try:
            renderer = ReceiptRenderer(template.paper_width)
            text = renderer.render_to_text(template.layout_json, context)
            return Response({
                'text': text,
                'paper_width': template.paper_width,
                'lines': len(text.splitlines()),
            })
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    # ── Fiziksel Baskı ────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'])
    def print_thermal(self, request, slug=None):
        """
        Termal baskı: PrintJob kaydı oluşturulur; PRINT_THERMAL_SYNC=True ise (geliştirmede
        settings.DEBUG ile zorunlu) bu istekte senkron, aksi halde Celery ile kuyruğa verilir.

        Body: { printer_id: <uuid>, context?: {...}, idempotency_key?: <string> }

        Dönüş: 200 (tamamlandı) | 202 (kuyruk) | hata kodları
        """
        template = self.get_object()
        printer_id = request.data.get('printer_id')
        if not printer_id:
            return Response(
                {'error': _('printer_id zorunludur.')},
                status=status.HTTP_400_BAD_REQUEST
            )

        context = request.data.get(
            'context',
            SAMPLE_CONTEXTS.get(template.category, {})
        )

        from apps.printing.models import Printer, PrintJob, PrintJobStatus
        from apps.printing.tasks import execute_receipt_print_job
        from django.db import IntegrityError

        try:
            printer = Printer.objects.get(id=printer_id, is_active=True)
        except Printer.DoesNotExist:
            return Response(
                {'error': _('Yazıcı bulunamadı veya aktif değil.')},
                status=status.HTTP_404_NOT_FOUND
            )

        if isinstance(context, dict):
            context = enrich_print_context_from_order(context)
            context = enrich_print_context_from_branch(
                context,
                fallback_branch_id=str(printer.branch_id),
            )
            context = to_json_safe(context)

        idempotency_key = normalize_print_idempotency_key(
            request.data.get('idempotency_key')
        )

        if idempotency_key:
            existing = PrintJob.objects.filter(idempotency_key=idempotency_key).first()
            if existing:
                return Response(
                    {
                        'status': 'queued',
                        'print_job_id': str(existing.id),
                        'message': _(
                            'Bu idempotency anahtarı için iş zaten kayıtlı.'
                        ),
                    },
                    status=status.HTTP_202_ACCEPTED,
                )

        try:
            job = PrintJob.objects.create(
                printer=printer,
                receipt_slug=template.slug,
                context=context,
                status=PrintJobStatus.PENDING,
                idempotency_key=idempotency_key,
            )
        except IntegrityError:
            existing = PrintJob.objects.filter(idempotency_key=idempotency_key).first()
            if existing:
                return Response(
                    {
                        'status': 'queued',
                        'print_job_id': str(existing.id),
                        'message': _(
                            'Bu idempotency anahtarı için iş zaten kayıtlı.'
                        ),
                    },
                    status=status.HTTP_202_ACCEPTED,
                )
            return Response(
                {'error': _('Yazdırma işi oluşturulamadı.')},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        log = logging.getLogger(__name__)

        if getattr(settings, 'PRINT_THERMAL_SYNC', False):
            # Celery worker olmadan doğrudan işle (geliştirme veya PRINT_THERMAL_SYNC=1).
            try:
                execute_receipt_print_job.run(str(job.id))
            except Exception as exc:  # noqa: BLE001
                log.exception("Senkron termal baskı çalıştırılamadı job=%s", job.id)
                return Response(
                    {
                        'error': _('Baskı çalıştırılamadı: %(exc)s') % {'exc': exc},
                        'print_job_id': str(job.id),
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            job.refresh_from_db()
            if job.status != PrintJobStatus.COMPLETED:
                return Response(
                    {
                        'status': 'failed',
                        'print_job_id': str(job.id),
                        'message': job.error_message or _('Baskı tamamlanamadı.'),
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            return Response(
                {
                    'status': 'completed',
                    'print_job_id': str(job.id),
                    'message': _('Baskı "%(name)s" yazıcısında tamamlandı.')
                    % {'name': printer.name},
                },
                status=status.HTTP_200_OK,
            )

        try:
            from apps.printing.services.print_job_dispatch import enqueue_print_job

            enqueue_print_job(job)
        except Exception as exc:  # noqa: BLE001
            log.exception("Celery print job dispatch failed job=%s", job.id)
            return Response(
                {
                    'error': _(
                        'Baskı işi kaydedildi ancak kuyruk (Celery) iletilemedi. '
                        'Worker çalışıyor mu?'
                    ),
                    'print_job_id': str(job.id),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                'status': 'queued',
                'print_job_id': str(job.id),
                'message': _('Baskı "%(name)s" yazıcısı için kuyruğa alındı.')
                % {'name': printer.name},
            },
            status=status.HTTP_202_ACCEPTED,
        )

    # ── Varsayılan Şablon Ayarla ──────────────────────────────────────────────

    @action(detail=True, methods=['post'])
    def set_default(self, request, slug=None):
        """
        Bu şablonun varsayılan durumunu değiştirir (toggle).
        Eğer True yapılıyorsa, aynı kategorideki diğer şablonlar False yapılır.
        """
        template = self.get_object()
        if template.is_default:
            # Zaten varsayılan ise, kaldır
            template.is_default = False
            template.save(update_fields=['is_default'])
            return Response(
                {
                    'status': 'ok',
                    'message': _('"%(name)s" varsayılan özelliği kaldırıldı.')
                    % {'name': template.name},
                }
            )
        else:
            # Varsayılan yap
            ReceiptTemplate.objects.filter(
                category=template.category, is_default=True
            ).exclude(pk=template.pk).update(is_default=False)
            template.is_default = True
            template.save(update_fields=['is_default'])
            return Response(
                {
                    'status': 'ok',
                    'message': _('"%(name)s" varsayılan yapıldı.') % {'name': template.name},
                }
            )
