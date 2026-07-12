"""Taslak mal kabul: StockReceiptDraft kesinleştirme."""

from core.decimal_constants import ZERO_QTY

from django.db import transaction
from django.utils import timezone as tz
from django.utils.translation import gettext as _

from apps.inventory.models import (
    StockItem,
    StockReceiptDraft,
    StockReceiptDraftLine,
    StockReceiptDraftStatus,
    StockUnit,
)
from apps.inventory.stock_minimum import ZERO_QTY

from .stock_movement_service import receive_stock


@transaction.atomic
def finalize_stock_receipt_draft(draft_id, user) -> list[str]:
    """Taslak satırlarını stok girişine dönüştürür; taslak POSTED olur."""
    # supplier null=True → select_related ile LEFT OUTER JOIN oluşur; PostgreSQL
    # tüm sorgu için FOR UPDATE, dış birleşimin nullable tarafında desteklenmez.
    # Yalnızca taslak satırını kilitlemek yeterli (Django: of=('self',)).
    draft = (
        StockReceiptDraft.objects.select_for_update(of=("self",))
        .select_related("warehouse", "supplier")
        .get(pk=draft_id)
    )
    if draft.status != StockReceiptDraftStatus.DRAFT:
        raise ValueError(_("Taslak zaten kesinleştirilmiş."))

    lines = list(
        StockReceiptDraftLine.objects.filter(draft=draft, is_active=True)
        .select_related("stock_item", "temp_category")
        .order_by("sort_order", "id")
    )
    if not lines:
        raise ValueError(_("Taslakta en az bir satır olmalı."))

    movement_ids: list[str] = []
    ref = (draft.reference or "").strip()
    notes_base = (draft.notes or "").strip()

    for idx, line in enumerate(lines, start=1):
        q = line.quantity
        if q is None or q <= 0:
            raise ValueError(
                _("Satır %(line)s: miktar pozitif olmalı.") % {"line": idx}
            )

        if line.stock_item_id:
            stock_item_id = line.stock_item_id
        else:
            name = (line.temp_name or "").strip()
            sku = (line.temp_sku or "").strip()
            unit = (line.temp_unit or "").strip()
            if not name or not sku or not unit:
                raise ValueError(
                    _(
                        "Satır %(line)s: yeni kalem için ad, SKU ve birim zorunludur."
                    )
                    % {"line": idx}
                )
            if StockItem.objects.filter(sku=sku).exists():
                raise ValueError(
                    _('Satır %(line)s: SKU "%(sku)s" zaten kullanılıyor.')
                    % {"line": idx, "sku": sku}
                )
            if not StockUnit.objects.filter(short_name=unit).exists():
                raise ValueError(
                    _(
                        'Satır %(line)s: geçersiz birim "%(unit)s". '
                        "Birim Tanımlamalarından seçin."
                    )
                    % {"line": idx, "unit": unit}
                )
            item = StockItem.objects.create(
                name=name,
                sku=sku,
                unit=unit,
                category=line.temp_category,
                minimum_quantity=ZERO_QTY,
                last_purchase_price=line.unit_price or ZERO_QTY,
            )
            stock_item_id = item.id

        unit_for_receive = (line.unit or "").strip() or None
        line_notes = f"{notes_base} (Satır {idx})" if notes_base else f"Satır {idx}"

        mov = receive_stock(
            warehouse_id=draft.warehouse_id,
            stock_item_id=stock_item_id,
            quantity=q,
            reference=ref,
            notes=line_notes,
            performed_by=user,
            supplier_id=draft.supplier_id,
            unit=unit_for_receive,
            unit_price=line.unit_price or ZERO_QTY,
            lot_number=(line.lot_number or "").strip(),
            expiry_date=line.expiry_date,
        )
        movement_ids.append(str(mov.id))

    draft.status = StockReceiptDraftStatus.POSTED
    draft.posted_at = tz.now()
    draft.save(update_fields=["status", "posted_at", "updated_at"])

    return movement_ids
