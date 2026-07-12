from django.utils.translation import gettext as _
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rbac.drf import RBACPermission
from core.branch_scope import accessible_branch_id_strings, branch_filter_qs
from .models import PrepBranchSettings, PrepTask, PrepTaskAssignment, PrepStatus, PrepTemplate, PrepSmartRule
from .serializers import (
    PrepTaskSerializer,
    PrepTaskCreateUpdateSerializer,
    PrepTemplateSerializer,
    PrepSmartRuleSerializer,
    PrepBranchSettingsSerializer,
    PrepBranchSettingsByBranchSerializer,
)
from .pagination import PrepListPagination
from .selectors import (
    default_include_historic_completed_for_prep_list,
    get_active_prep_tasks,
    get_active_prep_templates,
)
from .services import PrepService
from .ws_broadcast import broadcast_prep_update

class PrepTaskViewSet(viewsets.ModelViewSet):
    queryset = PrepTask.objects.filter(is_active=True)
    permission_classes = [RBACPermission]
    pagination_class = PrepListPagination
    # RBAC: kod tanımlı değilse has_permission False döner; KDS / yönetim için aksiyon bazlı izinler
    required_permissions = {
        "list": "prep.view_preptask",
        "retrieve": "prep.view_preptask",
        "create": "prep.add_preptask",
        "update": "prep.add_preptask",
        "partial_update": "prep.add_preptask",
        "destroy": "prep.add_preptask",
        "set_status": "prep.view_preptask",
        "complete": "prep.view_preptask",
        "record_progress": "prep.view_preptask",
        "generate_from_templates": "prep.view_preptask",
    }

    def get_queryset(self):
        if self.action == "list":
            branch_id = self.request.query_params.get("branch_id")
            station_id = self.request.query_params.get("station_id")
            qp = self.request.query_params
            if "include_historic_completed" in qp:
                include_hist_raw = (
                    qp.get("include_historic_completed") or ""
                ).strip().lower()
                include_historic = include_hist_raw in ("1", "true", "yes", "on")
            else:
                include_historic = default_include_historic_completed_for_prep_list(
                    self.request
                )
            user = self.request.user
            # Süper kullanıcı veya manage_templates iznine sahip olan tümünü görür
            has_manage_templates = (
                getattr(user, 'is_superuser', False)
                or (
                    hasattr(user, 'has_permission')
                    and user.has_permission('prep.manage_templates')
                )
            )
            qs = get_active_prep_tasks(
                branch_id=branch_id,
                station_id=station_id,
                include_historic_completed=include_historic,
                status_group=self.request.query_params.get("status_group"),
                user=user,
                has_manage_templates=has_manage_templates,
            )
        else:
            # retrieve / update / delete: tamamlanmış arşiv kayıtlarına da erişim (listede gizlense de)
            qs = PrepTask.objects.filter(is_active=True).exclude(
                status=PrepStatus.CANCELLED
            ).prefetch_related('assignments')
        return branch_filter_qs(qs, self.request)

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return PrepTaskCreateUpdateSerializer
        return PrepTaskSerializer

    def perform_create(self, serializer):
        assigned_user_ids = serializer.validated_data.pop('assigned_user_ids', [])
        assignee_names = serializer.validated_data.pop('assignee_names', [])
        task = serializer.save()

        # PrepTaskAssignment kayıtlarını oluştur
        self._create_assignments(task, assigned_user_ids, assignee_names)

        broadcast_prep_update(task.branch_id, task.station_id, task=task)

    def perform_update(self, serializer):
        assigned_user_ids = serializer.validated_data.pop('assigned_user_ids', None)
        assignee_names = serializer.validated_data.pop('assignee_names', None)
        task = serializer.save()

        if assigned_user_ids is not None or assignee_names is not None:
            # Mevcut assignment'ları temizle ve yeniden oluştur
            task.assignments.all().delete()
            self._create_assignments(
                task,
                assigned_user_ids or [],
                assignee_names or [],
            )

        broadcast_prep_update(task.branch_id, task.station_id, task=task)

    def _create_assignments(self, task, assigned_user_ids, assignee_names):
        """assigned_user_ids ve assignee_names listelerinden PrepTaskAssignment oluşturur."""
        assignments_to_create = []

        for user_id in (assigned_user_ids or []):
            assignments_to_create.append(
                PrepTaskAssignment(prep_task=task, user_id=user_id)
            )

        for name in (assignee_names or []):
            assignments_to_create.append(
                PrepTaskAssignment(prep_task=task, display_name=name)
            )

        if assignments_to_create:
            PrepTaskAssignment.objects.bulk_create(assignments_to_create)

        # Backward compatibility: ilk atamayı assigned_to'ya yaz
        if assignments_to_create:
            first = assignments_to_create[0]
            if first.user_id:
                task.assigned_to_id = first.user_id
            else:
                task.assigned_to = None  # display_name varsa assigned_to'yu boş bırak
            task.save(update_fields=['assigned_to'])

    def perform_destroy(self, instance):
        branch_id = instance.branch_id
        station_id = instance.station_id
        task_id = instance.pk
        instance.delete()
        broadcast_prep_update(branch_id, station_id, removed_task_id=task_id)

    @action(detail=False, methods=["post"], url_path="generate-from-templates")
    def generate_from_templates(self, request):
        """Günlük şablonlardan hazırlık görevlerini idempotent biçimde üretir (GET yan etkisi yok)."""
        count = PrepService.generate_tasks_from_templates()
        return Response(
            {
                "created_count": count,
                "message": (
                    _("%(count)s yeni hazırlık görevi üretildi.") % {"count": count}
                    if count
                    else _("Yeni üretilecek şablon görevi yok.")
                ),
            }
        )

    @action(detail=True, methods=['post'])
    def set_status(self, request, pk=None):
        """Görevin durumunu günceller."""
        task = self.get_object()
        new_status = request.data.get('status')
        if not new_status:
            return Response({"error": _("status alanı gereklidir.")}, status=status.HTTP_400_BAD_REQUEST)
        
        updated_task = PrepService.set_status(task, new_status, user=request.user)
        return Response(PrepTaskSerializer(updated_task).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Görevi tamamlar."""
        task = self.get_object()
        qty = request.data.get('completed_quantity')
        updated_task = PrepService.complete_task(task, user=request.user, completed_quantity=qty)
        return Response(PrepTaskSerializer(updated_task).data)

    @action(detail=True, methods=["post"], url_path="record-progress")
    def record_progress(self, request, pk=None):
        """Tamamlanan miktarı günceller (kademeli ilerleme); görev açık kalır."""
        task = self.get_object()
        qty = request.data.get("completed_quantity")
        if qty is None:
            return Response(
                {"error": _("completed_quantity alanı gereklidir.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        updated_task = PrepService.record_progress(task, qty)
        return Response(PrepTaskSerializer(updated_task).data)

class PrepTemplateViewSet(viewsets.ModelViewSet):
    queryset = PrepTemplate.objects.all()
    serializer_class = PrepTemplateSerializer
    permission_classes = [RBACPermission]
    pagination_class = PrepListPagination
    required_permissions = {
        "list": "prep.manage_templates",
        "retrieve": "prep.manage_templates",
        "create": "prep.manage_templates",
        "update": "prep.manage_templates",
        "partial_update": "prep.manage_templates",
        "destroy": "prep.manage_templates",
        "smart_suggestions": "prep.manage_templates",
        "rule_discovery": "prep.manage_templates",
    }

    def get_queryset(self):
        qs = get_active_prep_templates()
        return branch_filter_qs(qs, self.request)

    @action(detail=False, methods=['get'])
    def smart_suggestions(self, request):
        """Akıllı kural önerilerini getirir."""
        branch_id = _prep_settings_resolve_branch_id(request)
        if not branch_id:
            return Response(
                {"detail": _("branch_id query parametresi gerekli.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if _prep_settings_branch_forbidden(request, branch_id):
            return Response(status=status.HTTP_403_FORBIDDEN)

        suggestions = PrepService.calculate_smart_prep_suggestions(branch_id)
        paginator = PrepListPagination()
        page = paginator.paginate_queryset(suggestions, request, view=self)
        return paginator.get_paginated_response(page)

    @action(detail=False, methods=['get'])
    def rule_discovery(self, request):
        """Satış hacmi yüksek ürünlere göre kural önerileri sunar."""
        branch_id = _prep_settings_resolve_branch_id(request)
        if not branch_id:
            return Response(
                {"detail": _("branch_id query parametresi gerekli.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if _prep_settings_branch_forbidden(request, branch_id):
            return Response(status=status.HTTP_403_FORBIDDEN)

        discovery = PrepService.get_rule_discovery_suggestions(branch_id)
        return Response(discovery)

class PrepSmartRuleViewSet(viewsets.ModelViewSet):
    queryset = PrepSmartRule.objects.all()
    serializer_class = PrepSmartRuleSerializer
    permission_classes = [RBACPermission]
    pagination_class = PrepListPagination
    required_permissions = {
        "list": "prep.manage_smart_rules",
        "retrieve": "prep.manage_smart_rules",
        "create": "prep.manage_smart_rules",
        "update": "prep.manage_smart_rules",
        "partial_update": "prep.manage_smart_rules",
        "destroy": "prep.manage_smart_rules",
    }

    def get_queryset(self):
        qs = PrepSmartRule.objects.filter(is_active=True)
        return branch_filter_qs(qs, self.request)


def _prep_settings_resolve_branch_id(request) -> str:
    qp = (request.query_params.get("branch_id") or "").strip()
    body = ""
    if isinstance(request.data, dict):
        raw = request.data.get("branch")
        body = str(raw).strip() if raw is not None else ""
    bid = qp or body
    if not bid and not request.user.is_superuser:
        ub = getattr(request.user, "branch_id", None)
        bid = str(ub) if ub else ""
    return bid


def _prep_settings_branch_forbidden(request, branch_id: str) -> bool:
    if not branch_id:
        return True
    allowed = accessible_branch_id_strings(request.user)
    if allowed is None:
        return False
    return branch_id not in allowed


class PrepBranchSettingsViewSet(viewsets.GenericViewSet):
    """
    Şube başına tek hazırlık ayarı (OneToOne).
    GET/PATCH ``/prep/branch-settings/by-branch/?branch_id=`` veya gövdede ``branch``.
    """

    permission_classes = [RBACPermission]
    queryset = PrepBranchSettings.objects.filter(is_active=True)

    def get_permissions(self):
        if self.action == "by_branch":
            if self.request.method == "PATCH":
                self.required_permissions = {"by_branch": "prep.add_preptask"}
            else:
                self.required_permissions = {"by_branch": "prep.view_preptask"}
        return [RBACPermission()]

    @action(detail=False, methods=["get", "patch"], url_path="by-branch")
    def by_branch(self, request):
        if request.method == "GET":
            branch_id = _prep_settings_resolve_branch_id(request)
            if not branch_id:
                return Response(
                    {"detail": _("branch_id query parametresi gerekli.")},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if _prep_settings_branch_forbidden(request, branch_id):
                return Response(status=status.HTTP_403_FORBIDDEN)

            row = PrepBranchSettings.objects.filter(branch_id=branch_id).first()
            payload = {
                "branch": branch_id,
                "management_hide_old_completed": (
                    row.management_hide_old_completed if row else False
                ),
            }
            if row:
                payload["id"] = str(row.id)
                payload["updated_at"] = row.updated_at
            return Response(payload)

        # PATCH
        ser = PrepBranchSettingsByBranchSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        branch_id = str(ser.validated_data["branch"])
        if _prep_settings_branch_forbidden(request, branch_id):
            return Response(status=status.HTTP_403_FORBIDDEN)

        obj = PrepService.upsert_prep_branch_settings(
            branch_id,
            management_hide_old_completed=ser.validated_data[
                "management_hide_old_completed"
            ],
        )
        return Response(PrepBranchSettingsSerializer(obj).data)

   