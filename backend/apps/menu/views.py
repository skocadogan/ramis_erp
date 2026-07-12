from decimal import Decimal
from django.db import transaction
from django.db.models import Prefetch, Q
from django.utils import timezone
from apps.recipes.models import Recipe, RecipeIngredient
from django.utils.translation import gettext as _
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rbac.drf import RBACPermission
from core.branch_scope import (
    menu_category_queryset_filtered,
    menu_product_queryset_filtered,
    branch_filter_qs,
    accessible_branch_id_strings,
)
from .models import Category, Product, ProductVariant, ModifierGroup, Modifier, ProductUnit, CombinedProductItem, ProductRecommendation, MenuTag
from .menu_tag_service import (
    activate_catalog_tag,
    catalog_settings_payload,
    filter_categories_by_active_tag,
    filter_products_by_active_tag,
    soft_delete_menu_tag,
)
from .ws_broadcast import broadcast_menu_catalog_refresh
from .serializers import (
    CategorySerializer, ProductSerializer, ProductVariantSerializer,
    ModifierGroupSerializer, ModifierGroupWriteSerializer,
    ModifierSerializer, ModifierWriteSerializer,
    ProductRecommendationReadSerializer, ProductRecommendationSyncSerializer,
    ProductRecommendationSyncItemSerializer,
    MenuTagSerializer, MenuCatalogSettingsSerializer, MenuCatalogActivateSerializer,
)
from .services import MenuService
from .pagination import MenuCatalogPagination

class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [RBACPermission]
    permission_description = 'Kategori Yönetimi'
    pagination_class = MenuCatalogPagination

    def get_queryset(self):
        queryset = Category.objects.select_related('station', 'parent').prefetch_related('tags').all()
        parent_id = self.request.query_params.get('parent')
        if parent_id:
            queryset = queryset.filter(parent_id=parent_id)
        queryset = menu_category_queryset_filtered(queryset, self.request)
        apply_tag = (self.request.query_params.get('apply_tag_filter') or '').strip().lower()
        if apply_tag not in ('0', 'false', 'no'):
            branch_id = (self.request.query_params.get('branch_id') or '').strip() or None
            queryset = filter_categories_by_active_tag(queryset, branch_id)
        return queryset

    def get_permissions(self):
        read_codes = ['menu.view_category', 'menu.manage_category']
        write_codes = ['menu.manage_category']
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_codes
        elif self.action == 'create':
            self.permission_codes = write_codes
        elif self.action in ['update', 'partial_update', 'destroy']:
            self.permission_codes = write_codes
        else:
            self.permission_codes = read_codes
        return super().get_permissions()

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        order_ids = request.data.get('order_ids', [])
        if not order_ids:
            return Response({'error': _('Sıra verisi sağlanmadı.')}, status=status.HTTP_400_BAD_REQUEST)
        
        qs = menu_category_queryset_filtered(Category.objects.filter(id__in=order_ids), request)
        if qs.count() != len(order_ids):
            return Response(
                {'error': _('Bazı kategoriler bulunamadı veya bu şubeye ait değil.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        from django.db.models import Case, When, Value, IntegerField
        qs.update(
            order=Case(
                *[When(id=cat_id, then=Value(index)) for index, cat_id in enumerate(order_ids)],
                output_field=IntegerField()
            )
        )

        broadcast_menu_catalog_refresh("category_reorder")
        return Response({'status': 'ok'})

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        broadcast_menu_catalog_refresh("category_deleted")
        return Response(status=status.HTTP_204_NO_CONTENT)

class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [RBACPermission]
    permission_description = 'Ürün Yönetimi'
    pagination_class = MenuCatalogPagination

    def get_queryset(self):
        recipe_qs = Recipe.objects.prefetch_related(
            'allergens',
            Prefetch(
                'ingredients',
                queryset=RecipeIngredient.objects.select_related('stock_item').prefetch_related(
                    'stock_item__allergens',
                ),
            ),
        )
        child_recipe_qs = Recipe.objects.prefetch_related('allergens')
        queryset = Product.objects.select_related('category').prefetch_related(
            'variants', 'modifier_groups', 'modifier_groups__modifiers', 'units', 'tags', 'branches',
            Prefetch(
                'combined_items',
                queryset=CombinedProductItem.objects.select_related(
                    'product', 'product__category__station', 'product_unit'
                ).prefetch_related(
                    Prefetch('product__recipe', queryset=child_recipe_qs),
                ),
            ),
            Prefetch('recipe', queryset=recipe_qs),
            Prefetch(
                'recommendations',
                queryset=ProductRecommendation.objects.filter(is_active=True).select_related(
                    'recommended_product', 'product_unit', 'recommended_product__category',
                ).prefetch_related(
                    'recommended_product__units',
                    'recommended_product__branches',
                ),
            ),
        ).all()
        qs = menu_product_queryset_filtered(queryset, self.request)
        # POS kataloğu: ekranda zaten show_on_pos !== false; ?show_on_pos=true ile aynı filtreyi API'da uygula
        sp = (self.request.query_params.get("show_on_pos") or "").strip().lower()
        if sp in ("1", "true", "yes"):
            qs = qs.filter(show_on_pos=True)
        category_id = (self.request.query_params.get("category_id") or "").strip()
        if category_id:
            qs = qs.filter(category_id=category_id)
        is_featured = (self.request.query_params.get("is_featured") or "").strip().lower()
        if is_featured in ("1", "true", "yes"):
            qs = qs.filter(is_featured=True)
        apply_tag = (self.request.query_params.get('apply_tag_filter') or '').strip().lower()
        if apply_tag not in ('0', 'false', 'no'):
            branch_id = (self.request.query_params.get('branch_id') or '').strip() or None
            qs = filter_products_by_active_tag(qs, branch_id)
        return qs

    def get_serializer_context(self):
        context = super().get_serializer_context()
        branch_id = self.request.query_params.get('branch_id')
        
        if self.action == 'list' and branch_id:
            # Şubeye ait stok ve rezervasyon haritasını bir kerede oluştur (N+1 önleme)
            from apps.warehouse.models import WarehouseStockLevel
            from apps.inventory.models import StockReservation, StockReservationStatus
            from django.db.models import Sum
            
            # 1. Fiziksel Stoklar
            physical_data = WarehouseStockLevel.objects.filter(
                warehouse__branches__id=branch_id,
                is_active=True
            ).values('stock_item_id').annotate(total=Sum('quantity'))
            
            stock_map = {
                str(d['stock_item_id']): {'physical': d['total'], 'reserved': 0}
                for d in physical_data
            }
            
            # 2. Rezervasyonlar
            res_data = StockReservation.objects.filter(
                warehouse__branches__id=branch_id,
                status=StockReservationStatus.RESERVED
            ).values('stock_item_id').annotate(total=Sum('quantity'))
            
            for d in res_data:
                si_id = str(d['stock_item_id'])
                if si_id not in stock_map:
                    stock_map[si_id] = {'physical': 0, 'reserved': d['total']}
                else:
                    stock_map[si_id]['reserved'] = d['total']
            
            context['stock_map'] = stock_map

            # Batch-load ProductDayAvailability for all products in this branch
            from apps.production_planning.models import ProductDayAvailability
            today = timezone.localdate()
            product_ids = list(self.get_queryset().values_list('id', flat=True))
            avail_qs = ProductDayAvailability.objects.filter(
                product_id__in=product_ids,
                branch_id=branch_id,
                effective_date=today,
                is_active=True,
            )
            context['availability_map'] = {a.product_id: a for a in avail_qs}

            # Pre-compute combined product eligibility
            combined_product_allowed_map = {}
            cp_items = CombinedProductItem.objects.filter(
                parent_product__is_active=True,
                parent_product__is_combined=True,
                parent_product__branches__id=branch_id,
                product__is_active=True,
                product__branches__id=branch_id,
            ).values_list('parent_product_id', 'product_id')
            for parent_id, child_id in cp_items:
                combined_product_allowed_map.setdefault(parent_id, set()).add(str(child_id))
            context['combined_product_allowed_map'] = combined_product_allowed_map

        return context

    def get_permissions(self):
        read_codes = ['menu.view_product', 'menu.manage_product']
        write_codes = ['menu.manage_product']
        discount_codes = ['menu.manage_discount', 'menu.manage_product']
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_codes
        elif self.action == 'create':
            self.permission_codes = write_codes
        elif self.action in ['update', 'partial_update', 'destroy']:
            self.permission_codes = write_codes
        elif self.action == 'bulk_discount':
            self.permission_codes = discount_codes
        elif self.action == 'bulk_price':
            self.permission_codes = write_codes
        elif self.action == 'copy':
            self.permission_codes = write_codes
        elif self.action in ['recommendations', 'sync_recommendations']:
            self.permission_codes = read_codes if self.request.method == 'GET' else write_codes
        else:
            self.permission_codes = read_codes
        return super().get_permissions()

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        order_ids = request.data.get('order_ids', [])
        if not order_ids:
            return Response({'error': _('Sıra verisi sağlanmadı.')}, status=status.HTTP_400_BAD_REQUEST)
        
        from django.db.models import Case, When, Value, IntegerField
        Product.objects.filter(id__in=order_ids).update(
            order=Case(
                *[When(id=prod_id, then=Value(index)) for index, prod_id in enumerate(order_ids)],
                output_field=IntegerField()
            )
        )

        broadcast_menu_catalog_refresh("product_reorder")
        return Response({'status': 'ok'})

    @action(detail=False, methods=['post'], url_path='bulk_discount')
    def bulk_discount(self, request):
        """Toplu veya tekil ürün indirim oranı tanımlama.
        Payload: { product_ids: [uuid, ...], discount_rate: float (0-100), branch_id: uuid }
        product_ids boş gelirse hiçbir şey gücellenmez.
        discount_rate 0 gönderilirse indirim kaldırılır.
        """
        product_ids = request.data.get('product_ids', [])
        discount_rate = request.data.get('discount_rate', None)
        branch_id = request.data.get('branch_id', None)

        if discount_rate is None:
            return Response({'error': _('discount_rate zorunludur.')}, status=status.HTTP_400_BAD_REQUEST)

        try:
            rate = float(discount_rate)
        except (TypeError, ValueError):
            return Response({'error': _('discount_rate geçerli bir sayı olmalıdır.')}, status=status.HTTP_400_BAD_REQUEST)

        if not (0 <= rate <= 100):
            return Response({'error': _('discount_rate 0 ile 100 arasında olmalıdır.')}, status=status.HTTP_400_BAD_REQUEST)

        if not product_ids:
            return Response({'error': _('product_ids listesi boş olamaz.')}, status=status.HTTP_400_BAD_REQUEST)

        filter_kwargs = {'id__in': product_ids}
        if branch_id:
            filter_kwargs['category__station__branch_id'] = branch_id

        products_list = list(Product.objects.filter(**filter_kwargs))
        with transaction.atomic():
            for product in products_list:
                product.discount_rate = rate
                product.update_discounted_price_cache()
            Product.objects.bulk_update(products_list, ['discount_rate', 'discounted_price_cached'])

        updated = len(products_list)
        broadcast_menu_catalog_refresh("discount_updated")
        return Response({'updated': updated, 'discount_rate': rate})

    @action(detail=False, methods=['post'], url_path='bulk_price')
    def bulk_price(self, request):
        """Toplu fiyat güncelleme.
        Payload: { product_ids: [...], branch_id: ..., change_type: 'FIXED'|'PERCENT', value: float }
        """
        product_ids = request.data.get('product_ids', [])
        branch_id = request.data.get('branch_id', None)
        change_type = request.data.get('change_type', 'PERCENT') # PERCENT or FIXED
        value = request.data.get('value', 0)
        
        if not product_ids:
            return Response({'error': _('product_ids listesi boş olamaz.')}, status=status.HTTP_400_BAD_REQUEST)
            
        filter_kwargs = {'id__in': product_ids}
        if branch_id:
            filter_kwargs['category__station__branch_id'] = branch_id
            
        products = Product.objects.filter(**filter_kwargs).prefetch_related('units')

        products_list = list(products)
        updated_count = 0
        units_price_update = []
        with transaction.atomic():
            for product in products_list:
                if change_type == 'PERCENT':
                    factor = Decimal('1') + (Decimal(str(value)) / Decimal('100'))
                    product.base_price = (product.base_price * factor).quantize(Decimal('0.0001'))
                else:
                    product.base_price = Decimal(str(value)).quantize(Decimal('0.0001'))
                product.align_gross_from_net()
                product.update_discounted_price_cache()
                updated_count += 1
                nb = product.base_price
                for unit in product.units.all():
                    if unit.price_override is not None:
                        new_po = (nb * Decimal(str(unit.multiplier))).quantize(Decimal('0.0001'))
                        unit.price_override = new_po
                        units_price_update.append(unit)
            Product.objects.bulk_update(products_list, ['base_price', 'gross_price', 'discounted_price_cached'])
            if units_price_update:
                ProductUnit.objects.bulk_update(units_price_update, ['price_override'])
                
        broadcast_menu_catalog_refresh("bulk_price_updated")
        return Response({'updated': updated_count})

    @action(detail=True, methods=['post'])
    def copy(self, request, pk=None):
        """Ürünü tüm alt verileriyle birlikte kopyalar."""
        import copy as _copy
        from .models import ProductUnit, CombinedProductItem, ProductVariant

        product = self.get_object()

        with transaction.atomic():
            # 1. Ana Ürünü Kopyala
            new_product = _copy.copy(product)
            new_product.pk = None
            new_product.id = None
            new_product.name = f"{product.name} (Kopya)"
            new_product.is_active = False
            new_product.image = None
            new_product.save()

            # 2. Ürün Varyasyonlarını bulk_create ile kopyala — N+1 önlendi
            new_variants = []
            for v in product.variants.all():
                nv = _copy.copy(v)
                nv.pk = None
                nv.id = None
                nv.product = new_product
                new_variants.append(nv)
            if new_variants:
                ProductVariant.objects.bulk_create(new_variants)

            # 3. Ürün Birimlerini bulk_create ile kopyala — N+1 önlendi
            new_units = []
            for u in product.units.all():
                nu = _copy.copy(u)
                nu.pk = None
                nu.id = None
                nu.product = new_product
                new_units.append(nu)
            if new_units:
                ProductUnit.objects.bulk_create(new_units)

            # 4. Değiştirici Gruplarını Bağla
            new_product.modifier_groups.set(product.modifier_groups.all())

            # 5. Birleşik Ürün Kalemlerini bulk_create ile kopyala — N+1 önlendi
            if product.is_combined:
                new_combined = []
                for item in product.combined_items.all():
                    ni = _copy.copy(item)
                    ni.pk = None
                    ni.id = None
                    ni.parent_product = new_product
                    new_combined.append(ni)
                if new_combined:
                    CombinedProductItem.objects.bulk_create(new_combined)

        serializer = self.get_serializer(new_product)
        broadcast_menu_catalog_refresh("product_copied")
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        broadcast_menu_catalog_refresh("product_deleted")
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='modifier-groups')
    def set_modifier_groups(self, request, pk=None):
        """Ürünün seçenek gruplarını günceller. Body: { group_ids: [uuid, ...] }"""
        product = self.get_object()
        group_ids = request.data.get('group_ids')
        if group_ids is None:
            return Response({'error': _('group_ids zorunludur.')}, status=status.HTTP_400_BAD_REQUEST)
        MenuService.sync_product_modifier_groups(product, group_ids)
        broadcast_menu_catalog_refresh("product_modifier_groups_updated")
        return Response(self.get_serializer(product).data)

    @action(detail=True, methods=['get', 'put'], url_path='recommendations')
    def recommendations(self, request, pk=None):
        """Kaynak ürünün yanında önerilen ürünlerini listeler veya senkronize eder."""
        product = self.get_object()
        if request.method == 'GET':
            recs = ProductRecommendation.objects.filter(
                source_product=product,
                is_active=True,
            ).select_related(
                'recommended_product', 'product_unit',
            ).prefetch_related(
                'recommended_product__units',
            ).order_by('order', 'created_at')
            return Response(ProductRecommendationReadSerializer(recs, many=True).data)

        sync_serializer = ProductRecommendationSyncSerializer(data=request.data)
        sync_serializer.is_valid(raise_exception=True)
        items_data = []
        for index, item in enumerate(sync_serializer.validated_data['items']):
            ctx_serializer = ProductRecommendationSyncItemSerializer(
                data={
                    'recommended_product_id': item['recommended_product_id'],
                    'product_unit_id': item.get('product_unit_id'),
                    'order': item.get('order', index),
                },
                context={'source_product': product},
            )
            ctx_serializer.is_valid(raise_exception=True)
            items_data.append(ctx_serializer.validated_data)

        MenuService.sync_product_recommendations(product, items_data)
        broadcast_menu_catalog_refresh("product_recommendations_updated")
        recs = ProductRecommendation.objects.filter(
            source_product=product,
            is_active=True,
        ).select_related(
            'recommended_product', 'product_unit',
        ).prefetch_related('recommended_product__units').order_by('order', 'created_at')
        return Response(ProductRecommendationReadSerializer(recs, many=True).data)

class ProductVariantViewSet(viewsets.ModelViewSet):
    serializer_class = ProductVariantSerializer
    permission_classes = [RBACPermission]
    permission_description = 'Ürün Türü Yönetimi'

    def get_permissions(self):
        read_codes = ['menu.view_product_variant', 'menu.manage_product_variant']
        write_codes = ['menu.manage_product_variant']
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_codes
        elif self.action in ['create', 'update', 'partial_update', 'destroy']:
            self.permission_codes = write_codes
        else:
            self.permission_codes = read_codes
        return super().get_permissions()

    def get_queryset(self):
        qs = ProductVariant.objects.select_related('product').all()
        return branch_filter_qs(qs, self.request, field='product__branches__id')

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        broadcast_menu_catalog_refresh("variant_deleted")
        return Response(status=status.HTTP_204_NO_CONTENT)


class ModifierGroupViewSet(viewsets.ModelViewSet):
    serializer_class = ModifierGroupSerializer
    permission_classes = [RBACPermission]
    permission_description = 'Menü Değiştirici Grup Yönetimi'

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return ModifierGroupWriteSerializer
        return ModifierGroupSerializer

    def get_permissions(self):
        read_codes = ['menu.view_modifier_group', 'menu.manage_modifier_group']
        write_codes = ['menu.manage_modifier_group']
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_codes
        elif self.action in ['create', 'update', 'partial_update', 'destroy']:
            self.permission_codes = write_codes
        else:
            self.permission_codes = read_codes
        return super().get_permissions()

    def get_queryset(self):
        qs = ModifierGroup.objects.filter(is_active=True).prefetch_related(
            Prefetch('modifiers', queryset=Modifier.objects.filter(is_active=True)),
            'products',
        )
        user = self.request.user
        if not user.is_authenticated:
            return qs.none()

        qp_branch = (self.request.query_params.get("branch_id") or "").strip() or None
        allowed = accessible_branch_id_strings(user)

        # Süper kullanıcı: ?branch_id varsa o şubeye daralt, yoksa hepsi görünür.
        if allowed is None:
            if qp_branch:
                return qs.filter(products__branches__id=qp_branch)
            return qs

        if not allowed:
            return qs.none()

        if qp_branch:
            if qp_branch not in allowed:
                return qs.none()
            return qs.filter(products__branches__id=qp_branch)

        # Normal kullanıcı: ürünleri erişilebilir şubelerde olan gruplar
        # VEYA hiç ürünü olmayan gruplar (yeni oluşturulan grup) görünsün.
        # NOT: branch_filter_qs burada kullanılamaz çünkü products__branches M2M
        # INNER JOIN üzerinden filtreler ve ürünü olmayan grupları sessizce düşürür.
        return qs.filter(
            Q(products__branches__id__in=allowed) | Q(products__isnull=True)
        ).distinct()

    def perform_create(self, serializer):
        serializer.save()
        broadcast_menu_catalog_refresh("modifier_group_created")

    def perform_update(self, serializer):
        serializer.save()
        broadcast_menu_catalog_refresh("modifier_group_updated")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        broadcast_menu_catalog_refresh("modifier_group_deleted")
        return Response(status=status.HTTP_204_NO_CONTENT)


class ModifierViewSet(viewsets.ModelViewSet):
    serializer_class = ModifierSerializer
    permission_classes = [RBACPermission]
    permission_description = 'Menü Değiştirici Yönetimi'

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return ModifierWriteSerializer
        return ModifierSerializer

    def get_permissions(self):
        read_codes = ['menu.view_modifier', 'menu.manage_modifier']
        write_codes = ['menu.manage_modifier']
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_codes
        elif self.action in ['create', 'update', 'partial_update', 'destroy']:
            self.permission_codes = write_codes
        else:
            self.permission_codes = read_codes
        return super().get_permissions()

    def get_queryset(self):
        qs = Modifier.objects.filter(is_active=True, group__is_active=True).select_related('group')
        return branch_filter_qs(qs, self.request, field='group__products__branches__id')

    def perform_create(self, serializer):
        serializer.save()
        broadcast_menu_catalog_refresh("modifier_created")

    def perform_update(self, serializer):
        serializer.save()
        broadcast_menu_catalog_refresh("modifier_updated")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        broadcast_menu_catalog_refresh("modifier_deleted")
        return Response(status=status.HTTP_204_NO_CONTENT)


class MenuTagViewSet(viewsets.ModelViewSet):
    serializer_class = MenuTagSerializer
    permission_classes = [RBACPermission]
    permission_description = 'Menü Etiket Yönetimi'
    pagination_class = MenuCatalogPagination

    def get_queryset(self):
        qs = MenuTag.objects.filter(is_active=True).select_related('branch').order_by('name')
        branch_id = (self.request.query_params.get('branch_id') or '').strip()
        if branch_id:
            return qs.filter(branch_id=branch_id)
        allowed = accessible_branch_id_strings(self.request.user)
        if allowed is None:
            return qs
        if not allowed:
            return qs.none()
        return qs.filter(branch_id__in=allowed)

    def get_permissions(self):
        read_codes = ['menu.view_product', 'menu.manage_product']
        write_codes = ['menu.manage_product']
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_codes
        elif self.action in ['create', 'update', 'partial_update', 'destroy']:
            self.permission_codes = write_codes
        else:
            self.permission_codes = read_codes
        return super().get_permissions()

    def perform_create(self, serializer):
        instance = serializer.save()
        broadcast_menu_catalog_refresh("menu_tag_created", branch_id=str(instance.branch_id))

    def perform_update(self, serializer):
        instance = serializer.save()
        broadcast_menu_catalog_refresh("menu_tag_updated", branch_id=str(instance.branch_id))

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        branch_id = str(instance.branch_id)
        soft_delete_menu_tag(instance)
        broadcast_menu_catalog_refresh("menu_tag_deleted", branch_id=branch_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MenuCatalogSettingsViewSet(viewsets.ViewSet):
    permission_classes = [RBACPermission]
    permission_description = 'Menü Katalog Etiket Filtresi'

    def get_permissions(self):
        if self.action in ['retrieve', 'list']:
            self.permission_codes = ['menu.view_product', 'menu.manage_product']
        else:
            self.permission_codes = ['menu.manage_product']
        return super().get_permissions()

    def list(self, request):
        branch_id = (request.query_params.get('branch_id') or '').strip()
        if not branch_id:
            return Response({'error': _('branch_id parametresi gerekli.')}, status=status.HTTP_400_BAD_REQUEST)
        return Response(catalog_settings_payload(branch_id))

    def create(self, request):
        ser = MenuCatalogActivateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        branch_id = data['branch_id']
        if data.get('filter_untagged'):
            activate_catalog_tag(branch_id=branch_id, filter_untagged=True)
        elif data.get('tag_id'):
            activate_catalog_tag(branch_id=branch_id, tag_id=data['tag_id'])
        else:
            activate_catalog_tag(branch_id=branch_id)
        broadcast_menu_catalog_refresh("menu_tag_filter_activated", branch_id=str(branch_id))
        return Response(catalog_settings_payload(branch_id))
