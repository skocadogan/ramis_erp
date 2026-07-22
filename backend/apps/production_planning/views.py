import logging

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response
from django.conf import settings
from django.utils import timezone
from django.utils.translation import gettext as _
from django.db import transaction
from django.db.models import Prefetch
from datetime import date as date_cls
from rbac.drf import RBACPermission
from core.branch_scope import branch_filter_qs, user_may_access_branch

from .models import (
    ProductionPlan,
    ProductionPlanLine,
    ProductionDaySettings,
    ProductDayAvailability,
    ProductionPlanStatus,
    ProductionPlanSource,
)
from .serializers import (
    ProductionPlanSerializer,
    ProductionPlanLineSerializer,
    ProductionDaySettingsSerializer,
    ProductDayAvailabilitySerializer
)
from .services.mrp_service import calculate_mrp_for_plan
from .services.approximate_cost_service import calculate_approximate_cost_for_plan
from .services.forecast_service import generate_forecast
from .services.plan_copy import copy_production_plan_to_date
from .services.production_reservation_service import (
    create_reservations_for_plan,
    sync_availability_for_plan,
)
from .pagination import ProductionPlanningPagination

logger = logging.getLogger(__name__)


class ProductionPlanViewSet(viewsets.ModelViewSet):
    pagination_class = ProductionPlanningPagination
    queryset = (
        ProductionPlan.objects.filter(is_active=True)
        .select_related('branch', 'created_by', 'approved_by')
        .prefetch_related(
            Prefetch(
                'lines',
                ProductionPlanLine.objects.filter(is_active=True).select_related('product', 'station'),
            )
        )
        .order_by('-plan_date')
    )
    serializer_class = ProductionPlanSerializer
    permission_classes = [RBACPermission]
    
    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'mrp', 'approximate_cost']:
            self.permission_codes = [
                'production_planning.view_plan', 
                'production_planning.manage_plan',
                'waiter.access'
            ]
        else:
            self.permission_codes = ['production_planning.manage_plan']
        return [RBACPermission()]

    def get_queryset(self):
        qs = super().get_queryset()
        
        # Filtreleme parametreleri
        branch_id = self.request.query_params.get('branch_id')
        plan_date = self.request.query_params.get('plan_date')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')

        if branch_id:
            qs = qs.filter(branch_id=branch_id)
            
        if plan_date:
            qs = qs.filter(plan_date=plan_date)
            
        if start_date:
            qs = qs.filter(plan_date__gte=start_date)
            
        if end_date:
            qs = qs.filter(plan_date__lte=end_date)
            
        return branch_filter_qs(qs, self.request, field='branch_id')

    def create(self, request, *args, **kwargs):
        """
        Plan oluşturur. Aynı şube + tarih için aktif plan varsa
        hata fırlatmak yerine mevcut planı günceller ve availability'yi senkronize eder.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        branch = serializer.validated_data.get('branch')
        plan_date = serializer.validated_data.get('plan_date')

        existing_plan = ProductionPlan.objects.filter(
            is_active=True,
            branch=branch,
            plan_date=plan_date,
        ).first()

        if existing_plan:
            # Mevcut planı güncelle
            plan = self._update_existing_plan(existing_plan, serializer)
            action_label = 'updated'
            status_code = status.HTTP_200_OK
        else:
            # Yeni plan oluştur
            plan = serializer.save(created_by=request.user)
            action_label = 'created'
            status_code = status.HTTP_201_CREATED

        # Availability (86 listesi) her durumda senkronize edilir
        try:
            sync_availability_for_plan(plan, user=request.user)
        except Exception:
            logger.exception("Availability sync failed during plan create/upsert for plan %s", plan.id)

        response_data = self.get_serializer(plan).data
        response_data['upsert_action'] = action_label

        return Response(
            response_data,
            status=status_code,
            headers=self.get_success_headers(response_data),
        )

    def _update_existing_plan(self, existing_plan, serializer):
        """Mevcut planı serializer'dan gelen verilerle günceller."""
        # Lines verisini validated_data'dan çıkar
        validated_data = serializer.validated_data
        lines_data = validated_data.pop('lines', [])

        # Plan ana alanlarını güncelle
        for attr, value in validated_data.items():
            setattr(existing_plan, attr, value)
        existing_plan.save()

        # Satırları yeniden oluştur (eski satırlar soft-delete veya hard-delete)
        existing_plan.lines.all().delete()
        for line_data in lines_data:
            ProductionPlanLine.objects.create(plan=existing_plan, **line_data)

        return existing_plan

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        plan = self.get_object()
        if plan.status != ProductionPlanStatus.DRAFT:
            return Response({"error": _("Sadece taslak planlar onaylanabilir.")}, status=status.HTTP_400_BAD_REQUEST)

        plan.status = ProductionPlanStatus.APPROVED
        plan.approved_by = request.user
        plan.approved_at = timezone.now()
        plan.save()

        # Feature flag aktifse, plan satırlarındaki ürünlerin reçete
        # ihtiyaçlarını ProductionReservation olarak kaydet.
        if getattr(settings, 'PRODUCTION_STOCK_RESERVATION_ENABLED', False):
            try:
                create_reservations_for_plan(plan)
            except Exception:
                logger.exception(
                    "Production reservation creation failed for plan %s — plan still approved",
                    plan.id,
                )

        # Plan satırlarındaki ürünleri Ürün Kısıtı (86) listesine otomatik ekle.
        # Aynı tarih/şube/ürün varsa günceller, yoksa oluşturur.
        try:
            sync_availability_for_plan(plan)
        except Exception:
            logger.exception(
                "Availability sync failed for plan %s — plan still approved",
                plan.id,
            )

        return Response(self.get_serializer(plan).data)

    @action(detail=True, methods=['post'], url_path='create-prep-tasks')
    def create_prep_tasks(self, request, pk=None):
        """
        Onaylanmış plan satırlarından mutfak hazırlık görevleri (PrepTask) oluşturur.

        Request body (liste):
        [
            {
                \"plan_line_id\": \"uuid\",
                \"scheduled_start\": \"2026-06-12T09:00:00+03:00\",   # opsiyonel
                \"deadline\": \"2026-06-12T23:59:59+03:00\",          # opsiyonel
                \"assigned_user_ids\": [\"uuid1\", \"uuid2\"]         # opsiyonel
            },
            ...
        ]

        - deadline yoksa → plan_date 23:59:59
        - assigned_user_ids boşsa → sadece PrepTask.assigned_to kullanılmaz
        - Her satır için bir PrepTask oluşturulur
        - Atanan kullanıcılar PrepTaskAssignment ile kaydedilir
        """
        from datetime import datetime, time

        from apps.prep.models import PrepTask, PrepTaskAssignment, PrepStatus

        plan = self.get_object()
        if plan.status != ProductionPlanStatus.APPROVED:
            return Response(
                {"error": _("Sadece onaylı planlar için görev oluşturulabilir.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        task_data_list = request.data
        if not isinstance(task_data_list, list):
            return Response(
                {"error": _("Liste formatında veri bekleniyor.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created_tasks = []
        errors = []

        with transaction.atomic():
            for idx, item in enumerate(task_data_list):
                plan_line_id = item.get('plan_line_id')
                if not plan_line_id:
                    errors.append({"index": idx, "error": _("plan_line_id gerekli")})
                    continue

                try:
                    line = plan.lines.get(id=plan_line_id, is_active=True)
                except ProductionPlanLine.DoesNotExist:
                    errors.append({"index": idx, "error": _("Plan satırı bulunamadı")})
                    continue

                station = line.station or getattr(
                    line.product.category, 'station', None
                )

                default_deadline = datetime.combine(
                    plan.plan_date, time(23, 59, 59)
                )
                deadline = default_deadline
                deadline_str = item.get('deadline')
                if deadline_str:
                    try:
                        deadline = datetime.fromisoformat(deadline_str)
                    except (ValueError, TypeError):
                        deadline = default_deadline

                scheduled_start = None
                scheduled_start_str = item.get('scheduled_start')
                if scheduled_start_str:
                    try:
                        scheduled_start = datetime.fromisoformat(scheduled_start_str)
                    except (ValueError, TypeError):
                        scheduled_start = None

                task = PrepTask.objects.create(
                    branch=plan.branch,
                    station=station,
                    title=_('{product} hazırlığı').format(
                        product=line.product.name
                    ),
                    target_quantity=line.target_quantity,
                    unit=_('porsiyon'),
                    scheduled_start=scheduled_start,
                    deadline=deadline,
                    plan_line=line,
                    product=line.product,
                    status=PrepStatus.PENDING,
                )

                # Çoklu kullanıcı ataması
                assigned_user_ids = item.get('assigned_user_ids', [])
                assignee_names = item.get('assignee_names', [])
                all_assignments = []

                # Sistem kullanıcılarına atama
                for uid in assigned_user_ids:
                    all_assignments.append(
                        PrepTaskAssignment(prep_task=task, user_id=uid)
                    )

                # Sisteme kayıtlı olmayan kişilere isimle atama
                for name in assignee_names:
                    if name and name.strip():
                        all_assignments.append(
                            PrepTaskAssignment(prep_task=task, display_name=name.strip())
                        )

                if all_assignments:
                    # İlk atananı assigned_to'ya yaz (KDS/serializer uyumluluğu için)
                    first = all_assignments[0]
                    if first.user_id:
                        task.assigned_to_id = first.user_id
                    else:
                        task.assigned_to_id = None
                    task.save(update_fields=['assigned_to'])
                    # Tüm atamaları toplu kaydet
                    PrepTaskAssignment.objects.bulk_create(all_assignments)

                created_tasks.append({
                    "id": str(task.id),
                    "plan_line_id": str(line.id),
                    "title": task.title,
                    "product_name": line.product.name,
                    "target_quantity": float(task.target_quantity),
                    "scheduled_start": task.scheduled_start.isoformat() if task.scheduled_start else None,
                    "deadline": task.deadline.isoformat() if task.deadline else None,
                    "assigned_user_ids": assigned_user_ids,
                })

            # WebSocket broadcast — KDS'yi güncelle
            from core.ws_deferred import schedule_prep_update

            schedule_prep_update(
                branch_id=str(plan.branch_id),
                refresh_all=True,
            )

        return Response({
            "created": created_tasks,
            "count": len(created_tasks),
            "errors": errors if errors else None,
        })

    @action(detail=True, methods=['get'])
    def mrp(self, request, pk=None):
        plan = self.get_object()
        if not (request.user.has_permission('production_planning.view_mrp') or request.user.has_permission('production_planning.manage_plan')):
            return Response(status=status.HTTP_403_FORBIDDEN)
            
        station_id = request.query_params.get('station_id')
        mrp_data = calculate_mrp_for_plan(str(plan.id), station_id=station_id)
        return Response(mrp_data)

    @action(detail=True, methods=['get'], url_path='approximate-cost')
    def approximate_cost(self, request, pk=None):
        plan = self.get_object()
        station_id = request.query_params.get('station_id') or None
        try:
            page = int(request.query_params.get('page', 1))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(request.query_params.get('page_size', 50))
        except (TypeError, ValueError):
            page_size = 50

        data = calculate_approximate_cost_for_plan(
            str(plan.id),
            station_id=station_id,
            page=page,
            page_size=page_size,
        )
        if data.get('error'):
            return Response(data, status=status.HTTP_404_NOT_FOUND)
        return Response(data)

    @action(detail=True, methods=['post'], url_path='preview-forecast')
    def preview_forecast(self, request, pk=None):
        plan = self.get_object()
        if plan.status != ProductionPlanStatus.DRAFT:
            return Response({"error": _("Sadece taslak planlar için tahmin önizlemesi yapılabilir.")}, status=status.HTTP_400_BAD_REQUEST)
            
        horizon_weeks = int(request.data.get('horizon_weeks', 4))
        forecast_data = generate_forecast(str(plan.branch_id), plan.plan_date, horizon_weeks)
        
        # Convert to list for frontend
        preview_list = []
        for pid, data in forecast_data.items():
            preview_list.append({
                "product_id": pid,
                "product_name": data.get("product_name", ""),
                "target_quantity": data["forecasted_qty"],
                "historical_avg": data.get("historical_avg", 0),
            })
            
        return Response({"preview": preview_list})

    @action(detail=True, methods=['post'], url_path='apply-forecast')
    def apply_forecast(self, request, pk=None):
        plan = self.get_object()
        if plan.status != ProductionPlanStatus.DRAFT:
            return Response({"error": _("Sadece taslak planlara tahmin uygulanabilir.")}, status=status.HTTP_400_BAD_REQUEST)
            
        horizon_weeks = int(request.data.get('horizon_weeks', 4))
        forecast_data = generate_forecast(str(plan.branch_id), plan.plan_date, horizon_weeks)
        
        with transaction.atomic():
            for pid, data in forecast_data.items():
                line, created = ProductionPlanLine.objects.get_or_create(
                    plan=plan,
                    product_id=pid,
                    defaults={
                        'target_quantity': data["forecasted_qty"],
                        'source': ProductionPlanSource.FORECAST
                    }
                )
                if not created and request.data.get('overwrite', False):
                    line.target_quantity = data["forecasted_qty"]
                    line.source = ProductionPlanSource.FORECAST
                    line.save()
                
        plan.refresh_from_db()
        return Response(self.get_serializer(plan).data)

    @action(detail=True, methods=["post"], url_path="copy")
    def copy(self, request, pk=None):
        """
        Planı aynı şube içinde başka bir güne kopyalar. Hedef şube istemciye bırakılmaz; kaynak planın şubesi kullanılır.
        """
        plan = self.get_object()
        if "branch" in request.data or "branch_id" in request.data:
            req_b = request.data.get("branch") or request.data.get("branch_id")
            if req_b is not None and str(req_b) != str(plan.branch_id):
                return Response(
                    {
                        "error": _(
                            "Üretim planı yalnızca aynı şube içinde kopyalanabilir; "
                            "hedef şube değiştirilemez."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        target_raw = request.data.get("target_date")
        if not target_raw:
            return Response({"error": _("target_date gerekli.")}, status=status.HTTP_400_BAD_REQUEST)
        try:
            s = str(target_raw).strip()[:10]
            target_date = date_cls.fromisoformat(s)
        except (ValueError, TypeError):
            return Response({"error": _("Geçersiz hedef tarih.")}, status=status.HTTP_400_BAD_REQUEST)

        try:
            new_plan = copy_production_plan_to_date(plan, target_date, request.user)
        except DRFValidationError as e:
            detail = e.detail
            if isinstance(detail, list) and detail:
                msg = str(detail[0])
            elif isinstance(detail, dict) and detail:
                msg = str(next(iter(detail.values())))
            else:
                msg = str(detail)
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)

        new_plan = (
            ProductionPlan.objects.filter(id=new_plan.id)
            .select_related("branch", "created_by", "approved_by")
            .prefetch_related(
                Prefetch(
                    "lines",
                    ProductionPlanLine.objects.filter(is_active=True).select_related(
                        "product", "station"
                    ),
                )
            )
            .first()
        )
        return Response(self.get_serializer(new_plan).data, status=status.HTTP_201_CREATED)


class ProductionPlanLineViewSet(viewsets.ModelViewSet):
    queryset = ProductionPlanLine.objects.filter(is_active=True, plan__is_active=True)
    serializer_class = ProductionPlanLineSerializer
    permission_classes = [RBACPermission]
    permission_codes = ['production_planning.manage_plan']

    def get_queryset(self):
        qs = super().get_queryset()
        return branch_filter_qs(qs, self.request, field='plan__branch_id')

class ProductionDaySettingsViewSet(viewsets.ModelViewSet):
    queryset = ProductionDaySettings.objects.all()
    serializer_class = ProductionDaySettingsSerializer
    permission_classes = [RBACPermission]
    permission_codes = ['production_planning.manage_settings']

    def get_queryset(self):
        qs = super().get_queryset()
        return branch_filter_qs(qs, self.request, field='branch_id')

class ProductDayAvailabilityViewSet(viewsets.ModelViewSet):
    pagination_class = ProductionPlanningPagination
    queryset = ProductDayAvailability.objects.filter(is_active=True).select_related(
        'product', 'product__category', 'set_by'
    ).order_by('-effective_date')
    serializer_class = ProductDayAvailabilitySerializer
    permission_classes = [RBACPermission]
    
    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            self.permission_codes = [
                'production_planning.view_86', 
                'production_planning.manage_86',
                'waiter.access'
            ]
        else:
            self.permission_codes = ['production_planning.manage_86']
        return [RBACPermission()]

    def _check_plan_restriction(self, branch_id, date):
        """
        Onaylanmış bir üretim planı varsa admin dışında kimse kısıtları değiştiremez.
        """
        if not branch_id or not date:
            return None
            
        if self.request.user.is_superuser:
            return None
            
        from .models import ProductionPlan, ProductionPlanStatus
        approved_plan = ProductionPlan.objects.filter(
            branch_id=branch_id,
            plan_date=date,
            status=ProductionPlanStatus.APPROVED,
            is_active=True,
        ).exists()
        
        if approved_plan:
            return _("Bu tarih ve şube için onaylanmış bir üretim planı bulunduğundan kısıtlar değiştirilemez.")
        return None

    def get_queryset(self):
        qs = super().get_queryset()
        branch_id = self.request.query_params.get('branch_id')
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
            
        effective_date = self.request.query_params.get('date')
        if effective_date:
            qs = qs.filter(effective_date=effective_date)
            
        product_id = self.request.query_params.get('product_id')
        if product_id:
            qs = qs.filter(product_id=product_id)
            
        return branch_filter_qs(qs, self.request, field='branch_id')

    def create(self, request, *args, **kwargs):
        """Standard POST endpoint'inde Upsert (update-or-create) mantığı."""
        branch_id = request.data.get('branch')
        product_id = request.data.get('product')
        effective_date = request.data.get('effective_date')
        
        # Onaylanmış plan kontrolü
        error = self._check_plan_restriction(branch_id, effective_date)
        if error:
            return Response({"error": error}, status=status.HTTP_403_FORBIDDEN)
        
        if branch_id and product_id and effective_date:
            availability, created = ProductDayAvailability.objects.update_or_create(
                branch_id=branch_id,
                product_id=product_id,
                effective_date=effective_date,
                defaults={
                    'is_active': True,
                    'mode': request.data.get('mode', 'SOLD_OUT'),
                    'remaining_portions': request.data.get('remaining_portions'),
                    'reason': request.data.get('reason', ''),
                    'set_by': request.user
                }
            )
            
            # WebSocket broadcast
            from apps.menu.ws_broadcast import broadcast_menu_catalog_refresh
            broadcast_menu_catalog_refresh(
                reason="availability_upsert", 
                product_id=str(product_id),
                branch_id=str(branch_id)
            )
            
            response_serializer = self.get_serializer(availability)
            return Response(
                response_serializer.data, 
                status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
            )
            
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        error = self._check_plan_restriction(instance.branch_id, instance.effective_date)
        if error:
            return Response({"error": error}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        error = self._check_plan_restriction(instance.branch_id, instance.effective_date)
        if error:
            return Response({"error": error}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(set_by=self.request.user)

    @action(detail=False, methods=['post'], url_path='bulk-create')
    def bulk_create(self, request):
        data = request.data
        if not isinstance(data, list):
            return Response({"error": _("Liste formatında veri bekleniyor.")}, status=status.HTTP_400_BAD_REQUEST)
            
        # Onaylanmış plan kontrolü (Toplu işlemde ilk öğe üzerinden kontrol)
        # Genelde toplu girişler aynı şube/tarih için yapılır.
        if data:
            first_item = data[0]
            error = self._check_plan_restriction(first_item.get('branch'), first_item.get('effective_date'))
            if error:
                return Response({"error": error}, status=status.HTTP_403_FORBIDDEN)

        created_count = 0
        updated_count = 0
        
        with transaction.atomic():
            for item in data:
                branch_id = item.get('branch')
                product_id = item.get('product')
                effective_date = item.get('effective_date')
                
                # Mevcut kaydı bul veya yenisini oluştur (Upsert)
                availability, created = ProductDayAvailability.objects.update_or_create(
                    branch_id=branch_id,
                    product_id=product_id,
                    effective_date=effective_date,
                    defaults={
                        'is_active': True,
                        'mode': item.get('mode', 'SOLD_OUT'),
                        'remaining_portions': item.get('remaining_portions'),
                        'set_by': request.user
                    }
                )
                
                if created:
                    created_count += 1
                else:
                    updated_count += 1
                    
        return Response({
            "message": _(
                "%(created)s yeni kısıt eklendi, %(updated)s kısıt güncellendi."
            )
            % {"created": created_count, "updated": updated_count},
            "created": created_count,
            "updated": updated_count
        }, status=status.HTTP_201_CREATED)
