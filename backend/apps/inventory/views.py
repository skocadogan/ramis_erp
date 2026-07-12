from core.decimal_constants import ZERO_QTY
from django.db.models import Count, F, Q
from django.utils.translation import gettext as _

from apps.inventory.stock_minimum import (
    ZERO_QTY,
    normalize_minimum_quantity,
    q_low_stock_stock_item_vs_annotated_current,
)
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rbac.drf import RBACPermission
from core.branch_scope import (
    user_accessible_warehouse_id_strings,
    filter_queryset_by_accessible_warehouses,
)

from .models import (
    StockItem,
    StockMovement,
    Supplier,
    StockCategory,
    StockMovementType,
    StockUnit,
    Allergen,
    StockReceiptDraft,
    StockReceiptDraftStatus,
    ReturnDisposalFlow,
    ReturnDisposalFlowStatus,
)
from .serializers import (
    StockItemSerializer,
    StockMovementSerializer,
    StockMovementCreateSerializer,
    SupplierSerializer,
    StockCategorySerializer,
    StockUnitSerializer,
    AllergenSerializer,
    StockItemWithWarehouseSerializer,
    StockReceiptDraftSerializer,
    FEFOInventoryReportListSerializer,
    FEFOInventoryReportSerializer,
    ReturnDisposalFlowSerializer,
)
from .services import InventoryService, SupplierService, StockItemService, InsufficientStockError
from . import selectors


from rest_framework.pagination import PageNumberPagination

class StockItemPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200

class StockMovementPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 500


class StockReceiptDraftPagination(PageNumberPagination):
    page_size = 30
    page_size_query_param = 'page_size'
    max_page_size = 100

class StockItemViewSet(viewsets.ModelViewSet):
    serializer_class = StockItemSerializer
    permission_classes = [RBACPermission]
    pagination_class = StockItemPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'sku', 'barcode']

    def get_permissions(self):
        read_codes = ['inventory.view_stock_item', 'inventory.manage_stock_item']
        expiry_read_codes = [
            'inventory.view_expiry_risk',
            'inventory.view_stock_item',
            'inventory.manage_stock_item',
        ]
        write_codes = ['inventory.manage_stock_item']
        if self.action in ['list', 'retrieve', 'low_stock', 'summary', 'warehouse_levels', 'price_increases']:
            self.permission_codes = read_codes
        elif self.action in ['expiring_lots', 'fefo_report', 'fefo_report_detail']:
            self.permission_codes = expiry_read_codes
        else:
            self.permission_codes = write_codes
        return super().get_permissions()

    def get_queryset(self):
        warehouse_id = self.request.query_params.get('warehouse_id')
        category_id = self.request.query_params.get('category_id')
        supplier_id = self.request.query_params.get('supplier_id')
        is_low_stock = self.request.query_params.get('is_low_stock') == 'true'
        stock_status = self.request.query_params.get('stock_status')

        allowed_wh = user_accessible_warehouse_id_strings(self.request.user)
        limit_ids = None
        if allowed_wh is not None:
            limit_ids = list(allowed_wh)
            if warehouse_id and str(warehouse_id) not in allowed_wh:
                return StockItem.objects.none()

        qs = selectors.get_active_stock_items(
            warehouse_id=warehouse_id,
            category_id=category_id,
            limit_warehouse_ids=None if warehouse_id else limit_ids,
            supplier_id=supplier_id,
        )
        if is_low_stock:
            qs = qs.filter(is_low_stock=True)
        
        if stock_status:
            from .stock_minimum import MINIMUM_UNLIMITED_SENTINEL
            from django.db.models import Q, F
            
            if stock_status == 'normal':
                qs = qs.filter(
                    Q(current_quantity__gt=F('effective_minimum')) | 
                    Q(effective_minimum=MINIMUM_UNLIMITED_SENTINEL)
                )
            elif stock_status == 'low':
                qs = qs.filter(
                    Q(current_quantity__lt=F('effective_minimum')) & 
                    Q(current_quantity__gt=0) & 
                    Q(effective_minimum__gt=MINIMUM_UNLIMITED_SENTINEL)
                )
            elif stock_status == 'critical':
                qs = qs.filter(
                    Q(current_quantity__lte=0) & 
                    Q(effective_minimum__gt=MINIMUM_UNLIMITED_SENTINEL)
                )
            elif stock_status == 'warning':
                qs = qs.filter(
                    Q(current_quantity=F('effective_minimum')) & 
                    Q(effective_minimum__gt=MINIMUM_UNLIMITED_SENTINEL)
                )


        return qs


    def get_serializer_class(self):
        warehouse_id = self.request.query_params.get('warehouse_id')
        if warehouse_id and self.action == 'list':
            return StockItemWithWarehouseSerializer
        return StockItemSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['warehouse_id'] = self.request.query_params.get('warehouse_id')
        return context

    def perform_destroy(self, instance):
        StockItemService.delete_stock_item(instance.id)

    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        warehouse_id = request.query_params.get('warehouse_id')
        category_id = request.query_params.get('category_id')
        allowed_wh = user_accessible_warehouse_id_strings(request.user)
        limit_ids = None
        if allowed_wh is not None:
            limit_ids = list(allowed_wh)
            if warehouse_id and str(warehouse_id) not in allowed_wh:
                return Response([])
        items = selectors.get_low_stock_items(
            warehouse_id=warehouse_id,
            category_id=category_id,
            limit_warehouse_ids=None if warehouse_id else limit_ids,
        )
        serializer = self.get_serializer(items, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='bulk-update-minimums')
    def bulk_update_minimums(self, request):
        """SKU bazlı minimum_quantity toplu güncelleme."""
        rows = request.data.get("rows")
        if not isinstance(rows, list):
            return Response({"error": _("rows bir liste olmalıdır.")}, status=status.HTTP_400_BAD_REQUEST)

        updated = 0
        skipped = 0
        from apps.warehouse.models import WarehouseStockLevel

        allowed_wh = user_accessible_warehouse_id_strings(request.user)
        for r in rows:
            sku = (r.get("sku") or "").strip()
            minq = r.get("minimum_quantity")
            if not sku or minq is None:
                skipped += 1
                continue
            try:
                q = normalize_minimum_quantity(minq)
            except ValueError:
                skipped += 1
                continue
            qs = StockItem.objects.filter(sku=sku, is_active=True)
            if allowed_wh is not None:
                if not allowed_wh:
                    skipped += 1
                    continue
                qs = qs.filter(
                    id__in=WarehouseStockLevel.objects.filter(
                        warehouse_id__in=list(allowed_wh),
                        is_active=True,
                    ).values("stock_item_id")
                )
            n = qs.update(minimum_quantity=q)
            if n:
                updated += 1
            else:
                skipped += 1

        return Response({"updated": updated, "skipped": skipped})

    @action(detail=True, methods=['get'], url_path='warehouse-levels')
    def warehouse_levels(self, request, pk=None):
        """Stok kaleminin yetkili depolar bazında miktarları."""
        from apps.warehouse.models import WarehouseStockLevel

        stock_item = self.get_object()
        allowed_wh = user_accessible_warehouse_id_strings(request.user)
        qs = WarehouseStockLevel.objects.filter(
            stock_item=stock_item,
            is_active=True,
        ).select_related('warehouse')
        if allowed_wh is not None:
            qs = qs.filter(warehouse_id__in=list(allowed_wh))
        levels = qs.order_by('warehouse__code', 'warehouse__name')
        data = [
            {
                'warehouse_id': str(lvl.warehouse_id),
                'warehouse_code': lvl.warehouse.code,
                'warehouse_name': lvl.warehouse.name,
                'quantity': str(lvl.quantity),
                'minimum_quantity': str(lvl.minimum_quantity),
                'is_low_stock': lvl.is_low_stock,
            }
            for lvl in levels
        ]
        return Response(data)

    @action(detail=False, methods=['get'])
    def expiring_lots(self, request):
        """SKT'si yaklaşan partileri listeler."""
        from .services import ExpiryTrackingService
        warehouse_id = request.query_params.get('warehouse_id')
        days = int(request.query_params.get('days_ahead', 3))

        allowed_wh = user_accessible_warehouse_id_strings(request.user)
        if allowed_wh is not None:
            if not allowed_wh:
                return Response([])
            if warehouse_id:
                if str(warehouse_id) not in allowed_wh:
                    return Response(
                        {'detail': _('Bu depo için yetkiniz yok.')},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                wids = [str(warehouse_id)]
            else:
                wids = list(allowed_wh)
            lots = ExpiryTrackingService.get_expiring_lots(
                warehouse_ids=wids,
                days_ahead=days,
            )
        else:
            lots = ExpiryTrackingService.get_expiring_lots(
                warehouse_id=warehouse_id,
                days_ahead=days,
            )
        data = [
            {
                'id': str(lot.id),
                'stock_item_name': lot.stock_item.name,
                'stock_item_sku': lot.stock_item.sku,
                'warehouse_name': lot.warehouse.name,
                'lot_number': lot.lot_number,
                'expiry_date': lot.expiry_date.isoformat() if lot.expiry_date else None,
                'days_until_expiry': lot.days_until_expiry,
                'quantity': str(lot.quantity),
                'is_expired': lot.is_expired,
            }
            for lot in lots
        ]
        return Response(data)

    @action(detail=False, methods=['get'], url_path='kitchen-closing-items')
    def kitchen_closing_items(self, request):
        """Gün sonu mutfak kapanış sayımı: O gün hareket gören kalemleri listeler."""
        from .services import KitchenClosingService
        warehouse_id = request.query_params.get('warehouse_id')
        if not warehouse_id:
            return Response(
                {'error': _('warehouse_id parametresi gereklidir.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        allowed_wh = user_accessible_warehouse_id_strings(request.user)
        if allowed_wh is not None and str(warehouse_id) not in allowed_wh:
            return Response(
                {'detail': _('Bu depo için yetkiniz yok.')},
                status=status.HTTP_403_FORBIDDEN,
            )
        items = KitchenClosingService.get_daily_active_items(warehouse_id)
        return Response(items)

    @action(detail=False, methods=['post'], url_path='submit-kitchen-closing')
    def submit_kitchen_closing(self, request):
        """Gün sonu mutfak kapanış sayımını işler: Farkları WASTE olarak kaydeder."""
        from .services import KitchenClosingService
        warehouse_id = request.data.get('warehouse_id')
        items = request.data.get('items', [])
        if not warehouse_id or not items:
            return Response(
                {'error': _('warehouse_id ve items gereklidir.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        allowed_wh = user_accessible_warehouse_id_strings(request.user)
        if allowed_wh is not None and str(warehouse_id) not in allowed_wh:
            return Response(
                {'detail': _('Bu depo için yetkiniz yok.')},
                status=status.HTTP_403_FORBIDDEN,
            )
        waste_movements = KitchenClosingService.submit_closing_count(
            warehouse_id=warehouse_id,
            items=items,
            performed_by=request.user if request.user.is_authenticated else None,
        )
        return Response({
            'waste_count': len(waste_movements),
            'message': _('%(count)s kalem için fire kaydı oluşturuldu.')
            % {'count': len(waste_movements)},
        })

    @action(detail=False, methods=['get'])
    def summary(self, request):
        warehouse_id = request.query_params.get('warehouse_id')
        category_id = request.query_params.get('category_id')
        allowed_wh = user_accessible_warehouse_id_strings(request.user)
        limit_ids = None
        if allowed_wh is not None:
            limit_ids = list(allowed_wh)
            if warehouse_id and str(warehouse_id) not in allowed_wh:
                return Response({
                    'total_items': 0,
                    'total_value': 0,
                    'approximate_stock_value': 0,
                    'low_stock_count': 0,
                })
        data = selectors.get_stock_summary(
            warehouse_id=warehouse_id,
            category_id=category_id,
            limit_warehouse_ids=None if warehouse_id else limit_ids,
        )
        return Response(data)

    @action(detail=False, methods=['get'], url_path='price-increases')
    def price_increases(self, request):
        """Son alışa göre fiyatı artan stok kalemleri."""
        from decimal import Decimal, InvalidOperation
        from .price_trend_selectors import (
            get_stock_items_with_price_increases,
            summarize_price_increases,
        )

        min_raw = request.query_params.get('min_change_pct', '5')
        try:
            min_change_pct = Decimal(str(min_raw))
        except (InvalidOperation, TypeError, ValueError):
            min_change_pct = Decimal('5')

        lookback_raw = request.query_params.get('lookback_days', '90')
        try:
            lookback_days = max(int(lookback_raw), 1)
        except (TypeError, ValueError):
            lookback_days = 90

        rows = get_stock_items_with_price_increases(
            min_change_pct=min_change_pct,
            lookback_days=lookback_days,
            category_id=request.query_params.get('category_id') or None,
            branch_id=request.query_params.get('branch_id') or None,
            user=request.user,
        )
        summary = summarize_price_increases(rows)

        page = self.paginate_queryset(rows)
        if page is not None:
            response = self.get_paginated_response(page)
            response.data['summary'] = summary
            response.data['min_change_pct'] = str(min_change_pct)
            response.data['lookback_days'] = lookback_days
            return response

        return Response({
            'results': rows,
            'summary': summary,
            'min_change_pct': str(min_change_pct),
            'lookback_days': lookback_days,
        })

    @action(detail=False, methods=['get'], url_path='fefo-report')
    def fefo_report(self, request):
        """FEFO envanter raporu — sayfalanmış özet liste (lot detayı yok)."""
        warehouse_id = request.query_params.get('warehouse_id')
        category_id = request.query_params.get('category_id')
        search = request.query_params.get('search')
        allowed_wh = user_accessible_warehouse_id_strings(request.user)
        limit_ids = None
        if allowed_wh is not None:
            limit_ids = list(allowed_wh)
            if warehouse_id and str(warehouse_id) not in allowed_wh:
                return Response([])

        qs = selectors.get_detailed_fefo_inventory_report(
            warehouse_id=warehouse_id,
            category_id=category_id,
            limit_warehouse_ids=None if warehouse_id else limit_ids,
            search=search,
            include_lot_details=False,
        )

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = FEFOInventoryReportListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = FEFOInventoryReportListSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='fefo-report/detail')
    def fefo_report_detail(self, request):
        """Tek stok kalemi için FEFO lot detayı (modal / mobil detay)."""
        stock_item_id = (request.query_params.get('stock_item_id') or '').strip()
        if not stock_item_id:
            return Response(
                {'detail': _('stock_item_id parametresi gerekli.')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        warehouse_id = request.query_params.get('warehouse_id')
        allowed_wh = user_accessible_warehouse_id_strings(request.user)
        limit_ids = None
        if allowed_wh is not None:
            limit_ids = list(allowed_wh)
            if warehouse_id and str(warehouse_id) not in allowed_wh:
                return Response(
                    {'detail': _('Bu depo için yetkiniz yok.')},
                    status=status.HTTP_403_FORBIDDEN,
                )

        qs = selectors.get_detailed_fefo_inventory_report(
            warehouse_id=warehouse_id,
            limit_warehouse_ids=None if warehouse_id else limit_ids,
            stock_item_id=stock_item_id,
            include_lot_details=True,
        )
        item = qs.first()
        active_lots = getattr(item, 'active_lots', []) if item else []
        if not item or not active_lots:
            return Response(
                {'detail': _('FEFO lot verisi bulunamadı.')},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = FEFOInventoryReportSerializer(item)
        return Response(serializer.data)


class StockMovementViewSet(viewsets.ModelViewSet):
    serializer_class = StockMovementSerializer
    permission_classes = [RBACPermission]
    pagination_class = StockMovementPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['stock_item__name', 'stock_item__sku', 'reference', 'notes']
    permission_description = 'Stok hareketi yönetimi'

    def get_permissions(self):
        read_codes = [
            'inventory.view_stock_movement',
            'inventory.manage_stock_movement',
            'inventory.manage_stock_item',
            'inventory.view_return_cancel',
            'inventory.manage_return_cancel',
        ]
        write_codes = [
            'inventory.manage_stock_movement',
            'inventory.manage_stock_item',
            'inventory.manage_return_cancel',
        ]
        if self.action in ['list', 'retrieve', 'export_excel', 'reason_codes']:
            self.permission_codes = read_codes
        else:
            self.permission_codes = write_codes
        return super().get_permissions()

    def get_queryset(self):
        stock_item_id = self.request.query_params.get('stock_item_id')
        warehouse_id = self.request.query_params.get('warehouse_id')
        movement_type = self.request.query_params.get('movement_type')
        movement_types_raw = self.request.query_params.get('movement_types')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        reason_code = self.request.query_params.get('reason_code')
        supplier_id = self.request.query_params.get('supplier_id')

        movement_types = None
        if movement_types_raw:
            movement_types = [t.strip() for t in movement_types_raw.split(',') if t.strip()]

        qs = selectors.get_stock_movements(
            stock_item_id=stock_item_id,
            warehouse_id=warehouse_id,
            movement_type=movement_type if not movement_types else None,
            movement_types=movement_types,
            start_date=start_date,
            end_date=end_date,
            reason_code=reason_code,
            supplier_id=supplier_id,
        )
        return filter_queryset_by_accessible_warehouses(qs, self.request.user)

    def get_serializer_class(self):
        if self.action == 'create':
            return StockMovementCreateSerializer
        return StockMovementSerializer

    def perform_destroy(self, instance):
        InventoryService.delete_movement(instance.id)

    def _get_default_warehouse_id(self):
        """Varsayılan depo ID'yi döndürür."""
        from apps.warehouse.models import Warehouse
        warehouse = Warehouse.objects.filter(is_default=True).first()
        if not warehouse:
            warehouse = Warehouse.objects.first()
        return warehouse.id if warehouse else None

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        movement_type = data.get('movement_type', StockMovementType.IN)

        warehouse_id = data.get('warehouse_id') or self._get_default_warehouse_id()
        
        if not warehouse_id:
            return Response(
                {'error': _('Depo belirtilmedi ve varsayılan depo bulunamadı.')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        common_args = {
            'warehouse_id': warehouse_id,
            'stock_item_id': data['stock_item_id'],
            'quantity': data['quantity'],
            'reference': data.get('reference', ''),
            'notes': data.get('notes', ''),
            'performed_by': request.user if request.user.is_authenticated else None,
            'supplier_id': data.get('supplier_id'),
            'unit': data.get('unit'),
            'unit_price': data.get('unit_price', ZERO_QTY),
        }

        if movement_type in (StockMovementType.RETURN, StockMovementType.CANCEL):
            from apps.inventory.services.return_cancel_service import resolve_return_cancel_unit_price

            common_args['unit_price'] = resolve_return_cancel_unit_price(
                stock_item_id=data['stock_item_id'],
                movement_type=movement_type,
                unit_price=data.get('unit_price', ZERO_QTY),
                purchase_order_id=data.get('purchase_order_id'),
            )

        try:
            if movement_type == StockMovementType.IN:
                movement = InventoryService.receive_stock(
                    **common_args,
                )
            elif movement_type == StockMovementType.OUT:
                movement = InventoryService.deduct_stock(**common_args)
            elif movement_type == StockMovementType.ADJUSTMENT:
                movement = InventoryService.adjust_stock(
                    warehouse_id=warehouse_id,
                    stock_item_id=data['stock_item_id'],
                    new_quantity=data['quantity'],
                    notes=data.get('notes', ''),
                    performed_by=request.user if request.user.is_authenticated else None,
                    supplier_id=data.get('supplier_id'),
                    unit=data.get('unit'),
                )
            elif movement_type == StockMovementType.WASTE:
                movement = InventoryService.waste_stock(**common_args)
            elif movement_type == StockMovementType.RETURN:
                movement = InventoryService.return_stock(**common_args)
            elif movement_type == StockMovementType.CANCEL:
                movement = InventoryService.cancel_stock(**common_args)
            elif movement_type == StockMovementType.DISPOSAL:
                movement = InventoryService.dispose_stock(**common_args)
            else:
                return Response(
                    {'error': _('Geçersiz hareket tipi: %(t)s') % {'t': movement_type}},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            return Response(
                StockMovementSerializer(movement).data,
                status=status.HTTP_201_CREATED,
            )
        except InsufficientStockError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=False, methods=['get'], url_path='reason-codes')
    def reason_codes(self, request):
        from apps.inventory.return_cancel_reasons import (
            STOCK_RETURN_CANCEL_REASON_CODES,
            STOCK_RETURN_CANCEL_REASON_LABELS,
        )
        return Response([
            {'code': code, 'label': str(STOCK_RETURN_CANCEL_REASON_LABELS[code])}
            for code in STOCK_RETURN_CANCEL_REASON_CODES
        ])

    @action(detail=False, methods=['get'], url_path='export/excel')
    def export_excel(self, request):
        from apps.inventory.return_cancel_reasons import format_reason_display
        from apps.reporting.services.excel_export import ExcelExportService
        from django.http import HttpResponse

        qs = self.filter_queryset(self.get_queryset())
        if request.query_params.get('search'):
            s = request.query_params['search']
            qs = qs.filter(
                Q(stock_item__name__icontains=s)
                | Q(stock_item__sku__icontains=s)
                | Q(reference__icontains=s)
                | Q(notes__icontains=s)
            )

        rows = list(qs[:5000])
        columns = [
            {'key': 'created_at', 'label': _('Tarih')},
            {'key': 'movement_type', 'label': _('Tip')},
            {'key': 'stock_item_name', 'label': _('Ürün')},
            {'key': 'warehouse_name', 'label': _('Depo')},
            {'key': 'quantity', 'label': _('Miktar')},
            {'key': 'unit', 'label': _('Birim')},
            {'key': 'unit_price', 'label': _('Birim Maliyet')},
            {'key': 'total', 'label': _('Toplam')},
            {'key': 'reason', 'label': _('Neden')},
            {'key': 'notes', 'label': _('Not')},
            {'key': 'performed_by', 'label': _('İşlemi Yapan')},
        ]

        data = []
        for m in rows:
            qty = float(m.quantity or 0)
            price = float(m.unit_price or 0)
            data.append({
                'created_at': m.created_at.strftime('%d.%m.%Y %H:%M') if m.created_at else '',
                'movement_type': m.get_movement_type_display(),
                'stock_item_name': m.stock_item.name if m.stock_item else '',
                'warehouse_name': m.warehouse.name if m.warehouse else '',
                'quantity': qty,
                'unit': m.unit or (m.stock_item.unit if m.stock_item else ''),
                'unit_price': price,
                'total': qty * price,
                'reason': format_reason_display(m.reference, m.notes),
                'notes': m.notes or '',
                'performed_by': (
                    m.performed_by.get_full_name() or m.performed_by.username
                    if m.performed_by else _('Sistem')
                ),
            })

        excel_bytes = ExcelExportService.generate_excel(
            data,
            columns,
            title=_('İptal ve İade Raporu'),
        )
        response = HttpResponse(
            excel_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = 'attachment; filename="iptal_iade_raporu.xlsx"'
        return response

    @action(detail=False, methods=['post'])
    def deduct(self, request):
        serializer = StockMovementCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        warehouse_id = data.get('warehouse_id') or self._get_default_warehouse_id()
        if not warehouse_id:
            return Response(
                {'error': _('Depo belirtilmedi ve varsayılan depo bulunamadı.')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            movement = InventoryService.deduct_stock(
                warehouse_id=warehouse_id,
                stock_item_id=data['stock_item_id'],
                quantity=data['quantity'],
                reference=data.get('reference', ''),
                notes=data.get('notes', ''),
                performed_by=request.user if request.user.is_authenticated else None,
                supplier_id=data.get('supplier_id'),
                unit=data.get('unit'),
            )
            return Response(
                StockMovementSerializer(movement).data,
                status=status.HTTP_201_CREATED,
            )
        except InsufficientStockError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=False, methods=['post'])
    def adjust(self, request):
        serializer = StockMovementCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        warehouse_id = data.get('warehouse_id') or self._get_default_warehouse_id()
        if not warehouse_id:
            return Response(
                {'error': _('Depo belirtilmedi ve varsayılan depo bulunamadı.')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            movement = InventoryService.adjust_stock(
                warehouse_id=warehouse_id,
                stock_item_id=data['stock_item_id'],
                new_quantity=data['quantity'],
                notes=data.get('notes', ''),
                performed_by=request.user if request.user.is_authenticated else None,
                supplier_id=data.get('supplier_id'),
                unit=data.get('unit'),
            )
            return Response(
                StockMovementSerializer(movement).data,
                status=status.HTTP_201_CREATED,
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )


class SupplierViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierSerializer
    permission_classes = [RBACPermission]
    permission_description = 'Tedarikçi yönetimi'

    def get_permissions(self):
        read_codes = ['inventory.view_supplier', 'inventory.manage_supplier']
        write_codes = ['inventory.manage_supplier']
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_codes
        else:
            self.permission_codes = write_codes
        return super().get_permissions()

    def get_queryset(self):
        return selectors.get_suppliers(active_only=True)

    def perform_create(self, serializer):
        serializer.instance = SupplierService.create_supplier(serializer.validated_data)

    def perform_update(self, serializer):
        serializer.instance = SupplierService.update_supplier(
            serializer.instance.id,
            serializer.validated_data
        )

    def perform_destroy(self, instance):
        SupplierService.delete_supplier(instance.id)

    @action(detail=True, methods=['get'])
    def performance(self, request, pk=None):
        """Tedarikçi performans özetini döndürür."""
        days = int(request.query_params.get("days", 30))
        data = selectors.get_supplier_performance(pk, days=days)
        return Response(data)

    @action(detail=True, methods=['get'])
    def rejected_items(self, request, pk=None):
        """Tedarikçiden reddedilmiş ürünleri sayfalı döndürür."""
        from apps.warehouse.models import GoodsReceivingItem

        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        search = request.query_params.get("search")

        qs = (
            GoodsReceivingItem.objects.filter(
                goods_receiving__supplier_id=pk,
                goods_receiving__is_active=True,
                is_active=True,
                rejected_quantity__gt=ZERO_QTY,
            )
            .select_related("stock_item", "goods_receiving")
            .order_by("-goods_receiving__received_date", "-id")
        )

        if start_date:
            qs = qs.filter(goods_receiving__received_date__gte=start_date)
        if end_date:
            qs = qs.filter(goods_receiving__received_date__lte=end_date)
        if search:
            qs = qs.filter(
                Q(stock_item__name__icontains=search)
                | Q(stock_item__sku__icontains=search)
                | Q(goods_receiving__receiving_number__icontains=search)
            )

        paginator = PageNumberPagination()
        paginator.page_size = request.query_params.get("page_size", 40)
        page = paginator.paginate_queryset(qs, request)

        results = [
            {
                "id": str(item.id),
                "goods_receiving_id": str(item.goods_receiving_id),
                "receiving_number": item.goods_receiving.receiving_number,
                "received_date": item.goods_receiving.received_date,
                "status": item.goods_receiving.status,
                "status_display": item.goods_receiving.get_status_display(),
                "stock_item_id": str(item.stock_item_id),
                "stock_item_name": item.stock_item.name,
                "stock_item_sku": item.stock_item.sku,
                "expected_quantity": float(item.expected_quantity),
                "received_quantity": float(item.received_quantity),
                "rejected_quantity": float(item.rejected_quantity),
                "unit": item.unit,
                "unit_price": float(item.unit_price),
                "batch_number": item.batch_number or "",
                "notes": item.notes or "",
            }
            for item in page
        ]

        return paginator.get_paginated_response(results)

    @action(detail=True, methods=['get'])
    def goods_receivings(self, request, pk=None):
        """Tedarikçinin mal kabul kayıtlarını sayfalı döndürür."""
        from apps.warehouse.models import GoodsReceiving

        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        search = request.query_params.get("search")

        qs = GoodsReceiving.objects.filter(
            supplier_id=pk,
            is_active=True,
        ).select_related("warehouse", "received_by").order_by("-received_date", "-id")

        if start_date:
            qs = qs.filter(received_date__gte=start_date)
        if end_date:
            qs = qs.filter(received_date__lte=end_date)
        if search:
            qs = qs.filter(
                Q(receiving_number__icontains=search)
                | Q(invoice_number__icontains=search)
                | Q(waybill_number__icontains=search)
            )

        paginator = PageNumberPagination()
        paginator.page_size = request.query_params.get("page_size", 40)
        page = paginator.paginate_queryset(qs, request)

        results = [
            {
                "id": str(rec.id),
                "receiving_number": rec.receiving_number,
                "received_date": rec.received_date,
                "status": rec.status,
                "status_display": rec.get_status_display(),
                "warehouse_name": rec.warehouse.name,
                "total_amount": float(rec.total_amount),
                "items_count": rec.items.filter(is_active=True).count(),
                "rejected_items_count": rec.items.filter(is_active=True, rejected_quantity__gt=0).count(),
                "accepted_items_count": rec.items.filter(is_active=True, received_quantity__gt=0).count(),
                "invoice_number": rec.invoice_number or "",
                "waybill_number": rec.waybill_number or "",
                "notes": rec.notes or "",
            }
            for rec in page
        ]

        return paginator.get_paginated_response(results)


class StockCategoryViewSet(viewsets.ModelViewSet):
    permission_classes = [RBACPermission]
    permission_description = 'Stok kategorisi yönetimi'
    queryset = StockCategory.objects.select_related('parent').annotate(
        items_count=Count('stock_items')
    ).order_by('name', 'id')
    serializer_class = StockCategorySerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'code']

    def get_permissions(self):
        read_codes = ['inventory.view_category', 'inventory.manage_category']
        write_codes = ['inventory.manage_category']
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_codes
        else:
            self.permission_codes = write_codes
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        parent_id = self.request.query_params.get('parent')
        if parent_id:
            queryset = queryset.filter(parent_id=parent_id)
        return queryset


class StockUnitViewSet(viewsets.ModelViewSet):
    serializer_class = StockUnitSerializer
    permission_classes = [RBACPermission]
    queryset = StockUnit.objects.all()

    def get_permissions(self):
        read_codes = ['inventory.view_stock_unit', 'inventory.manage_stock_unit']
        write_codes = ['inventory.manage_stock_unit']
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_codes
        else:
            self.permission_codes = write_codes
        return super().get_permissions()


class AllergenPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


class AllergenViewSet(viewsets.ModelViewSet):
    serializer_class = AllergenSerializer
    permission_classes = [RBACPermission]
    permission_description = 'Alerjen Maddeleri'
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'code']
    ordering_fields = ['code', 'name', 'prevalence_pct', 'risk_score', 'sort_order']
    ordering = ['sort_order', 'name']
    pagination_class = AllergenPagination

    def get_queryset(self):
        return Allergen.objects.filter(is_active=True)

    def get_permissions(self):
        read_codes = ['inventory.view_allergen', 'inventory.manage_allergen']
        write_codes = ['inventory.manage_allergen']
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_codes
        else:
            self.permission_codes = write_codes
        return super().get_permissions()

    def perform_destroy(self, instance):
        instance.delete()


class StockReceiptDraftViewSet(viewsets.ModelViewSet):
    """Toplu stok girişi taslakları: taslak kayıt ve finalize."""

    serializer_class = StockReceiptDraftSerializer
    permission_classes = [RBACPermission]
    permission_description = 'Toplu stok girişi'
    pagination_class = StockReceiptDraftPagination
    http_method_names = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

    def get_permissions(self):
        read_codes = ['inventory.view_stock_item', 'inventory.manage_stock_item']
        write_codes = ['inventory.manage_stock_item']
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_codes
        else:
            self.permission_codes = write_codes
        return super().get_permissions()

    def get_queryset(self):
        qs = (
            StockReceiptDraft.objects.filter(user=self.request.user)
            .select_related('user', 'warehouse', 'supplier')
            .prefetch_related('lines__stock_item', 'lines__temp_category')
            .order_by('-updated_at')
        )
        return filter_queryset_by_accessible_warehouses(
            qs, self.request.user, warehouse_id_field='warehouse_id',
        )

    def _assert_warehouse_access(self, warehouse_id) -> None:
        allowed = user_accessible_warehouse_id_strings(self.request.user)
        if allowed is not None:
            if not allowed or str(warehouse_id) not in allowed:
                raise PermissionDenied(_('Bu depo için yetkiniz yok.'))

    def perform_create(self, serializer):
        warehouse = serializer.validated_data['warehouse']
        self._assert_warehouse_access(warehouse.id)
        serializer.save()

    def perform_update(self, serializer):
        warehouse = serializer.validated_data.get('warehouse', serializer.instance.warehouse)
        self._assert_warehouse_access(warehouse.id)
        serializer.save()

    def perform_destroy(self, instance):
        """
        Taslak veya kesinleştirilmiş kayıt silinebilir.
        Kesinleştirilmiş girişlerde stok hareketleri geri alınmaz; yalnızca bu kayıt kaldırılır.
        """
        self._assert_warehouse_access(instance.warehouse_id)
        instance.delete()

    @action(detail=True, methods=['post'], url_path='finalize')
    def finalize(self, request, pk=None):
        draft = self.get_object()
        if draft.status != StockReceiptDraftStatus.DRAFT:
            return Response(
                {'detail': _('Taslak zaten kesinleştirilmiş.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        self._assert_warehouse_access(draft.warehouse_id)
        try:
            movement_ids = InventoryService.finalize_stock_receipt_draft(draft.id, request.user)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        draft.refresh_from_db()
        serializer = self.get_serializer(draft)
        return Response(
            {
                'movement_ids': movement_ids,
                'count': len(movement_ids),
                'draft': serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class ReturnDisposalFlowViewSet(viewsets.ModelViewSet):
    """İade/İmha Akışları CRUD + onay/iptal aksiyonları."""
    serializer_class = ReturnDisposalFlowSerializer
    permission_classes = [RBACPermission]
    permission_description = 'İade/İmha Yönetimi'
    pagination_class = StockMovementPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['reason_text', 'source_warehouse__name', 'reason_code']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            self.permission_codes = [
                'inventory.view_return_cancel',
                'inventory.manage_return_cancel',
                'inventory.view_returndisposalflow',
                'inventory.manage_returndisposalflow',
            ]
        else:
            self.permission_codes = ['inventory.manage_return_cancel', 'inventory.manage_returndisposalflow']
        return super().get_permissions()

    def get_queryset(self):
        qs = ReturnDisposalFlow.objects.filter(is_active=True).select_related(
            'source_warehouse', 'target_warehouse', 'supplier', 'sale', 'order',
            'created_by', 'approved_by',
        ).prefetch_related('items__stock_item')
        return filter_queryset_by_accessible_warehouses(
            qs, self.request, field='source_warehouse_id'
        )

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        flow = self.get_object()
        if flow.status != ReturnDisposalFlowStatus.DRAFT:
            return Response(
                {'detail': _('Yalnızca taslak akışlar onaylanabilir.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        flow.status = ReturnDisposalFlowStatus.APPROVED
        flow.approved_by = request.user
        flow.save(update_fields=['status', 'approved_by', 'updated_at'])
        return Response(self.get_serializer(flow).data)

    @action(detail=True, methods=['post'], url_path='complete')
    def complete(self, request, pk=None):
        flow = self.get_object()
        if flow.status != ReturnDisposalFlowStatus.APPROVED:
            return Response(
                {'detail': _('Yalnızca onaylanmış akışlar tamamlanabilir.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from apps.inventory.services.return_disposal_flow_service import complete_return_disposal_flow
        from apps.inventory.services import InsufficientStockError

        try:
            flow = complete_return_disposal_flow(flow, performed_by=request.user)
        except InsufficientStockError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(flow).data)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        flow = self.get_object()
        if flow.status in [ReturnDisposalFlowStatus.COMPLETED, ReturnDisposalFlowStatus.CANCELLED]:
            return Response(
                {'detail': _('Akış zaten tamamlanmış veya iptal edilmiş.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        flow.status = ReturnDisposalFlowStatus.CANCELLED
        flow.save(update_fields=['status', 'updated_at'])
        return Response(self.get_serializer(flow).data)
