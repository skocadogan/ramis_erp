import logging
from datetime import timedelta

from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Exists, OuterRef, Prefetch, Q
from django.utils import timezone
from django.utils.translation import gettext as _
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rbac.drf import (
    RBACPermission,
    RBACPermissionPosOrWaiterOrderWrite,
)
from core.branch_scope import branch_filter_qs, user_may_access_branch

logger = logging.getLogger(__name__)

from apps.branches.waiter_scope import (
    enforce_waiter_order_item_scope,
    enforce_waiter_table_scope,
    ready_order_items_qs_for_waiter,
)
from apps.guest_feedback.models import (
    SurveySessionStatus,
    SurveySource,
    TableSurveySessionState,
)

from apps.branches.virtual_table_ids import (
    branch_id_for_table_scope,
    order_filter_q_for_table_scope,
)

from .combined_item_status import sync_combined_item_status_after_update
from .cancellation_reasons import resolve_cancel_source_from_request
from .models import Order, OrderItem, OrderStatus, PosIdempotencyRecord
from .order_scope import OPEN_ORDER_STATUSES
from .serializers import (
    OrderSerializer,
    OrderItemSerializer,
    OrderMinimalSerializer,
    OrderCreateSerializer,
    PosStationStockCheckSerializer,
    OrderItemSnoozeSerializer,
    KDSSlimOrderSerializer,
)
from .force_stock import deny_force_stock_response, user_may_force_stock
from .order_validation_service import assess_create_order_checks
from .services import OrderService, OrderValidationError
from .services.order_orchestrator import OrderOrchestrator
from .selectors import (
    get_kds_active_orders,
    get_kds_peer_pending_qs,
    get_kds_recall_window_minutes,
    get_kds_recallable_items_qs,
    get_order_for_api_response,
)
from .kds_item_scope import user_may_kds_line_item_by_assignment
from .idempotency import (
    SCOPE_COMPLETE,
    SCOPE_COMPLETE_TABLE,
    SCOPE_CREATE,
    build_complete_table_envelope,
    build_order_complete_envelope,
    build_order_create_envelope,
    cached_response,
    extract_idempotency_key,
    hash_request_payload,
    idempotent_execute,
    respond_if_table_already_settled,
    _lookup_record,
    _validate_existing,
)
from apps.sales.models import PaymentMethod
from apps.shifts.selectors import get_active_shift
from core.ws_deferred import schedule_kds_refresh
from .ws_broadcast import broadcast_kitchen_order_status_changed
from .services.item_status_service import apply_order_item_status, broadcast_order_item_touch

class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.select_related(
        'table',
        'table__zone',
        'table__zone__branch',
        'user',
        'branch',
        'discount_by',
        'sale',
    ).prefetch_related(
        'items',
        'items__product',
        'items__product__category',
        'items__variant',
        'items__station',
        'items__modifiers',
        'items__modifiers__modifier',
        Prefetch('items__components', queryset=OrderItem.objects.select_related('product').only(
            'id', 'product_id', 'quantity', 'status', 'parent_item_id', 'unit_name', 'portion_multiplier'
        )),
    ).annotate(
        customer_display_survey_answered=Exists(
            TableSurveySessionState.objects.filter(
                status=SurveySessionStatus.ANSWERED,
                is_active=True,
            ).filter(
                Q(
                    order_id=OuterRef('pk'),
                    source=SurveySource.POS_DISPLAY,
                ) | Q(
                    table_id=OuterRef('table_id'),
                    source=SurveySource.SMART_TABLE,
                )
            )
        )
    ).order_by('-created_at')
    serializer_class = OrderSerializer
    permission_classes = [RBACPermission]

    def get_queryset(self):
        qs = super().get_queryset()
        qs = branch_filter_qs(qs, self.request, field='branch_id')
        table_id = self.request.query_params.get('table_id')
        if table_id:
            qs = qs.filter(order_filter_q_for_table_scope(table_id))
        status_in = self.request.query_params.get('status')
        if status_in:
            parts = [p.strip() for p in status_in.split(',') if p.strip()]
            if parts:
                qs = qs.filter(status__in=parts)
        return qs

    def get_permissions(self):
        read_order = ['orders.view_order', 'orders.manage_order']
        kds_feed = ['orders.view_kds']
        pos_writes = ['orders.manage_order', 'pos.view_pos']
        discount_apply = ['pos.apply_discount']
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_order
            return [RBACPermission()]
        if self.action in ['create', 'check_station_stock']:
            self.permission_codes = pos_writes
            return [RBACPermissionPosOrWaiterOrderWrite()]
        if self.action in ['update', 'partial_update', 'destroy', 'complete', 'complete_table', 'force_close']:
            self.permission_codes = pos_writes
            return [RBACPermissionPosOrWaiterOrderWrite()]
        if self.action in ['cancel', 'cancel_table']:
            self.permission_codes = pos_writes + kds_feed
            return [RBACPermission()]
        if self.action == 'sync_reconcile':
            self.permission_codes = pos_writes
            return [RBACPermissionPosOrWaiterOrderWrite()]
        if self.action == 'transfer_table':
            self.permission_codes = pos_writes
            return [RBACPermissionPosOrWaiterOrderWrite()]
        if self.action in ('kds_active', 'kds_peer_pending', 'kds_recall'):
            self.permission_codes = kds_feed
            return [RBACPermission()]
        if self.action in ['apply_discount', 'remove_discount']:
            self.permission_codes = discount_apply
            return [RBACPermission()]
        self.permission_codes = read_order
        return [RBACPermission()]

    def get_serializer_class(self):
        if self.action == 'create':
            return OrderCreateSerializer
        if self.action == 'check_station_stock':
            return PosStationStockCheckSerializer
        if self.action == 'kds_active':
            return KDSSlimOrderSerializer
        return OrderSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if not user_may_access_branch(request.user, str(data['branch_id'])):
            return Response(
                {'detail': _('Bu şubeye sipariş oluşturma yetkiniz yok.')},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            enforce_waiter_table_scope(
                user=request.user,
                branch_id=data['branch_id'],
                table_id=data.get('table_id'),
            )
        except PermissionDenied as e:
            return Response({'detail': str(e)}, status=status.HTTP_403_FORBIDDEN)

        idem_key = extract_idempotency_key(request)
        hash_payload = dict(request.data)
        skip_station_stock_check = bool(request.data.get('skip_station_stock_check', False))
        if skip_station_stock_check and not user_may_force_stock(request):
            return deny_force_stock_response()

        def perform():
            return OrderOrchestrator.perform_create(
                branch_id=data['branch_id'],
                table_id=data.get('table_id'),
                order_type=data.get('order_type', 'TABLE'),
                user=request.user,
                notes=data.get('notes', ''),
                items_data=data['items'],
                stock_tracking_mode=data.get('stock_tracking_mode', 'PRODUCT'),
                customer_id=data.get('customer_id'),
                skip_station_stock_check=skip_station_stock_check,
                idem_key=idem_key,
                request_data=dict(request.data),
            )

        try:
            return idempotent_execute(
                request,
                scope=SCOPE_CREATE,
                request_payload=hash_payload,
                branch_id=data['branch_id'],
                perform=perform,
            )
        except OrderValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='check_station_stock')
    def check_station_stock(self, request):
        """Sipariş oluşturmadan önce mutfak istasyonu depolarında stok / kritik seviye ve 'Ürün Kalmadı' kontrolü."""
        serializer = PosStationStockCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if not user_may_access_branch(request.user, str(data['branch_id'])):
            return Response(
                {'detail': _('Bu şube için stok kontrolü yapma yetkiniz yok.')},
                status=status.HTTP_403_FORBIDDEN,
            )

        return Response(assess_create_order_checks(
            str(data['branch_id']), 
            data["items"],
            stock_tracking_mode=data.get('stock_tracking_mode', 'PRODUCT')
        ))

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        order = self.get_object()
        try:
            enforce_waiter_table_scope(
                user=request.user,
                branch_id=order.branch_id,
                table_id=order.table_id,
            )
        except PermissionDenied as e:
            return Response({'detail': str(e)}, status=status.HTTP_403_FORBIDDEN)

        payment_method = request.data.get('payment_method', PaymentMethod.CASH)
        payments = request.data.get('payments')
        allow_negative_stock = bool(request.data.get('allow_negative_stock', False))
        if allow_negative_stock and not user_may_force_stock(request):
            return deny_force_stock_response()
        if payments is not None and not isinstance(payments, list):
            return Response({"error": _("payments bir dizi olmalıdır.")}, status=status.HTTP_400_BAD_REQUEST)

        idem_key = extract_idempotency_key(request)
        hash_payload = dict(request.data)

        if order.status == OrderStatus.COMPLETED:
            if idem_key:
                existing = _lookup_record(idem_key)
                if existing:
                    conflict = _validate_existing(existing, SCOPE_COMPLETE, hash_request_payload(hash_payload))
                    if conflict:
                        return conflict
                    return cached_response(existing)
            sale_id = None
            if hasattr(order, 'sale'):
                try:
                    sale_id = str(order.sale.id)
                except Exception:
                    sale_id = None
            envelope = build_order_complete_envelope(
                OrderMinimalSerializer(order).data,
                sale_id,
                key=idem_key,
                replay=True,
            )
            return Response(envelope, status=status.HTTP_200_OK)

        def perform():
            pos_terminal = OrderService.resolve_pos_terminal(
                str(order.branch_id), request.data.get("pos_terminal_id")
            )
            shift = get_active_shift(order.branch_id, terminal_id=pos_terminal.id if pos_terminal else None)
            return OrderOrchestrator.perform_complete(
                order, payment_method, request.user, payments, shift, pos_terminal,
                allow_negative_stock, idem_key,
            )

        try:
            return idempotent_execute(
                request,
                scope=SCOPE_COMPLETE,
                request_payload=hash_payload,
                branch_id=order.branch_id,
                perform=perform,
            )
        except OrderValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        order = self.get_object()
        reason_code = request.data.get('reason_code')
        reason_text = request.data.get('reason_text')
        try:
            OrderService.cancel_order(order, reason_code=reason_code, reason_text=reason_text)
        except OrderValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        schedule_kds_refresh(order.branch_id, "order_cancelled", order_id=str(order.id))
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def force_close(self, request, pk=None):
        order = self.get_object()
        try:
            OrderService.force_close(order, request.user)
        except OrderValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        schedule_kds_refresh(order.branch_id, "order_completed", order_id=str(order.id))
        return Response(OrderSerializer(order).data)

    @action(detail=False, methods=['post'], url_path='complete_table')
    def complete_table(self, request):
        table_id = request.data.get('table_id')
        payment_method = request.data.get('payment_method', PaymentMethod.CASH)
        payments = request.data.get('payments')
        branch_id = request.data.get('branch_id')
        allow_negative_stock = bool(request.data.get('allow_negative_stock', False))
        if allow_negative_stock and not user_may_force_stock(request):
            return deny_force_stock_response()
        if payments is not None and not isinstance(payments, list):
            return Response({"error": _("payments bir dizi olmalıdır.")}, status=status.HTTP_400_BAD_REQUEST)

        if not table_id:
            return Response({"error": _("table_id required")}, status=status.HTTP_400_BAD_REQUEST)

        first_for_branch = None
        scope_branch_id = branch_id
        if not scope_branch_id:
            scope_branch_id = branch_id_for_table_scope(table_id)
        try:
            if scope_branch_id:
                enforce_waiter_table_scope(
                    user=request.user,
                    branch_id=scope_branch_id,
                    table_id=table_id,
                )
        except PermissionDenied as e:
            return Response({'detail': str(e)}, status=status.HTTP_403_FORBIDDEN)

        idem_key = extract_idempotency_key(request)
        hash_payload = dict(request.data)

        already_settled = respond_if_table_already_settled(
            request, table_id, idem_key, hash_request_payload(hash_payload),
        )
        if already_settled is not None:
            return already_settled

        def perform():
            eff_branch_id = str(branch_id) if branch_id else scope_branch_id
            pos_terminal = (
                OrderService.resolve_pos_terminal(eff_branch_id, request.data.get("pos_terminal_id"))
                if eff_branch_id
                else None
            )
            shift = get_active_shift(eff_branch_id, terminal_id=pos_terminal.id if pos_terminal else None) if eff_branch_id else None
            return OrderOrchestrator.perform_complete_table(
                table_id, payment_method, request.user, branch_id, shift, pos_terminal,
                allow_negative_stock, payments, idem_key, eff_branch_id,
            )

        try:
            return idempotent_execute(
                request,
                scope=SCOPE_COMPLETE_TABLE,
                request_payload=hash_payload,
                branch_id=scope_branch_id,
                perform=perform,
            )
        except OrderValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='cancel_table')
    def cancel_table(self, request):
        """Masadaki tüm aktif siparişleri toplu iptal eder."""
        from apps.audit.services import record_audit

        table_id = request.data.get('table_id')
        branch_id = request.data.get('branch_id')
        reason_code = request.data.get('reason_code')
        reason_text = request.data.get('reason_text')

        if not table_id:
            return Response({"error": _("table_id gereklidir.")}, status=status.HTTP_400_BAD_REQUEST)

        scope_branch_id = branch_id or branch_id_for_table_scope(table_id)

        # Branch erişim kontrolü: waiter dışı kullanıcılar (POS) için de geçerli
        if scope_branch_id:
            from core.branch_scope import accessible_branch_id_strings
            allowed = accessible_branch_id_strings(request.user)
            if allowed is not None and scope_branch_id not in allowed:
                return Response({'detail': _("Bu şubeye erişim yetkiniz yok.")}, status=status.HTTP_403_FORBIDDEN)

        try:
            if scope_branch_id:
                enforce_waiter_table_scope(
                    user=request.user,
                    branch_id=scope_branch_id,
                    table_id=table_id,
                )
        except PermissionDenied as e:
            return Response({'detail': str(e)}, status=status.HTTP_403_FORBIDDEN)

        active_orders = list(
            Order.objects.filter(
                order_filter_q_for_table_scope(table_id),
                status__in=OPEN_ORDER_STATUSES,
            ).select_related('branch', 'table', 'user', 'discount_by')
        )
        if not active_orders:
            return Response({"cancelled_count": 0, "order_ids": []})

        cancelled_ids = []
        with transaction.atomic():
            for order in active_orders:
                try:
                    OrderService.cancel_order(order, reason_code=reason_code, reason_text=reason_text)
                    cancelled_ids.append(str(order.id))
                except OrderValidationError:
                    pass

        eff_branch_id = scope_branch_id or (str(active_orders[0].branch_id) if active_orders else None)
        if eff_branch_id and cancelled_ids:
            record_audit(
                action='order.cancelled',
                target_type='branches.table',
                target_id=str(table_id),
                metadata={
                    'reason_code': reason_code,
                    'reason_text': reason_text,
                    'cancelled_count': len(cancelled_ids),
                    'order_ids': cancelled_ids,
                },
            )
            schedule_kds_refresh(eff_branch_id, "cancel_table", table_id=str(table_id), order_ids=cancelled_ids)

        return Response({"cancelled_count": len(cancelled_ids), "order_ids": cancelled_ids})

    @action(detail=False, methods=['post'], url_path='sync/reconcile')
    def sync_reconcile(self, request):
        """Offline kuyruk uzlaşması: idempotency anahtarlarının sunucu durumu."""
        keys = request.data.get('idempotency_keys')
        if not isinstance(keys, list):
            return Response(
                {'detail': _('idempotency_keys bir dizi olmalıdır.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        keys = [str(k).strip() for k in keys if str(k).strip()][:200]
        truncated_keys = [k[:128] for k in keys]
        existing = PosIdempotencyRecord.objects.filter(
            idempotency_key__in=truncated_keys, is_active=True
        )
        record_map = {r.idempotency_key: r for r in existing}
        results = []
        for key in keys:
            rec = record_map.get(key[:128])
            if not rec:
                results.append({'idempotency_key': key, 'status': 'missing'})
                continue
            results.append({
                'idempotency_key': key,
                'status': 'found',
                'scope': rec.scope,
                'response_status': rec.response_status,
                'response_body': rec.response_body,
                'resource_id': rec.resource_id,
                'created_at': rec.created_at.isoformat(),
            })
        return Response({'results': results})

    @action(detail=False, methods=['get'])
    def kds_active(self, request):
        """PENDING, PREPARING veya READY kalem içeren siparişleri döner."""
        from django.conf import settings
        from django.core.cache import cache
        import random

        station_id = request.query_params.get('station_id')
        qp_branch = (request.query_params.get('branch_id') or '').strip() or None
        user_branch = getattr(request.user, 'branch_id', None)
        scope_branch = qp_branch or (str(user_branch) if user_branch else None)

        bid = scope_branch or 'all'
        kds_version = cache.get(f'kds_version:{bid}', 1)

        cache_key = f'kds_active:{bid}:{station_id or "all"}:{kds_version}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        # Şube kapsamı branch_filter_qs ile; yalnızca ?branch_id daraltması burada uygulanır.
        active_orders = get_kds_active_orders(branch_id=qp_branch, station_id=station_id)
        active_orders = branch_filter_qs(active_orders, request, field='branch_id')
        active_orders = list(active_orders)

        ctx = self.get_serializer_context()
        if getattr(settings, 'ENABLE_SMART_FIRING_V2', False) and scope_branch:
            from .smart_firing import batch_station_queue_metrics

            sid_set = set()
            for ord_obj in active_orders:
                for it in ord_obj.items.all():
                    if it.station_id:
                        sid_set.add(it.station_id)
            ctx = {
                **ctx,
                'station_queue_metrics': batch_station_queue_metrics(scope_branch, sid_set),
            }

        serializer = self.get_serializer(active_orders, many=True, context=ctx)
        data = serializer.data

        if station_id:
            trimmed = []
            for order_data in data:
                parent_ids_with_components = {
                    str(it.get('parent_item'))
                    for it in order_data['items']
                    if it.get('parent_item')
                }
                filtered_items = []
                for item in order_data['items']:
                    if str(item.get('id')) in parent_ids_with_components:
                        continue
                    if item.get('station_id') is not None and str(item.get('station_id')) != str(station_id):
                        continue
                    filtered_items.append(item)
                order_data['items'] = filtered_items
                if order_data['items']:
                    trimmed.append(order_data)
            data = trimmed

        # Cache TTL: settings'dan al, jitter ekle (thundering herd koruması)
        kds_cache_ttl = getattr(settings, 'KDS_ACTIVE_CACHE_TTL', 60)
        kds_jitter = random.randint(-max(1, kds_cache_ttl // 5), max(1, kds_cache_ttl // 5))
        cache.set(cache_key, data, timeout=max(5, kds_cache_ttl + kds_jitter))
        return Response(data)

    @action(detail=False, methods=['get'], url_path='kds-peer-pending')
    def kds_peer_pending(self, request):
        """
        Bu istasyonda olmayan mutfak satırları: aynı masada başka KDS'lerde
        hâlâ PENDING / PREPARING kalan kalemlerin özeti.
        """
        station_id = request.query_params.get('station_id')
        if not station_id:
            return Response([])

        qs = get_kds_peer_pending_qs(station_id)
        qs = branch_filter_qs(qs, request, field='order__branch_id')
        out = [
            {
                'table_name': oi.order.table.name if oi.order and oi.order.table else '',
                'station_name': oi.station.name if oi.station else '',
                'quantity': oi.quantity,
                'product_name': oi.product.name if oi.product else '',
                'unit_name': oi.unit_name,
            }
            for oi in qs
        ]
        return Response(out)

    @action(detail=False, methods=['get'], url_path='kds-recall')
    def kds_recall(self, request):
        """Servise gönderilmiş kalemler — KDS geri çağır drawer listesi."""
        station_id = request.query_params.get('station_id')
        branch_id = request.query_params.get('branch_id') or getattr(request.user, 'branch_id', None)
        if not branch_id:
            return Response(
                {'detail': _('branch_id sorgu parametresi veya kullanıcı şubesi gerekli.')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = get_kds_recallable_items_qs(branch_id=branch_id, station_id=station_id)
        qs = branch_filter_qs(qs, request, field='order__branch_id')

        groups_map: dict[str, dict] = {}
        item_serializer = OrderItemSerializer(context=self.get_serializer_context())
        for item in qs:
            if not user_may_kds_line_item_by_assignment(request.user, item):
                continue
            oid = str(item.order_id)
            if oid not in groups_map:
                order = item.order
                table = order.table
                groups_map[oid] = {
                    'order_id': oid,
                    'order_number': order.order_number,
                    'table_name': table.name if table else (
                        _('Paket') if order.order_type == 'TAKEAWAY' else _('Masa')
                    ),
                    'order_type': order.order_type,
                    'sent_at': item.updated_at.isoformat(),
                    'items': [],
                }
            else:
                sent_at = groups_map[oid]['sent_at']
                if item.updated_at.isoformat() > sent_at:
                    groups_map[oid]['sent_at'] = item.updated_at.isoformat()
            groups_map[oid]['items'].append(item_serializer.to_representation(item))

        groups = sorted(groups_map.values(), key=lambda g: g['sent_at'], reverse=True)
        return Response({
            'recall_window_minutes': get_kds_recall_window_minutes(),
            'groups': groups,
        })

    @action(detail=False, methods=['post'])
    def transfer_table(self, request):
        from_table_id = request.data.get('from_table_id')
        to_table_id = request.data.get('to_table_id')

        if not from_table_id or not to_table_id:
            return Response(
                {"error": _("from_table_id ve to_table_id gereklidir.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            OrderService.transfer_table(from_table_id, to_table_id)
        except OrderValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Transfer affects both tables; they must be in the same branch by design
        branch_id = Order.objects.filter(table_id=from_table_id).values_list('branch_id', flat=True).first()
        schedule_kds_refresh(
            branch_id,
            "transfer_table",
            from_table_id=str(from_table_id),
            to_table_id=str(to_table_id),
        )
        return Response({"message": _("Masa başarıyla taşındı.")})

    @action(detail=True, methods=['post'], url_path='apply_discount')
    def apply_discount(self, request, pk=None):
        order = self.get_object()
        try:
            enforce_waiter_table_scope(
                user=request.user,
                branch_id=order.branch_id,
                table_id=order.table_id,
            )
        except PermissionDenied as e:
            return Response({'detail': str(e)}, status=status.HTTP_403_FORBIDDEN)
        discount_type = request.data.get('discount_type', 'ORDER')
        try:
            discount_amount = float(request.data.get('discount_amount', 0))
        except (TypeError, ValueError):
            return Response(
                {"error": _("discount_amount geçerli bir sayı olmalıdır.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            OrderService.apply_discount(
                order=order,
                discount_type=discount_type,
                discount_amount=discount_amount,
                applied_by=request.user if request.user.is_authenticated else None,
                order_item_id=request.data.get('order_item_id'),
            )
        except OrderValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Order.DoesNotExist:
            return Response({"error": _("Kayıt bulunamadı.")}, status=status.HTTP_404_NOT_FOUND)

        schedule_kds_refresh(
            order.branch_id,
            "discount_applied",
            order_id=str(order.id),
            discount_type=discount_type,
            discount_amount=str(discount_amount),
        )
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=['post'])
    def remove_discount(self, request, pk=None):
        order = self.get_object()
        try:
            enforce_waiter_table_scope(
                user=request.user,
                branch_id=order.branch_id,
                table_id=order.table_id,
            )
        except PermissionDenied as e:
            return Response({'detail': str(e)}, status=status.HTTP_403_FORBIDDEN)
        try:
            OrderService.remove_discount(order)
        except OrderValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        schedule_kds_refresh(order.branch_id, "discount_removed", order_id=str(order.id))
        return Response(self.get_serializer(order).data)


class OrderItemViewSet(viewsets.ModelViewSet):
    queryset = OrderItem.objects.select_related(
        'product', 'product__category', 'variant', 'station', 'order', 'order__table'
    ).prefetch_related(
        'modifiers', 'modifiers__modifier',
        Prefetch('components', queryset=OrderItem.objects.select_related('product').only(
            'id', 'product_id', 'quantity', 'status', 'parent_item_id', 'unit_name', 'portion_multiplier'
        )),
    ).order_by('-updated_at')
    serializer_class = OrderItemSerializer
    permission_classes = [RBACPermission]

    def get_queryset(self):
        qs = super().get_queryset()
        qs = branch_filter_qs(qs, self.request, field='order__branch_id')
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
            if status_filter == OrderStatus.READY:
                qs = qs.filter(parent_item__isnull=True)
        return qs

    def get_permissions(self):
        read_order = ['orders.view_order', 'orders.manage_order']
        kds_update = ['orders.view_kds', 'orders.manage_order', 'waiter.access']
        pos_writes = ['orders.manage_order', 'pos.view_pos']
        if self.action in ('ready_for_waiter', 'ready_for_waiter_count'):
            self.permission_codes = ['waiter.access']
            return [RBACPermission()]
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_order
            return [RBACPermission()]
        if self.action in ('set_status', 'bulk_set_status', 'bulk_acknowledge', 'recall'):
            self.permission_codes = kds_update
            return [RBACPermission()]
        if self.action == 'cancel':
            self.permission_codes = kds_update + pos_writes
            return [RBACPermission()]
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'update_quantity']:
            self.permission_codes = pos_writes
            return [RBACPermissionPosOrWaiterOrderWrite()]
        if self.action in ('firing_force_now', 'firing_snooze'):
            self.permission_codes = ['orders.manage_order', 'orders.manage_smart_firing']
            return [RBACPermission()]
        self.permission_codes = read_order
        return [RBACPermission()]

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        item = self.get_object()
        reason_code = request.data.get('reason_code')
        reason_text = request.data.get('reason_text')
        if request.user.has_permission('orders.view_kds') and not request.user.has_permission('pos.view_pos'):
            if not user_may_kds_line_item_by_assignment(request.user, item):
                return Response(
                    {'detail': _('Bu sipariş kalemi için bu mutfak istasyonunda yetkiniz yok.')},
                    status=status.HTTP_403_FORBIDDEN,
                )
        else:
            try:
                enforce_waiter_order_item_scope(user=request.user, item=item)
            except PermissionDenied as e:
                return Response({'detail': str(e)}, status=status.HTTP_403_FORBIDDEN)
        try:
            cancel_source = resolve_cancel_source_from_request(request)
            item, order = OrderService.cancel_item(
                item,
                reason_code=reason_code,
                reason_text=reason_text,
                cancel_source=cancel_source,
            )
        except OrderValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        broadcast_kitchen_order_status_changed(
            str(order.branch_id),
            {
                'event': 'status_update',
                'order_id': str(order.id),
                'item_id': str(item.id),
                'item_status': str(item.status),
                **({'table_id': str(order.table_id)} if order.table_id else {}),
            },
        )
        schedule_kds_refresh(order.branch_id, "item_cancelled", item_id=str(item.id), order_id=str(order.id))
        return Response(OrderItemSerializer(item).data)

    @action(detail=True, methods=['post'])
    def recall(self, request, pk=None):
        item = self.get_object()
        if request.user.has_permission('orders.view_kds'):
            if not user_may_kds_line_item_by_assignment(request.user, item):
                return Response(
                    {'detail': _('Bu sipariş kalemi için bu mutfak istasyonunda yetkiniz yok.')},
                    status=status.HTTP_403_FORBIDDEN,
                )
        try:
            item, order = OrderService.recall_item(item)
        except OrderValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        broadcast_kitchen_order_status_changed(
            str(order.branch_id),
            {
                'event': 'status_update',
                'order_id': str(order.id),
                'item_id': str(item.id),
                'item_status': str(item.status),
                **({'table_id': str(order.table_id)} if order.table_id else {}),
            },
        )
        schedule_kds_refresh(order.branch_id, 'item_recalled', item_id=str(item.id), order_id=str(order.id))
        return Response(OrderItemSerializer(item, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['post'])
    def update_quantity(self, request, pk=None):
        item = self.get_object()
        try:
            enforce_waiter_order_item_scope(user=request.user, item=item)
        except PermissionDenied as e:
            return Response({'detail': str(e)}, status=status.HTTP_403_FORBIDDEN)
        try:
            new_qty = int(request.data.get('quantity'))
        except (ValueError, TypeError):
            return Response({"error": _("Geçersiz miktar.")}, status=status.HTTP_400_BAD_REQUEST)
        if new_qty <= 0:
            return Response({"error": _("Geçersiz miktar.")}, status=status.HTTP_400_BAD_REQUEST)

        item, order, created_pending = OrderService.update_item_quantity(
            item,
            int(new_qty),
            resend_delta_to_kitchen=bool(request.data.get('resend_delta_to_kitchen')),
        )

        schedule_kds_refresh(
            order.branch_id, "item_quantity_updated", item_id=str(item.id), order_id=str(order.id)
        )
        from .ws_broadcast import broadcast_kitchen_order_status_changed

        if created_pending:
            kitchen_delta = sum(int(p.quantity) for p in created_pending)
            broadcast_kitchen_order_status_changed(
                str(order.branch_id),
                {
                    'event': 'kitchen_delta_added',
                    'order_id': str(order.id),
                    'parent_item_id': str(item.id),
                    'delta': kitchen_delta,
                    'pending_item_ids': [str(p.id) for p in created_pending],
                    **({'table_id': str(order.table_id)} if order.table_id else {}),
                },
            )
        else:
            broadcast_kitchen_order_status_changed(
                str(order.branch_id),
                {
                    'event': 'quantity_updated',
                    'order_id': str(order.id),
                    'item_id': str(item.id),
                    'new_quantity': new_qty,
                    **({'table_id': str(order.table_id)} if order.table_id else {}),
                },
            )
        return Response(OrderItemSerializer(item).data)

    def _ensure_firing_permissions(self, request, item):
        has_manage = request.user.has_permission('orders.manage_order')
        has_smart = request.user.has_permission('orders.manage_smart_firing')
        if not has_manage and not has_smart:
            return Response(
                {
                    'detail': _(
                        'Bu işlem için orders.manage_order veya orders.manage_smart_firing yetkisi gerekir.'
                    ),
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if request.user.has_permission('orders.view_kds'):
            if not user_may_kds_line_item_by_assignment(request.user, item):
                return Response(
                    {'detail': _('Bu sipariş kalemi için bu mutfak istasyonunda yetkiniz yok.')},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return None
        if not has_manage:
            return Response(
                {
                    'detail': _(
                        'orders.manage_smart_firing yalnızca KDS (orders.view_kds) ile birlikte kullanılabilir; '
                        'aksi halde orders.manage_order gerekir.'
                    ),
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        return None

    @action(detail=True, methods=['post'], url_path='firing/force-now')
    def firing_force_now(self, request, pk=None):
        item = self.get_object()
        if err := self._ensure_firing_permissions(request, item):
            return err
        if item.status == OrderStatus.CANCELLED:
            return Response({'error': _('İptal edilmiş kalem için ateşleme yapılamaz.')}, status=status.HTTP_400_BAD_REQUEST)
        if item.status != OrderStatus.PENDING:
            return Response({'error': _('Yalnızca bekleyen kalemler şimdi zamanlanabilir.')}, status=status.HTTP_400_BAD_REQUEST)
        ts = timezone.now()
        with transaction.atomic():
            item.scheduled_start_time = ts
            item.firing_forced_at = ts
            item.status = OrderStatus.PREPARING
            item.save(update_fields=['scheduled_start_time', 'firing_forced_at', 'status', 'updated_at'])
            order = item.order
            if order.status == OrderStatus.PENDING:
                order.status = OrderStatus.PREPARING
                order.save(update_fields=['status', 'updated_at'])

        schedule_kds_refresh(order.branch_id, 'firing_force_now', item_id=str(item.id), order_id=str(order.id))
        data = OrderItemSerializer(item, context=self.get_serializer_context()).data
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='firing/snooze')
    def firing_snooze(self, request, pk=None):
        item = self.get_object()
        if err := self._ensure_firing_permissions(request, item):
            return err
        ser = OrderItemSnoozeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        minutes = int(ser.validated_data['minutes'])
        if item.status == OrderStatus.CANCELLED:
            return Response({'error': _('İptal edilmiş kalem ertelenemez.')}, status=status.HTTP_400_BAD_REQUEST)
        if item.status != OrderStatus.PENDING:
            return Response({'error': _('Erteleme yalnızca bekleyen kalemler için geçerlidir.')}, status=status.HTTP_400_BAD_REQUEST)
        base = item.scheduled_start_time or timezone.now()
        with transaction.atomic():
            item.scheduled_start_time = base + timedelta(minutes=minutes)
            item.firing_forced_at = None
            item.save(update_fields=['scheduled_start_time', 'firing_forced_at', 'updated_at'])
            order = item.order

        schedule_kds_refresh(order.branch_id, 'firing_snooze', item_id=str(item.id), order_id=str(order.id))
        data = OrderItemSerializer(item, context=self.get_serializer_context()).data
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='ready-for-waiter')
    def ready_for_waiter(self, request):
        branch_id = request.query_params.get('branch_id') or getattr(request.user, 'branch_id', None)
        if not branch_id:
            return Response(
                {'detail': _('branch_id sorgu parametresi veya kullanıcı şubesi gerekli.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qs = ready_order_items_qs_for_waiter(request.user, branch_id)
        qs = branch_filter_qs(qs, request, field='order__branch_id')
        return Response(OrderItemSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'], url_path='ready-for-waiter/count')
    def ready_for_waiter_count(self, request):
        """Garson hazır rozet / dashboard için hafif sayaç (tam liste yerine)."""
        branch_id = request.query_params.get('branch_id') or getattr(request.user, 'branch_id', None)
        if not branch_id:
            return Response(
                {'detail': _('branch_id sorgu parametresi veya kullanıcı şubesi gerekli.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qs = ready_order_items_qs_for_waiter(request.user, branch_id)
        qs = branch_filter_qs(qs, request, field='order__branch_id')
        return Response({'count': qs.count()})

    @action(detail=True, methods=['post'])
    def set_status(self, request, pk=None):
        new_status = request.data.get('status')
        with transaction.atomic():
            item = OrderItem.objects.select_for_update(of=("self",)).select_related('order').get(pk=pk)
            order = Order.objects.select_for_update().get(pk=item.order_id)
            err = apply_order_item_status(request, item, new_status)
            if err is not None:
                transaction.set_rollback(True)
                return err
            item.refresh_from_db()
        return Response(self.get_serializer(item).data)

    @action(detail=False, methods=['post'], url_path='bulk-set-status')
    def bulk_set_status(self, request):
        ids = request.data.get('ids')
        new_status = request.data.get('status')
        if new_status not in [s[0] for s in OrderStatus.choices]:
            return Response({"error": _("Invalid status")}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(ids, list) or len(ids) == 0:
            return Response({"error": _("ids listesi gerekli.")}, status=status.HTTP_400_BAD_REQUEST)
        id_set = {str(i) for i in ids}
        if len(id_set) != len(ids):
            return Response({"error": _("Yinelenen id olamaz.")}, status=status.HTTP_400_BAD_REQUEST)
        qs = self.get_queryset().filter(id__in=id_set)
        if qs.count() != len(id_set):
            return Response(
                {"error": _("Bazı kalemler bulunamadı veya bu şubeye ait değil.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        affected_orders = set()
        with transaction.atomic():
            # select_related ile gelen nullable FK'ler outer join üretir; PostgreSQL
            # bu durumda FOR UPDATE'a izin vermez. Yalnızca OrderItem satırlarını kilitle.
            for item in qs.select_for_update(of=("self",)):
                err = apply_order_item_status(request, item, new_status, silent=True)
                if err is not None:
                    transaction.set_rollback(True)
                    return err
                affected_orders.add(item.order)
        
        # Döngü bittikten sonra her sipariş için bir kez broadcast yap
        for order in affected_orders:
            schedule_kds_refresh(order.branch_id, "bulk_status_update", order_id=str(order.id))
            
        return Response({"ok": True, "count": len(id_set)}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='bulk-acknowledge')
    def bulk_acknowledge(self, request):
        """READY kalemleri garson mutfak bildiriminde görüldü olarak işaretler (teslim değil)."""
        ids = request.data.get('ids')
        if not isinstance(ids, list) or len(ids) == 0:
            return Response({'error': _('ids listesi gerekli.')}, status=status.HTTP_400_BAD_REQUEST)
        id_set = {str(i) for i in ids}
        if len(id_set) != len(ids):
            return Response({'error': _('Yinelenen id olamaz.')}, status=status.HTTP_400_BAD_REQUEST)

        qs = self.get_queryset().filter(id__in=id_set, status=OrderStatus.READY)
        if qs.count() != len(id_set):
            return Response(
                {'error': _('Bazı kalemler bulunamadı, READY değil veya bu şubeye ait değil.')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        affected_orders = set()
        now = timezone.now()
        with transaction.atomic():
            for item in qs.select_for_update(of=('self',)):
                if request.user.has_permission('waiter.access') and not request.user.has_permission('orders.view_kds'):
                    try:
                        enforce_waiter_order_item_scope(user=request.user, item=item)
                    except PermissionDenied as e:
                        transaction.set_rollback(True)
                        return Response({'detail': str(e)}, status=status.HTTP_403_FORBIDDEN)
                if item.waiter_acknowledged_at is None:
                    item.waiter_acknowledged_at = now
                    item.save(update_fields=['waiter_acknowledged_at', 'updated_at'])
                affected_orders.add(item.order)

        for order in affected_orders:
            for item in order.items.filter(id__in=id_set):
                broadcast_order_item_touch(item, reason='item_acknowledged')

        return Response({'ok': True, 'count': len(id_set)}, status=status.HTTP_200_OK)
