import csv
import io
import json

from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework import viewsets, mixins, filters
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from core.branch_scope import branch_filter_qs
from .models import AuditLog
from .serializers import AuditLogSerializer
from rbac.drf import RBACPermission


class AuditLogPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class AuditLogViewSet(mixins.ListModelMixin,
                      mixins.RetrieveModelMixin,
                      viewsets.GenericViewSet):
    """
    Denetim kayıtlarını listeleme ve görüntüleme.
    Sadece okuma amaçlıdır (append-only).
    """
    queryset = AuditLog.objects.filter(is_active=True)
    serializer_class = AuditLogSerializer
    pagination_class = AuditLogPagination
    permission_classes = [RBACPermission]
    permission_codes = ['audit.view_auditlog']
    required_permissions = {
        'list': ['audit.view_auditlog'],
        'retrieve': ['audit.view_auditlog'],
        'export': ['audit.export_auditlog'],
        'actions': ['audit.view_auditlog'],
    }
    
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['branch', 'action', 'actor', 'target_type', 'target_id']
    search_fields = [
        'action',
        'target_type',
        'target_id',
        'metadata',
        'actor__username',
        'actor__first_name',
        'actor__last_name',
    ]
    ordering_fields = ['created_at']
    ordering = ['-created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        qs = branch_filter_qs(qs, self.request, field='branch')

        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            qs = qs.filter(created_at__date__gte=start_date)
        if end_date:
            qs = qs.filter(created_at__date__lte=end_date)

        return qs

    @action(detail=False, methods=['get'], url_path='actions')
    def actions(self, request):
        """Kullanıcının erişebildiği loglardaki distinct eylem tiplerini döner."""
        qs = self.get_queryset()
        actions = qs.values_list('action', flat=True).distinct().order_by('action')
        return Response(list(actions))

    @action(detail=False, methods=['get'], url_path='export')
    def export(self, request):
        """CSV dışa aktarma — audit.export_auditlog izni gerekir."""
        qs = self.filter_queryset(self.get_queryset()).select_related('actor', 'branch')
        buffer = io.StringIO()
        buffer.write('\ufeff')
        writer = csv.writer(buffer)
        writer.writerow([
            'id', 'created_at', 'actor', 'action', 'target_type', 'target_id',
            'branch', 'actor_ip', 'metadata',
        ])
        for log in qs.iterator(chunk_size=500):
            actor_name = ''
            if log.actor:
                actor_name = log.actor.username or str(log.actor_id)
            branch_name = log.branch.name if log.branch_id else ''
            metadata = json.dumps(log.metadata, ensure_ascii=False) if log.metadata else ''
            writer.writerow([
                str(log.id),
                log.created_at.isoformat(),
                actor_name,
                log.action,
                log.target_type,
                log.target_id,
                branch_name,
                log.actor_ip or '',
                metadata,
            ])

        today = timezone.now().date().isoformat()
        response = HttpResponse(buffer.getvalue(), content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="audit_logs_{today}.csv"'
        return response
