from collections import defaultdict
from uuid import UUID

from django.db import transaction
from django.utils.translation import gettext_lazy as _

from .models import Product, ModifierGroup, ProductRecommendation


class MenuValidationError(Exception):
    """Menü / seçenek doğrulama hatası."""


class MenuService:
    """Menü yönetimi iş mantığı."""

    @staticmethod
    @transaction.atomic
    def sync_product_modifier_groups(product: Product, group_ids) -> None:
        """Ürünün seçenek gruplarını (M2M) günceller."""
        if group_ids is None:
            return
        valid_ids = list(
            ModifierGroup.objects.filter(id__in=group_ids, is_active=True).values_list('id', flat=True)
        )
        product.modifier_groups.set(valid_ids)

    @staticmethod
    def resolve_order_item_modifiers(product_id, modifier_ids):
        """
        Sipariş kalemi için seçenekleri doğrular.
        Geçerli modifier UUID listesi döner; hata durumunda MenuValidationError.
        """
        raw_ids = list(modifier_ids or [])
        product = (
            Product.objects.filter(id=product_id, is_active=True)
            .prefetch_related('modifier_groups__modifiers')
            .first()
        )
        if not product:
            raise MenuValidationError(_('Ürün bulunamadı veya pasif.'))

        allowed = {}
        active_groups = []
        for group in product.modifier_groups.filter(is_active=True):
            mods = list(group.modifiers.filter(is_active=True))
            if not mods:
                continue
            active_groups.append(group)
            for mod in mods:
                allowed[mod.id] = (mod, group)

        selected_by_group = defaultdict(list)
        resolved = []
        seen = set()

        for mid in raw_ids:
            try:
                uid = UUID(str(mid))
            except (ValueError, TypeError) as exc:
                raise MenuValidationError(_('Geçersiz seçenek kimliği.')) from exc

            if uid in seen:
                continue
            entry = allowed.get(uid)
            if entry is None:
                raise MenuValidationError(_('Seçilen seçenek bu ürün için geçerli değil.'))

            mod, group = entry
            if not group.is_multiple and selected_by_group[group.id]:
                raise MenuValidationError(
                    _('"{name}" grubunda yalnızca bir seçenek seçilebilir.').format(name=group.name)
                )
            selected_by_group[group.id].append(mod)
            seen.add(uid)
            resolved.append(uid)

        for group in active_groups:
            if group.is_required and not selected_by_group[group.id]:
                raise MenuValidationError(
                    _('Zorunlu seçenek grubu: {name}').format(name=group.name)
                )

        return resolved

    @staticmethod
    @transaction.atomic
    def sync_product_recommendations(product: Product, items: list) -> list:
        """
        Kaynak ürünün öneri listesini senkronize eder.
        items: [{ recommended_product, product_unit, order }, ...]
        """
        incoming_ids = set()
        result = []
        for index, item in enumerate(items):
            rec_product = item['recommended_product']
            unit = item.get('product_unit')
            order = item.get('order', index)
            incoming_ids.add(rec_product.id)
            existing = ProductRecommendation.objects.filter(
                source_product=product,
                recommended_product=rec_product,
            ).first()
            if existing:
                existing.product_unit = unit
                existing.order = order
                existing.is_active = True
                existing.save(update_fields=['product_unit', 'order', 'is_active', 'updated_at'])
                result.append(existing)
            else:
                created = ProductRecommendation.objects.create(
                    source_product=product,
                    recommended_product=rec_product,
                    product_unit=unit,
                    order=order,
                )
                result.append(created)

        stale = ProductRecommendation.objects.filter(source_product=product).exclude(
            recommended_product_id__in=incoming_ids,
        )
        for rec in stale:
            rec.delete()

        return result
