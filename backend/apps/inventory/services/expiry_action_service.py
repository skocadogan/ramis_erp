"""SKT aksiyon kaydı ve geçmiş sorguları."""

from django.db import transaction
from django.utils.translation import gettext_lazy as _

from apps.audit.services import record_audit
from apps.inventory.models import ExpiryAction, ExpiryActionType, StockLot
from core.branch_scope import user_accessible_warehouse_id_strings


def _assert_lot_access(user, lot: StockLot) -> None:
    allowed = user_accessible_warehouse_id_strings(user)
    if allowed is not None and str(lot.warehouse_id) not in allowed:
        raise PermissionError(_('Bu depo için yetkiniz yok.'))


from apps.inventory.expiry_risk import batch_recipe_usage_counts, compute_lot_risk_score


def serialize_lot(lot: StockLot, *, recipe_usage_count: int | None = None) -> dict:
    if recipe_usage_count is None:
        recipe_usage_count = 0
    return {
        'id': str(lot.id),
        'stock_item_id': str(lot.stock_item_id),
        'stock_item_name': lot.stock_item.name,
        'stock_item_sku': lot.stock_item.sku,
        'warehouse_id': str(lot.warehouse_id),
        'warehouse_name': lot.warehouse.name,
        'lot_number': lot.lot_number,
        'expiry_date': lot.expiry_date.isoformat() if lot.expiry_date else None,
        'days_until_expiry': lot.days_until_expiry,
        'quantity': str(lot.quantity),
        'is_expired': lot.is_expired,
        'risk_score': compute_lot_risk_score(lot, recipe_usage_count=recipe_usage_count),
    }


def serialize_lots(lots) -> list[dict]:
    """Lot listesini risk skoru ile serileştirir ve risk skoruna göre sıralar."""
    lot_list = list(lots)
    if not lot_list:
        return []
    stock_ids = [lot.stock_item_id for lot in lot_list]
    usage_map = batch_recipe_usage_counts(stock_ids)
    data = [
        serialize_lot(lot, recipe_usage_count=usage_map.get(str(lot.stock_item_id), 0))
        for lot in lot_list
    ]
    data.sort(key=lambda row: (-row['risk_score'], row.get('expiry_date') or ''))
    return data


class ExpiryActionService:
    VALID_ACTION_TYPES = frozenset(ExpiryActionType.values)

    @staticmethod
    @transaction.atomic
    def record_action(
        user,
        lot_id: str,
        action_type: str,
        notes: str = '',
    ) -> ExpiryAction:
        if action_type not in ExpiryActionService.VALID_ACTION_TYPES:
            raise ValueError(_('Geçersiz aksiyon tipi.'))

        lot = (
            StockLot.objects.select_related('stock_item', 'warehouse')
            .filter(id=lot_id, is_active=True, quantity__gt=0)
            .first()
        )
        if not lot:
            raise ValueError(_('Lot bulunamadı veya stokta değil.'))

        _assert_lot_access(user, lot)

        action = ExpiryAction.objects.create(
            stock_lot=lot,
            action_type=action_type,
            notes=(notes or '').strip(),
            created_by=user,
            branch=getattr(user, 'branch', None),
        )

        record_audit(
            action=f'inventory.expiry_action.{action_type.lower()}',
            target_instance=action,
            after_json={
                'lot_id': str(lot.id),
                'stock_item_sku': lot.stock_item.sku,
                'warehouse_id': str(lot.warehouse_id),
                'action_type': action_type,
                'notes': action.notes,
            },
            metadata={'expiry_date': lot.expiry_date.isoformat() if lot.expiry_date else None},
        )
        return action

    @staticmethod
    def get_action_history(
        user,
        *,
        lot_id: str | None = None,
        warehouse_id: str | None = None,
        limit: int = 50,
    ):
        allowed = user_accessible_warehouse_id_strings(user)
        qs = (
            ExpiryAction.objects.filter(is_active=True)
            .select_related(
                'stock_lot',
                'stock_lot__stock_item',
                'stock_lot__warehouse',
                'created_by',
            )
            .order_by('-created_at')
        )

        if allowed is not None:
            if not allowed:
                return qs.none()
            qs = qs.filter(stock_lot__warehouse_id__in=list(allowed))

        if lot_id:
            qs = qs.filter(stock_lot_id=lot_id)
        if warehouse_id:
            if allowed is not None and str(warehouse_id) not in allowed:
                return qs.none()
            qs = qs.filter(stock_lot__warehouse_id=warehouse_id)

        return qs[: max(1, min(limit, 200))]
