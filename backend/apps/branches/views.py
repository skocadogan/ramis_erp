from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, F
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from django.utils.translation import gettext as _
from rbac.drf import RBACPermission
from core.branch_scope import branch_filter_qs, accessible_branch_id_strings, user_may_access_branch

from .models import (
    Branch, Zone, Table, TableStatus, KitchenStation, 
    WaiterBranchAssignment, CookStationAssignment, ManagerBranchAssignment
)
from .serializers import (
    BranchSerializer, BranchUserSerializer, AssignUsersSerializer,
    WaiterBranchAssignmentWriteSerializer, CookStationAssignmentWriteSerializer,
    ManagerBranchAssignmentWriteSerializer,
    ZoneSerializer, TableListSerializer, TableListMinimalSerializer, TableDetailSerializer,
    TableCreateUpdateSerializer, TableStatusUpdateSerializer,
    KitchenStationSerializer,
    KitchenStationWasteSerializer,
)
from .waiter_scope import validate_assignment_zone_table_ids
from .selectors import get_branches_with_user_counts, get_tables_with_active_orders, get_zone_summary, takeaway_virtual_tables_payload
from .virtual_table_ids import is_virtual_table_id, virtual_table_detail_payload
from .services import BranchService, TableService

User = get_user_model()


class BranchViewSet(viewsets.ModelViewSet):
    serializer_class = BranchSerializer
    permission_classes = [RBACPermission]
    permission_description = 'Şube Yönetimi'

    def get_permissions(self):
        if self.action == 'manager_assignment':
            self.permission_codes = ['branches.manage_manager_assignment']
            return super().get_permissions()
        if self.action == 'waiter_assignment':
            self.permission_codes = ['branches.manage_waiter_assignment']
            return super().get_permissions()
        if self.action == 'cook_assignment':
            self.permission_codes = ['branches.manage_cook_assignment']
            return super().get_permissions()
        if self.action == 'users':
            # Atama ekranları şube personel listesini okur; tam şube yönetimi gerekmez.
            self.permission_codes = [
                'branches.view_branch',
                'branches.manage_branch',
                'branches.manage_waiter_assignment',
                'branches.manage_cook_assignment',
            ]
            return super().get_permissions()
        read_codes = ['branches.view_branch', 'branches.manage_branch']
        write_codes = ['branches.manage_branch']
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_codes
        else:
            self.permission_codes = write_codes
        return super().get_permissions()

    def get_queryset(self):
        deleted = self.request.query_params.get('deleted') == 'true'
        qs = get_branches_with_user_counts().filter(is_active=not deleted)
        return branch_filter_qs(qs, self.request, field='id')

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_superuser:
            return Response(
                {'detail': _('Şube silme yetkisi sadece sistem yöneticilerine aittir.')},
                status=status.HTTP_403_FORBIDDEN
            )
        force = request.query_params.get('force') == '1'
        if force:
            BranchService.hard_delete(kwargs.get('pk'))
        else:
            BranchService.soft_delete(kwargs.get('pk'))
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        if not request.user.is_superuser:
            return Response(
                {'detail': _('Şube geri yükleme yetkisi sadece sistem yöneticilerine aittir.')},
                status=status.HTTP_403_FORBIDDEN
            )
        branch = BranchService.restore_branch(pk)
        return Response(BranchSerializer(branch).data)

    @action(detail=True, methods=['get'])
    def users(self, request, pk=None):
        branch = self.get_object()
        users = branch.users.filter(is_active=True).select_related().prefetch_related('roles').order_by('username')
        serializer = BranchUserSerializer(users, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def assign_users(self, request, pk=None):
        serializer = AssignUsersSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        branch = BranchService.assign_users(
            branch_id=pk,
            user_ids=serializer.validated_data['user_ids'],
        )
        return Response(BranchSerializer(branch).data)

    @action(detail=True, methods=['delete'], url_path=r'users/(?P<user_id>[^/.]+)')
    def remove_user(self, request, pk=None, user_id=None):
        BranchService.remove_user(branch_id=pk, user_id=user_id)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get', 'put'], url_path=r'waiter-assignments/(?P<user_id>[^/.]+)')
    def waiter_assignment(self, request, pk=None, user_id=None):
        """Garson zone/masa ataması — GET/PUT tam liste (replace)."""
        branch = self.get_object()
        target = get_object_or_404(User.objects.filter(is_active=True), pk=user_id)
        if target.branch_id is None or str(target.branch_id) != str(branch.id):
            return Response(
                {'detail': _('Kullanıcının birincil şubesi bu şube değil.')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request.method == 'GET':
            wa, _ = WaiterBranchAssignment.objects.get_or_create(user=target, branch=branch)
            return Response(
                {
                    'zone_ids': [str(x) for x in wa.zones.values_list('id', flat=True)],
                    'table_ids': [str(x) for x in wa.tables.values_list('id', flat=True)],
                }
            )

        ser = WaiterBranchAssignmentWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        zids = [str(x) for x in ser.validated_data['zone_ids']]
        tids = [str(x) for x in ser.validated_data['table_ids']]
        try:
            validate_assignment_zone_table_ids(branch_id=branch.id, zone_ids=zids, table_ids=tids)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            wa, _ = WaiterBranchAssignment.objects.get_or_create(user=target, branch=branch)
            wa.zones.set(zids)
            wa.tables.set(tids)
        return Response(
            {
                'zone_ids': zids,
                'table_ids': tids,
            }
        )

    @action(detail=True, methods=['get', 'put'], url_path=r'cook-assignments/(?P<user_id>[^/.]+)')
    def cook_assignment(self, request, pk=None, user_id=None):
        """Aşçı istasyon ataması — GET/PUT tam liste (replace)."""
        branch = self.get_object()
        target = get_object_or_404(User.objects.filter(is_active=True), pk=user_id)
        if target.branch_id is None or str(target.branch_id) != str(branch.id):
            return Response(
                {'detail': _('Kullanıcının birincil şubesi bu şube değil.')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request.method == 'GET':
            ca, _ = CookStationAssignment.objects.get_or_create(user=target, branch=branch)
            return Response(
                {
                    'station_ids': [str(x) for x in ca.stations.values_list('id', flat=True)],
                }
            )

        ser = CookStationAssignmentWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        sids = [str(x) for x in ser.validated_data['station_ids']]

        # IDOR protection: check if all station_ids belong to the branch
        valid_sids = KitchenStation.objects.filter(
            branch=branch, id__in=sids, is_active=True
        ).values_list('id', flat=True)
        if len(valid_sids) != len(sids):
            return Response({'detail': _('Bazı istasyonlar bu şubeye ait değil.')}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            ca, _ = CookStationAssignment.objects.get_or_create(user=target, branch=branch)
            ca.stations.set(sids)
        return Response(
            {
                'station_ids': sids,
            }
        )

    @action(detail=False, methods=['get', 'put'], url_path=r'manager-assignments/(?P<user_id>[^/.]+)')
    def manager_assignment(self, request, user_id=None):
        """Müdür şube ataması — GET/PUT tam liste (user bazlı)."""
        target = get_object_or_404(User.objects.filter(is_active=True), pk=user_id)

        if request.method == 'GET':
            mba_ids = ManagerBranchAssignment.objects.filter(user=target).values_list('branch_id', flat=True)
            return Response({'branch_ids': [str(x) for x in mba_ids]})

        ser = ManagerBranchAssignmentWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        bids = [str(x) for x in ser.validated_data['branch_ids']]

        # Verify all branches exist and are accessible (if not superuser)
        accessible = Branch.objects.filter(id__in=bids)
        if len(accessible) != len(bids):
            return Response({'detail': _('Bazı şubeler bulunamadı.')}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # Replace all assignments for this user
            ManagerBranchAssignment.objects.filter(user=target).delete()
            objs = [ManagerBranchAssignment(user=target, branch_id=bid) for bid in bids]
            ManagerBranchAssignment.objects.bulk_create(objs)
            
            # Update user's primary branch if not set or if it was removed (optional logic)
            if bids and (target.branch_id is None or str(target.branch_id) not in bids):
                target.branch_id = bids[0]
                target.save(update_fields=['branch_id'])

        return Response({'branch_ids': bids})


class ZoneViewSet(viewsets.ModelViewSet):
    queryset = Zone.objects.all()
    serializer_class = ZoneSerializer
    permission_classes = [RBACPermission]
    permission_description = 'Bölge Yönetimi'

    def get_queryset(self):
        qs = Zone.objects.select_related('branch').all().order_by('sort_order', 'name')
        return branch_filter_qs(qs, self.request, field='branch_id')

    def get_permissions(self):
        read_codes = ['branches.view_zone', 'branches.manage_zone']
        write_codes = ['branches.manage_zone']
        if self.action in ['list', 'retrieve', 'summary']:
            self.permission_codes = read_codes
        else:
            self.permission_codes = write_codes
        return super().get_permissions()

    @action(detail=False, methods=['get'])
    def summary(self, request):
        branch_id = request.query_params.get('branch_id')
        allowed = accessible_branch_id_strings(request.user)
        if allowed is not None:
            if not allowed:
                return Response([])
            if branch_id:
                if branch_id not in allowed:
                    return Response([])
            elif len(allowed) == 1:
                branch_id = next(iter(allowed))
            else:
                return Response(
                    {'detail': _('Çoklu şube erişiminiz var; branch_id parametresi gerekli.')},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        zones = get_zone_summary(branch_id=branch_id)
        data = []
        for z in zones:
            data.append({
                'id': z.id,
                'name': z.name,
                'total_tables': z.total_tables,
                'free_tables': z.free_tables,
                'occupied_tables': z.occupied_tables,
                'reserved_tables': z.reserved_tables,
                'cleaning_tables': z.cleaning_tables,
                'out_of_service_tables': z.out_of_service_tables,
            })
        return Response(data)

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        order_data = request.data.get('order', [])
        if not order_data:
            return Response({'error': _('Sıra verisi sağlanmadı.')}, status=status.HTTP_400_BAD_REQUEST)

        # IDOR koruması: sadece kullanıcının erişebildiği zone'ları güncelle
        allowed_qs = self.get_queryset()
        matching = allowed_qs.filter(id__in=order_data)
        if matching.count() != len(order_data):
            return Response({'error': _('Yetkisiz kayıt.')}, status=status.HTTP_403_FORBIDDEN)

        from django.db import transaction as db_transaction
        from django.db.models import Case, When, Value, IntegerField
        with db_transaction.atomic():
            matching.update(
                sort_order=Case(
                    *[When(id=zone_id, then=Value(index)) for index, zone_id in enumerate(order_data)],
                    output_field=IntegerField()
                )
            )

        return Response({'status': 'ok'})

    def destroy(self, request, *args, **kwargs):
        zone = self.get_object()
        if Table.objects.filter(zone=zone, is_active=True).exists():
            return Response(
                {
                    'detail': _(
                        'Bu bölgede aktif masalar bulunuyor. Önce masaları silin veya başka bölgeye taşıyın.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class TableViewSet(viewsets.ModelViewSet):
    permission_classes = [RBACPermission]
    permission_description = 'Masa Yönetimi'

    @action(detail=False, methods=['get'], url_path='waiter-count')
    def waiter_count(self, request):
        """Garson kapsamındaki masa sayısı (tam liste JSON yerine). scope=waiter zorunlu."""
        branch_id = request.query_params.get('branch_id') or getattr(request.user, 'branch_id', None)
        if not branch_id:
            return Response(
                {'detail': 'branch_id sorgu parametresi veya kullanıcı şubesi gerekli.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if request.query_params.get('scope') != 'waiter':
            return Response(
                {'detail': 'scope=waiter sorgu parametresi gerekli.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        queryset = self.filter_queryset(self.get_queryset())
        return Response({'count': queryset.count()})

    def list(self, request, *args, **kwargs):
        from django.core.cache import cache
        
        branch_id = request.query_params.get('branch_id') or getattr(request.user, 'branch_id', None)
        zone_id = request.query_params.get('zone_id')
        status_param = request.query_params.get('status')
        scope = request.query_params.get('scope')
        minimal = request.query_params.get('minimal')
        
        bid = str(branch_id) if branch_id else "all"
        cache_version = cache.get(f"tables_version:{bid}", 1)
        
        cache_key = f"tables_list:{bid}:{zone_id or 'all'}:{status_param or 'all'}:{scope or 'all'}:{minimal or '0'}:{cache_version}"
        
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            return Response(cached_data)
            
        queryset = self.filter_queryset(self.get_queryset())
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            data = serializer.data
            return self.get_paginated_response(data)

        serializer = self.get_serializer(queryset, many=True)
        data = serializer.data
        
        cache.set(cache_key, data, timeout=60)
        return Response(data)

    def get_permissions(self):
        # Garson modu kontrolü
        if self.request.query_params.get('scope') == 'waiter' or self.action in [
            'waiter_count',
            'open',
            'close',
            'reserve',
            'cancel_reservation',
            'start_cleaning',
            'finish_cleaning',
        ]:
            self.permission_codes = ['waiter.access', 'branches.view_table']
            return super().get_permissions()

        # force_close: yalnızca yönetici yetkisi gerektirir (waiter scope dışında)
        if self.action == 'force_close':
            self.permission_codes = ['branches.manage_table']
            return super().get_permissions()
             
        read_codes = ['branches.view_table', 'branches.manage_table']
        write_codes = ['branches.manage_table']
        if self.action in ['list', 'retrieve', 'floor_plan', 'takeaway_virtual']:
            self.permission_codes = read_codes
        else:
            self.permission_codes = write_codes
        return super().get_permissions()

    def get_queryset(self):
        # N+1 problemi yaşamamak için selector kullanıyoruz
        branch_id = self.request.query_params.get('branch_id')
        zone_id = self.request.query_params.get('zone_id')
        status_param = self.request.query_params.get('status')
        qs = get_tables_with_active_orders(branch_id=branch_id)
        qs = branch_filter_qs(qs, self.request, field='zone__branch_id')
        if zone_id:
            qs = qs.filter(zone_id=zone_id)
        if status_param:
            qs = qs.filter(status=status_param)
            if status_param == TableStatus.RESERVED:
                return qs.order_by(F('reservation_scheduled_at').asc(nulls_last=True), 'zone__name', 'table_number')

        if self.request.query_params.get('scope') == 'waiter':
            from .waiter_scope import _has_waiter_access, eligible_table_ids_for

            if not getattr(self.request.user, "is_superuser", False):
                if not _has_waiter_access(self.request.user):
                    return qs.none()
                bid = branch_id or getattr(self.request.user, 'branch_id', None)
                if not bid:
                    return qs.none()
                allowed = eligible_table_ids_for(self.request.user, bid)
                if not allowed:
                    return qs.none()
                qs = qs.filter(id__in=list(allowed))
        return qs.order_by('zone__name', 'table_number')

    @action(detail=False, methods=['get'], url_path='takeaway_virtual')
    def takeaway_virtual(self, request):
        branch_id = request.query_params.get('branch_id')
        if not branch_id:
            return Response([])
        if not user_may_access_branch(request.user, branch_id):
            return Response([])
        
        is_waiter = request.query_params.get('scope') == 'waiter'
        assigned_zone_ids = None
        if is_waiter and not getattr(request.user, 'is_superuser', False):
            from .waiter_scope import _may_bypass_waiter_scope_as_manager, get_assignment
            if not _may_bypass_waiter_scope_as_manager(request.user, branch_id):
                assignment = get_assignment(request.user, branch_id)
                if not assignment:
                    return Response([])
                assigned_zone_ids = {str(z.id) for z in assignment.zones.all()}
                
        data = takeaway_virtual_tables_payload(branch_id)
        if assigned_zone_ids is not None:
            data = [t for t in data if t.get('zone') in assigned_zone_ids]
            
        return Response(data)

    def retrieve(self, request, *args, **kwargs):
        pk = kwargs.get(self.lookup_field or "pk")
        if is_virtual_table_id(pk):
            data = virtual_table_detail_payload(pk)
            if data is None:
                return Response({"detail": _("Masa bulunamadı.")}, status=status.HTTP_404_NOT_FOUND)
            return Response(data)
        return super().retrieve(request, *args, **kwargs)

    def get_serializer_class(self):
        if self.action == 'list':
            if self.request.query_params.get('minimal') == '1':
                return TableListMinimalSerializer
            return TableListSerializer
        elif self.action == 'retrieve':
            return TableDetailSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return TableCreateUpdateSerializer
        return TableDetailSerializer

    @staticmethod
    def _sync_table_reservation_row(table: Table) -> None:
        from apps.reservations.table_bridge import (
            cancel_active_reservations_for_table,
            ensure_reservation_for_table,
        )

        if table.status == TableStatus.RESERVED:
            ensure_reservation_for_table(
                table,
                reservation_info=table.reservation_info or "",
                reservation_scheduled_at=table.reservation_scheduled_at,
                reservation_party_size=table.reservation_party_size,
            )
        else:
            cancel_active_reservations_for_table(table.id)

    def perform_create(self, serializer):
        table = serializer.save()
        self._sync_table_reservation_row(table)

    def perform_update(self, serializer):
        table = serializer.save()
        self._sync_table_reservation_row(table)

    @action(detail=True, methods=['post'])
    def open(self, request, pk=None):
        table = TableService.open_table(pk)
        return Response(TableDetailSerializer(table).data)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        try:
            table = TableService.close_table(pk)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(TableDetailSerializer(table).data)

    @action(detail=True, methods=['post'])
    def force_close(self, request, pk=None):
        try:
            table = TableService.force_close_table(pk, performed_by=request.user)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(TableDetailSerializer(table).data)

    @action(detail=True, methods=['post'])
    def reserve(self, request, pk=None):
        info = ''
        scheduled_at = None
        party_size = None
        if isinstance(request.data, dict):
            raw = request.data.get('reservation_info', '')
            info = raw if isinstance(raw, str) else str(raw)
            raw_sched = request.data.get('reservation_scheduled_at')
            if raw_sched:
                if isinstance(raw_sched, str):
                    scheduled_at = parse_datetime(raw_sched)
                else:
                    scheduled_at = None
            raw_party = request.data.get('reservation_party_size')
            if raw_party is not None and raw_party != '':
                try:
                    party_size = int(raw_party)
                except (TypeError, ValueError):
                    party_size = None
        table = TableService.reserve_table(
            pk,
            reservation_info=info,
            reservation_scheduled_at=scheduled_at,
            reservation_party_size=party_size,
        )
        return Response(TableDetailSerializer(table).data)

    @action(detail=True, methods=['post'])
    def cancel_reservation(self, request, pk=None):
        table = TableService.cancel_reservation(pk)
        return Response(TableDetailSerializer(table).data)

    @action(detail=True, methods=['post'])
    def set_out_of_service(self, request, pk=None):
        table = TableService.set_out_of_service(pk)
        return Response(TableDetailSerializer(table).data)

    @action(detail=True, methods=['post'])
    def start_cleaning(self, request, pk=None):
        try:
            table = TableService.start_cleaning(pk)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(TableDetailSerializer(table).data)

    @action(detail=True, methods=['post'])
    def finish_cleaning(self, request, pk=None):
        table = TableService.finish_cleaning(pk)
        return Response(TableDetailSerializer(table).data)

    @action(detail=True, methods=['get'])
    def qrcode(self, request, pk=None):
        table = self.get_object()
        qr_data = str(table.id)
        
        import qrcode
        import io
        import base64
        
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=4,
        )
        qr.add_data(qr_data)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode()
        qr_code_base64 = f"data:image/png;base64,{img_str}"
        
        return Response({
            'table_id': str(table.id),
            'table_name': table.name,
            'zone_name': table.zone.name,
            'qr_code': qr_code_base64
        })

    @action(detail=False, methods=['post'])
    def bulk_create(self, request):
        zone_id = request.data.get('zone_id')
        count = request.data.get('count', 1)
        prefix = request.data.get('prefix', 'Masa ')
        capacity = request.data.get('capacity', 4)
        
        try:
            tables = TableService.bulk_create_for_zone(
                zone_id=zone_id,
                count=int(count),
                prefix=prefix,
                capacity=int(capacity),
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(TableListSerializer(tables, many=True).data, status=status.HTTP_201_CREATED)


class KitchenStationViewSet(viewsets.ModelViewSet):
    serializer_class = KitchenStationSerializer
    permission_classes = [RBACPermission]
    permission_description = 'Mutfak İstasyonu Yönetimi'

    def get_queryset(self):
        qs = (
            KitchenStation.objects.filter(is_active=True)
            .select_related('branch', 'warehouse')
            .prefetch_related('categories')
            .order_by('branch__name', 'name')
        )
        qs = branch_filter_qs(qs, self.request, field='branch_id')

        # Assigned only filter for KDS
        if self.request.query_params.get('assigned_only') == 'true':
            user = self.request.user
            # Managers and Superusers can see all by default, but if assigned_only is forced, 
            # we check if they have specific assignments. 
            # If they don't have assignments, we show all (to prevent empty screen for admins).
            assignments = CookStationAssignment.objects.filter(user=user, branch_id=self.request.query_params.get('branch_id')).first()
            if assignments and assignments.stations.exists():
                qs = qs.filter(id__in=assignments.stations.all())
            elif not user.is_superuser and not user.has_perm('branches.manage_station'):
                # Regular user with no assignments in this branch -> empty list
                qs = qs.none()

        return qs

    def get_permissions(self):
        read_codes = ['branches.view_station', 'branches.manage_station']
        write_codes = ['branches.manage_station']
        if self.action == 'record_waste':
            self.permission_codes = ['branches.add_kds_waste']
            return super().get_permissions()
        if self.action == 'record_return_cancel':
            self.permission_codes = ['branches.add_kds_return_cancel']
            return super().get_permissions()
        if self.action == 'linked_stock_levels':
            self.permission_codes = ['branches.view_kds_warehouse']
            return super().get_permissions()
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_codes
        else:
            self.permission_codes = write_codes
        return super().get_permissions()

    @action(detail=True, methods=['get'], url_path='linked-stock-levels')
    def linked_stock_levels(self, request, pk=None):
        """
        İstasyona bağlı depodaki stok kalemleri ve miktarları (KDS stok çekmecesi).
        İstasyonda depo tanımlı değilse boş liste döner.
        """
        station = self.get_object()
        wh = station.warehouse
        if not wh:
            return Response({
                'warehouse_id': None,
                'warehouse_name': None,
                'levels': [],
            })
        from apps.warehouse.selectors import get_warehouse_stock_levels
        from apps.warehouse.serializers import WarehouseStockLevelSerializer

        levels = get_warehouse_stock_levels(wh.id, low_stock_only=False)
        serializer = WarehouseStockLevelSerializer(levels, many=True)
        return Response({
            'warehouse_id': str(wh.id),
            'warehouse_name': wh.name,
            'levels': serializer.data,
        })

    @action(detail=True, methods=['post'], url_path='record-waste')
    def record_waste(self, request, pk=None):
        """
        Fire / zayi: bağlı depodan stok düşer, hareket tipi WASTE (Fire/Zayi) olarak kaydedilir.
        """
        from apps.inventory.services import InventoryService, InsufficientStockError
        from apps.inventory.serializers import StockMovementSerializer

        station = self.get_object()
        ser = KitchenStationWasteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        wh = station.warehouse
        if not wh:
            return Response(
                {'error': _('İstasyona depo atanmamış; fire/zayi kaydı yapılamaz.')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        unit = (data.get('unit') or '').strip() or None
        notes = (data.get('notes') or '').strip()

        try:
            movement = None
            if data.get('stock_item_id'):
                from apps.warehouse.models import WarehouseStockLevel

                if not WarehouseStockLevel.objects.filter(
                    warehouse_id=wh.id,
                    stock_item_id=data['stock_item_id'],
                    is_active=True,
                ).exists():
                    return Response(
                        {'error': _('Seçilen stok kalemi bu depoda tanımlı değil.')},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                movement = InventoryService.waste_stock(
                    warehouse_id=wh.id,
                    stock_item_id=data['stock_item_id'],
                    quantity=data['quantity'],
                    reference=f'KDS:{station.id}',
                    notes=notes,
                    performed_by=request.user if request.user.is_authenticated else None,
                    unit=unit,
                )
            
            if data.get('product_id'):
                from apps.production_planning.services.portion_service import PortionService
                PortionService.deduct_portions(
                    branch_id=station.branch_id,
                    product_id=data['product_id'],
                    quantity=data['quantity']
                )
                
            return Response(
                StockMovementSerializer(movement).data if movement else {'status': 'portion_deducted'}, 
                status=status.HTTP_201_CREATED if movement else status.HTTP_200_OK
            )
        except InsufficientStockError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='record-return-cancel')
    def record_return_cancel(self, request, pk=None):
        """KDS üzerinden iade/iptal: bağlı depodan stok düşer."""
        from apps.inventory.models import StockMovementType
        from apps.inventory.services import InventoryService, InsufficientStockError
        from apps.inventory.serializers import StockMovementSerializer
        from apps.branches.serializers import KitchenStationReturnCancelSerializer

        station = self.get_object()
        ser = KitchenStationReturnCancelSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        wh = station.warehouse
        if not wh:
            return Response(
                {'error': _('İstasyona depo atanmamış; iade/iptal kaydı yapılamaz.')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.warehouse.models import WarehouseStockLevel

        if not WarehouseStockLevel.objects.filter(
            warehouse_id=wh.id,
            stock_item_id=data['stock_item_id'],
            is_active=True,
        ).exists():
            return Response(
                {'error': _('Seçilen stok kalemi bu depoda tanımlı değil.')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        unit = (data.get('unit') or '').strip() or None
        notes = (data.get('notes') or '').strip()
        reason_code = (data.get('reason_code') or '').strip()
        movement_type = data['movement_type']
        common = {
            'warehouse_id': wh.id,
            'stock_item_id': data['stock_item_id'],
            'quantity': data['quantity'],
            'reference': reason_code or f'KDS:{station.id}',
            'notes': notes,
            'performed_by': request.user if request.user.is_authenticated else None,
            'supplier_id': data.get('supplier_id'),
            'unit': unit,
        }

        try:
            if movement_type == StockMovementType.RETURN:
                movement = InventoryService.return_stock(**common)
            else:
                movement = InventoryService.cancel_stock(**common)
            return Response(
                StockMovementSerializer(movement).data,
                status=status.HTTP_201_CREATED,
            )
        except InsufficientStockError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
