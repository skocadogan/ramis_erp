import logging
from decimal import Decimal, ROUND_HALF_UP

from django.utils.translation import gettext as _
from django.utils import timezone
from rest_framework import serializers

from core.serializer_fields import RelativeMediaUrlField

logger = logging.getLogger(__name__)

from .models import Category, CombinedProductItem, MenuCatalogSettings, MenuTag, Modifier, ModifierGroup, Product, ProductRecommendation, ProductUnit, ProductVariant

class MenuTagSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = MenuTag
        fields = ['id', 'branch', 'branch_name', 'name', 'created_at', 'updated_at']

    def validate_name(self, value):
        from .menu_tag_service import normalize_tag_name
        name = normalize_tag_name(value)
        if not name or len(name) < 2:
            raise serializers.ValidationError(_('Geçerli bir etiket adı girin.'))
        return name

    def validate(self, attrs):
        branch = attrs.get('branch') or getattr(self.instance, 'branch', None)
        name = attrs.get('name') or getattr(self.instance, 'name', None)
        if branch and name:
            qs = MenuTag.objects.filter(branch=branch, name=name, is_active=True)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({'name': _('Bu şubede aynı isimde etiket zaten var.')})
        return attrs


class MenuTagBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuTag
        fields = ['id', 'name', 'branch']


class MenuCatalogSettingsSerializer(serializers.Serializer):
    active_tag_id = serializers.UUIDField(allow_null=True, required=False)
    active_tag_name = serializers.CharField(allow_null=True, required=False)
    filter_untagged = serializers.BooleanField(required=False, default=False)
    has_tags = serializers.BooleanField(required=False, default=False)


class MenuCatalogActivateSerializer(serializers.Serializer):
    branch_id = serializers.UUIDField()
    tag_id = serializers.UUIDField(required=False, allow_null=True)
    filter_untagged = serializers.BooleanField(required=False, default=False)


class CategorySerializer(serializers.ModelSerializer):
    station_name = serializers.CharField(source='station.name', read_only=True, allow_null=True)
    parent_name = serializers.CharField(source='parent.name', read_only=True, allow_null=True)
    tags = serializers.SerializerMethodField()
    tag_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        write_only=True,
    )

    class Meta:
        model = Category
        fields = [
            'id', 'name', 'description', 'parent', 'parent_name', 'is_active', 'order', 'color',
            'station', 'station_name', 'tags', 'tag_ids', 'created_at', 'updated_at',
        ]

    def get_tags(self, obj):
        active_tags = obj.tags.filter(is_active=True)
        return MenuTagBriefSerializer(active_tags, many=True).data

    def create(self, validated_data):
        tag_ids = validated_data.pop('tag_ids', None)
        instance = super().create(validated_data)
        if tag_ids is not None:
            instance.tags.set(tag_ids)
        return instance

    def update(self, instance, validated_data):
        tag_ids = validated_data.pop('tag_ids', None)
        instance = super().update(instance, validated_data)
        if tag_ids is not None:
            instance.tags.set(tag_ids)
        return instance

class ProductVariantSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductVariant
        fields = '__all__'

class ProductUnitSerializer(serializers.ModelSerializer):
    calculated_price = serializers.DecimalField(max_digits=12, decimal_places=4, read_only=True)
    
    class Meta:
        model = ProductUnit
        fields = ['id', 'name', 'multiplier', 'price_override', 'order', 'calculated_price']

class ModifierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Modifier
        fields = '__all__'


class ModifierWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Modifier
        fields = ['id', 'group', 'name', 'price_adjustment', 'is_active']
        read_only_fields = ['id']


class ActiveModifierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Modifier
        fields = ['id', 'name', 'price_adjustment']


class ModifierGroupSerializer(serializers.ModelSerializer):
    modifiers = serializers.SerializerMethodField()
    product_ids = serializers.SerializerMethodField()

    class Meta:
        model = ModifierGroup
        fields = ['id', 'name', 'is_multiple', 'is_required', 'is_active', 'modifiers', 'product_ids', 'created_at', 'updated_at']

    def get_modifiers(self, obj):
        cache = getattr(obj, '_prefetched_objects_cache', None)
        if cache and 'modifiers' in cache:
            mods = [m for m in cache['modifiers'] if m.is_active]
        else:
            mods = obj.modifiers.filter(is_active=True)
        return ActiveModifierSerializer(mods, many=True).data

    def get_product_ids(self, obj):
        cache = getattr(obj, '_prefetched_objects_cache', None)
        if cache and 'products' in cache:
            return [str(p.id) for p in cache['products'] if p.is_active]
        return [str(pid) for pid in obj.products.filter(is_active=True).values_list('id', flat=True)]


class ModifierGroupWriteSerializer(serializers.ModelSerializer):
    product_ids = serializers.ListField(child=serializers.UUIDField(), required=False, write_only=True)

    class Meta:
        model = ModifierGroup
        fields = ['id', 'name', 'is_multiple', 'is_required', 'is_active', 'product_ids']
        read_only_fields = ['id']

    def create(self, validated_data):
        product_ids = validated_data.pop('product_ids', None)
        group = ModifierGroup.objects.create(**validated_data)
        if product_ids is not None:
            group.products.set(product_ids)
        return group

    def update(self, instance, validated_data):
        product_ids = validated_data.pop('product_ids', None)
        instance = super().update(instance, validated_data)
        if product_ids is not None:
            instance.products.set(product_ids)
        return instance

class CombinedProductItemSerializer(serializers.ModelSerializer):
    quantity = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=Decimal('0.0001'),
    )
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_unit_name = serializers.CharField(source='product_unit.name', read_only=True, allow_null=True)
    product_category_station = serializers.UUIDField(
        source='product.category.station_id', read_only=True, allow_null=True
    )
    product_unit_multiplier = serializers.SerializerMethodField()
    calculated_unit_price = serializers.SerializerMethodField()

    def get_product_unit_multiplier(self, obj):
        if not obj.product_unit_id:
            return 1
        return float(obj.product_unit.multiplier)

    def get_calculated_unit_price(self, obj):
        if not obj.product_unit_id:
            return None
        return float(obj.product_unit.calculated_price)

    def validate(self, attrs):
        product = attrs.get('product')
        pu = attrs.get('product_unit')
        inst = getattr(self, 'instance', None)
        if inst is not None:
            if product is None:
                product = inst.product
            if 'product_unit' not in attrs and inst.product_unit_id:
                pu = inst.product_unit
        if pu is None:
            return attrs
        if product is not None and pu.product_id != product.id:
            raise serializers.ValidationError({
                'product_unit': _(
                    'Bu satış birimi seçilen alt ürüne ait değil.',
                ),
            })
        return attrs

    class Meta:
        model = CombinedProductItem
        fields = [
            'id', 'product', 'product_name', 'quantity',
            'product_unit', 'product_unit_name', 'product_category_station',
            'product_unit_multiplier', 'calculated_unit_price',
        ]


class ProductRecommendationReadSerializer(serializers.ModelSerializer):
    recommended_product_id = serializers.UUIDField(source='recommended_product.id', read_only=True)
    recommended_product_name = serializers.CharField(source='recommended_product.name', read_only=True)
    recommended_product_base_price = serializers.DecimalField(
        source='recommended_product.base_price', max_digits=12, decimal_places=4, read_only=True,
    )
    recommended_product_has_discount = serializers.BooleanField(
        source='recommended_product.has_discount', read_only=True,
    )
    recommended_product_discounted_price = serializers.SerializerMethodField()
    recommended_product_units = ProductUnitSerializer(
        source='recommended_product.units', many=True, read_only=True,
    )
    product_unit_name = serializers.CharField(source='product_unit.name', read_only=True, allow_null=True)

    def get_recommended_product_discounted_price(self, obj):
        rp = obj.recommended_product
        if not rp.has_discount:
            return None
        return float(rp.discounted_price)

    class Meta:
        model = ProductRecommendation
        fields = [
            'id', 'recommended_product_id', 'recommended_product_name',
            'recommended_product_base_price', 'recommended_product_has_discount',
            'recommended_product_discounted_price', 'recommended_product_units',
            'product_unit', 'product_unit_name', 'order',
        ]


class ProductRecommendationPosSerializer(serializers.ModelSerializer):
    """POS kataloğunda kaynak ürünün öneri listesi (hafif)."""
    product_id = serializers.UUIDField(source='recommended_product.id', read_only=True)
    name = serializers.CharField(source='recommended_product.name', read_only=True)
    base_price = serializers.DecimalField(
        source='recommended_product.base_price', max_digits=12, decimal_places=4, read_only=True,
    )
    has_discount = serializers.BooleanField(source='recommended_product.has_discount', read_only=True)
    discounted_price = serializers.SerializerMethodField()
    units = ProductUnitSerializer(source='recommended_product.units', many=True, read_only=True)
    product_unit_id = serializers.UUIDField(source='product_unit.id', read_only=True, allow_null=True)
    product_unit_name = serializers.CharField(source='product_unit.name', read_only=True, allow_null=True)

    def get_discounted_price(self, obj):
        rp = obj.recommended_product
        if not rp.has_discount:
            return None
        return float(rp.discounted_price)

    class Meta:
        model = ProductRecommendation
        fields = [
            'id', 'product_id', 'name', 'base_price', 'has_discount', 'discounted_price',
            'units', 'product_unit_id', 'product_unit_name', 'order',
        ]


class ProductRecommendationSyncItemSerializer(serializers.Serializer):
    recommended_product_id = serializers.UUIDField()
    product_unit_id = serializers.UUIDField(required=False, allow_null=True)
    order = serializers.IntegerField(min_value=0, default=0)

    def validate(self, attrs):
        source = self.context.get('source_product')
        rec_id = attrs['recommended_product_id']
        if source and str(rec_id) == str(source.id):
            raise serializers.ValidationError({
                'recommended_product_id': _('Ürün kendisini öneremez.'),
            })
        try:
            rec_product = Product.objects.get(pk=rec_id, is_active=True)
        except Product.DoesNotExist:
            raise serializers.ValidationError({
                'recommended_product_id': _('Önerilen ürün bulunamadı.'),
            })
        unit_id = attrs.get('product_unit_id')
        if unit_id is not None:
            unit = rec_product.units.filter(pk=unit_id, is_active=True).first()
            if not unit:
                raise serializers.ValidationError({
                    'product_unit_id': _('Satış birimi bu ürüne ait değil.'),
                })
            attrs['product_unit'] = unit
        else:
            attrs['product_unit'] = None
        attrs['recommended_product'] = rec_product
        return attrs


class ProductRecommendationSyncSerializer(serializers.Serializer):
    items = ProductRecommendationSyncItemSerializer(many=True)

    def validate_items(self, value):
        seen = set()
        for item in value:
            pid = str(item['recommended_product_id'])
            if pid in seen:
                raise serializers.ValidationError(_('Aynı ürün birden fazla kez önerilemez.'))
            seen.add(pid)
        return value


class ProductSerializer(serializers.ModelSerializer):
    image = RelativeMediaUrlField(required=False, allow_null=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_color = serializers.CharField(source='category.color', read_only=True)
    category_station = serializers.UUIDField(source='category.station_id', read_only=True, allow_null=True)
    category_station_name = serializers.CharField(source='category.station.name', read_only=True, allow_null=True)
    variants = ProductVariantSerializer(many=True, read_only=True)
    units = ProductUnitSerializer(many=True, required=False)
    combined_items = CombinedProductItemSerializer(many=True, required=False)
    modifier_groups = serializers.SerializerMethodField()
    discounted_price = serializers.SerializerMethodField()
    has_discount = serializers.SerializerMethodField()
    branch_names = serializers.SerializerMethodField()
    recipe_cost_per_serving = serializers.SerializerMethodField()
    availability_mode = serializers.SerializerMethodField()
    remaining_portions = serializers.SerializerMethodField()
    pos_block_mode = serializers.SerializerMethodField()
    is_reserved_out = serializers.SerializerMethodField()
    is_allergenic = serializers.SerializerMethodField()
    allergens = serializers.SerializerMethodField()
    has_recommendations = serializers.SerializerMethodField()
    recommendations = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()
    tag_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        write_only=True,
    )

    def get_tags(self, obj):
        active_tags = obj.tags.filter(is_active=True)
        return MenuTagBriefSerializer(active_tags, many=True).data

    def get_has_recommendations(self, obj):
        recs = self._active_recommendations(obj)
        return len(recs) > 0

    def _active_recommendations(self, obj):
        prefetched = getattr(obj, '_prefetched_objects_cache', {}).get('recommendations')
        if prefetched is not None:
            recs = [r for r in prefetched if r.is_active]
        else:
            recs = list(obj.recommendations.filter(is_active=True).select_related(
                'recommended_product', 'product_unit',
            ).prefetch_related('recommended_product__units'))
        request = self.context.get('request')
        branch_id = request.query_params.get('branch_id') if request else None
        filtered = []
        for rec in recs:
            rp = rec.recommended_product
            if not rp.is_active or not rp.show_on_pos:
                continue
            if branch_id:
                if (
                    hasattr(rp, '_prefetched_objects_cache')
                    and 'branches' in rp._prefetched_objects_cache
                ):
                    branch_ids = [str(b.id) for b in rp.branches.all()]
                else:
                    branch_ids = [str(bid) for bid in rp.branches.values_list('id', flat=True)]
                if branch_ids and str(branch_id) not in branch_ids:
                    continue
            filtered.append(rec)
        return sorted(filtered, key=lambda r: (r.order, r.created_at))

    def get_recommendations(self, obj):
        recs = self._active_recommendations(obj)
        return ProductRecommendationPosSerializer(recs, many=True).data

    def get_is_allergenic(self, obj):
        from .product_allergens import product_is_allergenic
        return product_is_allergenic(obj)

    def get_allergens(self, obj):
        from .product_allergens import get_product_allergens
        from apps.inventory.serializers import AllergenListSerializer
        items = get_product_allergens(obj)
        return AllergenListSerializer(items, many=True).data

    def get_recipe_cost_per_serving(self, obj):
        """Reçete kaydı bu ürünü işaret eder (Recipe.product); maliyet reçeteden okunur."""
        from decimal import Decimal
        from django.core.exceptions import ObjectDoesNotExist

        try:
            recipe = obj.recipe
        except ObjectDoesNotExist:
            return None
        cps = recipe.cost_per_serving
        if isinstance(cps, Decimal):
            return float(cps.quantize(Decimal('0.0001')))
        return float(cps) if cps is not None else None

    def get_branch_names(self, obj):
        # PERF: prefetch_related('branches') yapılmışsa ORM bellekteki veriyi kullanır;
        # values_list() her çağrıda DB sorgusu açmasın diye Python comprehension kullan.
        cache = getattr(obj, '_prefetched_objects_cache', None)
        if cache and 'branches' in cache:
            return [b.name for b in cache['branches']]
        return list(obj.branches.values_list('name', flat=True))

    def get_modifier_groups(self, obj):
        cache = getattr(obj, '_prefetched_objects_cache', None)
        if cache and 'modifier_groups' in cache:
            groups = [g for g in cache['modifier_groups'] if g.is_active]
        else:
            groups = list(obj.modifier_groups.filter(is_active=True))

        groups_data = []
        for group in groups:
            mod_cache = getattr(group, '_prefetched_objects_cache', None)
            if mod_cache and 'modifiers' in mod_cache:
                active_modifiers = [m for m in mod_cache['modifiers'] if m.is_active]
            else:
                active_modifiers = list(group.modifiers.filter(is_active=True))
            if not active_modifiers:
                continue
            groups_data.append(ModifierGroupSerializer(group, context=self.context).data)
        return groups_data

    def get_discounted_price(self, obj):
        if not obj.has_discount:
            return None
        return float(obj.discounted_price)

    def get_has_discount(self, obj):
        return obj.has_discount

    def _get_availability_obj(self, obj):
        attr_name = f'_cached_avail_{self.context.get("request").query_params.get("branch_id")}'
        if hasattr(obj, attr_name):
            return getattr(obj, attr_name)

        # Try pre-loaded map first (from viewset context)
        availability_map = self.context.get('availability_map')
        branch_id = self.context.get('request').query_params.get('branch_id') if self.context.get('request') else None
        if availability_map and obj.pk in availability_map:
            avail = availability_map[obj.pk]
        elif not branch_id:
            setattr(obj, attr_name, None)
            return None
        else:
            # Fallback: individual query (should rarely happen)
            from apps.production_planning.models import ProductDayAvailability
            today = timezone.localdate()
            try:
                avail = ProductDayAvailability.objects.filter(
                    branch_id=branch_id,
                    product=obj,
                    effective_date=today,
                    is_active=True,
                ).first()
            except Exception:
                logger.warning("Stok müsaitlik sorgusunda hata (product_id=%s)", getattr(obj, 'id', None))
                avail = None

        setattr(obj, attr_name, avail)
        return avail

    def get_availability_mode(self, obj):
        avail = self._get_availability_obj(obj)
        if avail:
            return avail.mode
        return 'UNLIMITED'

    def get_remaining_portions(self, obj):
        avail = self._get_availability_obj(obj)
        if avail:
            return float(avail.remaining_portions) if avail.remaining_portions is not None else None
        return None

    def get_pos_block_mode(self, obj):
        request = self.context.get('request')
        if not request:
            return 'OFF'
        
        branch_id = request.query_params.get('branch_id')
        if not branch_id:
            return 'OFF'
            
        from apps.production_planning.models import ProductionDaySettings
        
        # Cache settings on request to avoid N+1 per product
        if not hasattr(request, '_cached_branch_settings'):
            request._cached_branch_settings = {}
            
        if branch_id not in request._cached_branch_settings:
            settings = ProductionDaySettings.objects.filter(branch_id=branch_id).first()
            request._cached_branch_settings[branch_id] = settings.pos_block_mode if settings else 'OFF'
            
        return request._cached_branch_settings[branch_id]

    def get_is_reserved_out(self, obj) -> bool:
        """
        Ürünün hammaddeleri fiziksel olarak var (physical > 0)
        ancak rezervasyonlar nedeniyle tükenmiş (physical - reserved <= 0) ise True döner.
        """
        recipe = getattr(obj, 'recipe', None)
        if not recipe:
            return False
            
        # Context'ten stok haritasını al (Performans için ViewSet tarafından doldurulur)
        stock_map = self.context.get('stock_map', {})
        if not stock_map:
            return False
            
        # Reçete hammaddelerini kontrol et
        for ing in recipe.ingredients.all():
            si_id = str(ing.stock_item_id)
            data = stock_map.get(si_id)
            if not data:
                continue
                
            physical = data.get('physical', 0)
            reserved = data.get('reserved', 0)
            available = physical - reserved
            
            # Eğer fiziksel stok var ama rezervasyonlar yüzünden kullanılabilir stok yoksa
            # Bu hammadde darboğazdır.
            if physical > 0 and available <= 0:
                return True
                
        return False

    def to_internal_value(self, data):
        from decimal import Decimal, ROUND_HALF_UP

        # Convert QueryDict to dynamic dict if necessary to store objects/lists
        if hasattr(data, 'dict'):
            data = data.dict()
        else:
            data = data.copy()

        # Handle clearing the image
        if 'image' in data and data['image'] == '':
            data['image'] = None

        if 'calories' in data and data['calories'] in ('', None):
            data['calories'] = None
        elif 'calories' in data and data['calories'] not in (None, ''):
            try:
                data['calories'] = int(str(data['calories']).strip())
            except (TypeError, ValueError):
                pass

        # Sanitize and round base_price (to 4 places)
        if 'base_price' in data and data['base_price']:
            try:
                bp = str(data['base_price']).replace(',', '.')
                data['base_price'] = str(Decimal(bp).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP))
            except Exception:
                logger.warning("base_price dönüşüm hatası (value=%s)", data.get('base_price'))

        # Brüt ve vergi oranı (%), 2 ondalık
        if 'gross_price' in data and data['gross_price'] not in (None, ''):
            try:
                g = str(data['gross_price']).replace(',', '.')
                data['gross_price'] = str(Decimal(g).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))
            except Exception:
                pass
        if 'tax_rate' in data and data['tax_rate'] not in (None, ''):
            try:
                t = str(data['tax_rate']).replace(',', '.')
                data['tax_rate'] = str(Decimal(t).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))
            except Exception:
                pass

        # Handle 'units' data
        units_raw = data.get('units')
        if units_raw:
            units_data = None
            if isinstance(units_raw, str):
                import json
                try:
                    units_data = json.loads(units_raw.replace(',', '.'))
                except (json.JSONDecodeError, TypeError):
                    try:
                        units_data = json.loads(units_raw)
                    except Exception:
                        logger.warning("units JSON parse hatası (value=%s)", units_raw[:80] if isinstance(units_raw, str) else units_raw)
            elif isinstance(units_raw, list):
                units_data = units_raw
            
            if isinstance(units_data, list):
                valid_fields = ['name', 'multiplier', 'price_override', 'order']
                cleaned_units = []
                for u in units_data:
                    if not isinstance(u, dict): continue
                    
                    # Sanitize and round multiplier
                    if 'multiplier' in u and u['multiplier']:
                        try:
                            m = str(u['multiplier']).replace(',', '.')
                            u['multiplier'] = str(Decimal(m).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP))
                        except Exception:
                            logger.warning("units multiplier dönüşüm hatası (value=%s)", u.get('multiplier'))
                    
                    # Sanitize and round price_override
                    if 'price_override' in u and u['price_override']:
                        try:
                            po = str(u['price_override']).replace(',', '.')
                            u['price_override'] = str(Decimal(po).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP))
                        except Exception:
                            logger.warning("units price_override dönüşüm hatası (value=%s)", u.get('price_override'))
                    
                    # Filter to only allowed fields
                    item = {k: v for k, v in u.items() if k in valid_fields}
                    cleaned_units.append(item)
                data['units'] = cleaned_units

        # Handle 'combined_items' data
        combined_raw = data.get('combined_items')
        if combined_raw:
            combined_data = None
            if isinstance(combined_raw, str):
                import json
                try:
                    combined_data = json.loads(combined_raw)
                except Exception:
                    logger.warning("combined_items JSON parse hatası (value=%s)", combined_raw[:80] if isinstance(combined_raw, str) else combined_raw)
            elif isinstance(combined_raw, list):
                combined_data = combined_raw
            
            if isinstance(combined_data, list):
                valid_fields = ['product', 'quantity', 'product_unit']
                cleaned_combined = []
                for c in combined_data:
                    if not isinstance(c, dict): continue
                    item = {k: v for k, v in c.items() if k in valid_fields}
                    if item.get('product_unit') in ('', None):
                        item['product_unit'] = None
                    if 'quantity' in item and item['quantity'] not in (None, ''):
                        try:
                            q = str(item['quantity']).replace(',', '.')
                            item['quantity'] = str(
                                Decimal(q).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)
                            )
                        except Exception:
                            pass
                    cleaned_combined.append(item)
                data['combined_items'] = cleaned_combined
        
        # Handle 'branches' data
        branches_raw = data.get('branches')
        if branches_raw and isinstance(branches_raw, str):
            import json
            try:
                data['branches'] = json.loads(branches_raw)
            except Exception:
                logger.warning("branches JSON parse hatası (value=%s)", branches_raw[:80])

        tag_ids_raw = data.get('tag_ids')
        if tag_ids_raw and isinstance(tag_ids_raw, str):
            import json
            try:
                data['tag_ids'] = json.loads(tag_ids_raw)
            except Exception:
                logger.warning("tag_ids JSON parse hatası (value=%s)", tag_ids_raw[:80])

        return super().to_internal_value(data)

    def create(self, validated_data):
        units_data = validated_data.pop('units', [])
        combined_data = validated_data.pop('combined_items', [])
        branches_data = validated_data.pop('branches', [])
        tag_ids = validated_data.pop('tag_ids', None)

        # Enforce branch association for branch manager / staff if none specified
        if not branches_data:
            request = self.context.get('request')
            if request and request.user:
                from core.branch_scope import accessible_branch_id_strings
                accessible_ids = accessible_branch_id_strings(request.user)
                if accessible_ids:
                    from apps.branches.models import Branch
                    branches_data = list(Branch.objects.filter(id__in=accessible_ids))

        product = Product.objects.create(**validated_data)
        
        if branches_data:
            product.branches.set(branches_data)
            
        for unit_data in units_data:
            ProductUnit.objects.create(product=product, **unit_data)
            
        for c_data in combined_data:
            CombinedProductItem.objects.create(parent_product=product, **c_data)

        if tag_ids is not None:
            product.tags.set(tag_ids)
            
        return product

    def update(self, instance, validated_data):
        units_data = validated_data.pop('units', None)
        combined_data = validated_data.pop('combined_items', None)
        branches_data = validated_data.pop('branches', None)
        tag_ids = validated_data.pop('tag_ids', None)

        # Enforce branch association for branch manager / staff if empty list is passed
        if branches_data is not None and len(branches_data) == 0:
            request = self.context.get('request')
            if request and request.user and not request.user.is_superuser:
                from core.branch_scope import accessible_branch_id_strings
                accessible_ids = accessible_branch_id_strings(request.user)
                if accessible_ids:
                    from apps.branches.models import Branch
                    branches_data = list(Branch.objects.filter(id__in=accessible_ids))

        instance = super().update(instance, validated_data)
        
        if branches_data is not None:
            instance.branches.set(branches_data)

        if units_data is not None:
            instance.units.all().delete()
            for unit_data in units_data:
                ProductUnit.objects.create(product=instance, **unit_data)
        
        if combined_data is not None:
            instance.combined_items.all().delete()
            for c_data in combined_data:
                CombinedProductItem.objects.create(parent_product=instance, **c_data)

        if tag_ids is not None:
            instance.tags.set(tag_ids)
        
        return instance

    branch_name = serializers.CharField(source='category.station.branch.name', read_only=True, allow_null=True)
    branch_id = serializers.UUIDField(source='category.station.branch.id', read_only=True, allow_null=True)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Birleşik ürünlerin alt bileşenlerini (combined_items) şube bazlı filtreliyoruz.
        # Eğer alt ürün o şubede geçerli değilse veya şubesi atanmamışsa listeye dahil etmiyoruz.
        if instance.is_combined and 'combined_items' in data:
            request = self.context.get('request')
            if request:
                branch_id = request.query_params.get('branch_id')
                if branch_id:
                    combined_map = self.context.get('combined_product_allowed_map', {})
                    if instance.pk in combined_map:
                        allowed_prod_ids = combined_map[instance.pk]
                    else:
                        allowed_prod_ids = set(
                            str(uuid_id) for uuid_id in Product.objects.filter(
                                id__in=[item['product'] for item in data['combined_items'] if item.get('product')],
                                is_active=True,
                                branches__id=branch_id,
                            ).values_list('id', flat=True)
                        )
                    data['combined_items'] = [
                        item for item in data['combined_items']
                        if str(item.get('product')) in allowed_prod_ids
                    ]
        return data

    class Meta:
        model = Product
        fields = [
            'id', 'category', 'category_name', 'category_color',
            'category_station', 'category_station_name',
            'branch_name', 'branch_id', 'branches', 'branch_names', 'name', 'description', 
            'base_price', 'gross_price', 'tax_rate', 'discount_rate', 'discounted_price', 'has_discount', 
            'is_active', 'show_on_pos', 'is_show_on_menu', 'is_featured', 'is_popular', 'is_chef_recommendation',
            'is_combined', 'image', 'order', 'calories',
            'units', 'combined_items', 'variants', 'modifier_groups', 'updated_at',
            'recipe_cost_per_serving', 'availability_mode', 'remaining_portions', 'pos_block_mode',
            'is_reserved_out', 'is_allergenic', 'allergens',
            'has_recommendations', 'recommendations', 'tags', 'tag_ids',
        ]
