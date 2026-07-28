"""
ReceiptRenderer — layout_json bloklarını ESC/POS komutlarına çevirir.

Desteklenen blok tipleri:
  text        — serbest metin (align, bold, size, margin_left, margin_right)
  divider     — yatay çizgi (char: '-', '=', '*')
  key_value   — sol-sağ hizalı çift
  item_loop   — ürün listesi döngüsü (items üzerinde)
  feed        — boş satır ekle (lines: int)
  cut         — kağıt kesimi
  qr          — QR kod (data: str)
"""
import re
import logging
from decimal import Decimal, InvalidOperation
from django.core.exceptions import ObjectDoesNotExist
from ..utils import turkish_to_escpos

logger = logging.getLogger(__name__)

_ESC_POS_ALIGNS = frozenset({"left", "center", "right"})


def _coerce_bool(value, default: bool = False) -> bool:
    """layout_json'daki bold alanı bazen string/int gelir; escpos yalnızca bool anahtar kabul eder."""
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in ("1", "true", "yes", "on"):
            return True
        if normalized in ("0", "false", "no", "off", ""):
            return False
    return bool(value)


def _coerce_align(value, default: str = "left") -> str:
    if isinstance(value, str):
        align = value.strip().lower()
        if align in _ESC_POS_ALIGNS:
            return align
    return default


# ── Jinja2 bağımlılığı olmadan basit değişken çözümleyici ────────────────────

def _resolve(content: str, ctx: dict) -> str:
    """{{ var }}, {{ var | currency }}, {{ var | date_tr }} ifadelerini çözer."""
    if not isinstance(content, str):
        return str(content) if content is not None else ""

    def replacer(match):
        expr = match.group(1).strip()
        parts = [p.strip() for p in expr.split("|")]
        key = parts[0]
        filters = parts[1:]

        # İç içe anahtarlar: "order.total" → ctx["order"]["total"]
        value = ctx
        for k in key.split("."):
            if isinstance(value, dict):
                value = value.get(k, "")
            else:
                value = getattr(value, k, "")
            if value == "":
                break

        # Special case for tax + rate: use total as base
        if (key == "tax" and any(f.startswith("rate") for f in filters)):
            value = ctx.get("total", value)

        if key == "tax" and not any(f.startswith("rate") for f in filters):
            if isinstance(ctx, dict) and ctx.get("_receipt_uses_with_tax_rates"):
                value = ctx.get("_receipt_items_tax_total", ctx.get("tax", value))

        for f in filters:
            if f.startswith("rate"):
                try:
                    f_parts = f.split()
                    rate_val = float(f_parts[1]) if len(f_parts) > 1 else 0
                    # KDV hesaplama
                    if key == "tax":
                        # KDV Dahil (Tax Included) hesaplama: Tutar - (Tutar / (1 + oran/100))
                        # Matematiksel olarak: Tutar * (oran / (100 + oran))
                        value = float(value or 0) * (rate_val / (100 + rate_val))
                    else:
                        # Normal yüzde hesaplama (örneğin hizmet bedeli veya indirim yüzdesi için)
                        value = float(value or 0) * (rate_val / 100)
                except (ValueError, TypeError):
                    value = 0
            elif f == "currency":
                value = _fmt_currency(value)
            elif f == "date_tr":
                value = _fmt_date(value)
            elif f == "qty":
                value = _fmt_qty(value)
            elif f == "with_options":
                name = _item_display_name(ctx) if isinstance(ctx, dict) else str(value or "")
                mod_text = _item_modifier_text(ctx if isinstance(ctx, dict) else {})
                value = f"{name}\n* {mod_text}" if mod_text else name
            elif f in ("with_tax_rates", "with_tax_rate"):
                name = _item_display_name(ctx) if isinstance(ctx, dict) else str(value or "")
                value = name

        return str(value)

    return re.sub(r"\{\{\s*(.+?)\s*\}\}", replacer, content)


def _fmt_currency(value) -> str:
    try:
        return f"{float(value):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") + " TL"
    except (ValueError, TypeError):
        return "0,00 TL"


def _fmt_date(value) -> str:
    if not value:
        return ""
    if hasattr(value, "strftime"):
        return value.strftime("%d.%m.%Y")
    return str(value)[:10]


def _fmt_qty(value) -> str:
    if value is None or value == "":
        return "0"
    try:
        d = Decimal(str(value)).normalize()
        return str(int(d)) if (d % 1).is_zero() else str(d).replace(".", ",")
    except (InvalidOperation, ValueError, TypeError):
        return "0"


# Ödeme satırı: API (SalePayment), istemci veya kod olabilir
_PAYMENT_CODE_LABELS = {
    "CASH": "Nakit",
    "CARD": "Kredi Kartı",
    "OTHER": "Diğer",
}


def _payment_line_label(p: dict) -> str:
    disp = p.get("payment_method_display")
    if disp is not None and str(disp).strip():
        return str(disp).strip()
    raw = p.get("method")
    if raw is None or raw == "":
        raw = p.get("payment_method")
    if raw is None:
        return ""
    key = str(raw).strip().upper()
    if key in _PAYMENT_CODE_LABELS:
        return _PAYMENT_CODE_LABELS[key]
    return str(raw).strip()


def _payment_type_from_payments(payments) -> str | None:
    """payments listesinden çok satırlı özet üretir."""
    if not isinstance(payments, list) or not payments:
        return None
    lines = []
    for p in payments:
        if not isinstance(p, dict):
            continue
        label = _payment_line_label(p)
        if not label:
            continue
        try:
            n = float(p.get("amount"))
        except (TypeError, ValueError):
            continue
        if n <= 0:
            continue
        lines.append(f"{label}: {_fmt_currency(n)}")
    if not lines:
        return None
    return "\n".join(lines)


def _item_modifier_text(item: dict) -> str:
    """Kalem seçeneklerini fiş satırı için metne çevirir; ücretli seçenekler (+N) ile gösterilir."""
    if not isinstance(item, dict):
        return ""
    entries = _normalize_modifier_entries(item)
    if entries:
        labels = [e["name"] for e in entries if e.get("name")]
        if not labels:
            return ""
        text = ", ".join(labels)
        paid = sum(
            Decimal(str(e.get("price") or 0))
            for e in entries
            if Decimal(str(e.get("price") or 0)) > 0
        )
        if paid > 0:
            paid_f = float(paid)
            suffix = str(int(paid_f)) if paid_f == int(paid_f) else str(paid).replace(".", ",")
            text = f"{text} (+{suffix})"
        return text
    raw = item.get("modifiers") or item.get("modifier_names")
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw.strip()
    if not isinstance(raw, list):
        return str(raw).strip()
    labels = []
    for entry in raw:
        if isinstance(entry, dict):
            label = entry.get("modifier_name") or entry.get("name") or ""
            label = str(label).strip()
        else:
            label = str(entry).strip()
        if label:
            labels.append(label)
    return ", ".join(labels)


def _normalize_modifier_entries(item: dict) -> list[dict]:
    """Kalem seçeneklerini {name, price} listesine çevirir."""
    if not isinstance(item, dict):
        return []
    raw_entries = item.get("modifier_entries")
    if isinstance(raw_entries, list) and raw_entries:
        out = []
        for entry in raw_entries:
            if not isinstance(entry, dict):
                continue
            name = str(entry.get("name") or entry.get("modifier_name") or "").strip()
            if not name:
                continue
            try:
                price = float(entry.get("price") or 0)
            except (TypeError, ValueError):
                price = 0.0
            out.append({"name": name, "price": price})
        if out:
            return out
    mods = item.get("modifiers")
    if isinstance(mods, list):
        out = []
        for entry in mods:
            if not isinstance(entry, dict):
                continue
            name = str(entry.get("modifier_name") or entry.get("name") or "").strip()
            if not name:
                continue
            try:
                price = float(entry.get("price") or 0)
            except (TypeError, ValueError):
                price = 0.0
            out.append({"name": name, "price": price})
        if out:
            return out
    names = item.get("modifier_names")
    if isinstance(names, list):
        return [{"name": str(n).strip(), "price": 0.0} for n in names if str(n).strip()]
    return []


def _item_unit_modifier_sum(item: dict) -> Decimal:
    if item.get("modifier_total") is not None:
        return _parse_item_decimal(item, "modifier_total")
    total = Decimal("0")
    for entry in _normalize_modifier_entries(item):
        total += Decimal(str(entry.get("price") or 0))
    return total


def _item_paid_modifier_total(item: dict) -> Decimal:
    total = Decimal("0")
    for entry in _normalize_modifier_entries(item):
        price = Decimal(str(entry.get("price") or 0))
        if price > 0:
            total += price
    return total


def _column_uses_with_options(col: dict) -> bool:
    fmt = col.get("format", "")
    field = str(col.get("field", ""))
    return fmt == "with_options" or "| with_options" in field or "|with_options" in field


_TAX_RATE_FILTER_TOKENS = ("with_tax_rates", "with_tax_rate")


def _column_uses_with_tax_rates(col: dict) -> bool:
    fmt = col.get("format", "")
    field = str(col.get("field", ""))
    if fmt in _TAX_RATE_FILTER_TOKENS:
        return True
    return any(f"| {t}" in field or f"|{t}" in field for t in _TAX_RATE_FILTER_TOKENS)


def _layout_uses_with_tax_rates(layout: list) -> bool:
    if not isinstance(layout, list):
        return False
    for block in layout:
        if not isinstance(block, dict) or block.get("type") != "item_loop":
            continue
        for col in block.get("columns", []):
            if isinstance(col, dict) and _column_uses_with_tax_rates(col):
                return True
    return False


def _item_loop_uses_with_tax_rates(block: dict) -> bool:
    for col in block.get("columns", []):
        if isinstance(col, dict) and _column_uses_with_tax_rates(col):
            return True
    return False


def _parse_item_decimal(item: dict, key: str, default: Decimal | None = None) -> Decimal:
    raw = item.get(key, default)
    if raw is None:
        return default if default is not None else Decimal("0")
    try:
        return Decimal(str(raw))
    except (InvalidOperation, ValueError, TypeError):
        return default if default is not None else Decimal("0")


def _item_qty(item: dict) -> Decimal:
    qty = _parse_item_decimal(item, "qty", Decimal("1"))
    return qty if qty > 0 else Decimal("1")


def _item_tax_rate(item: dict) -> Decimal:
    return _parse_item_decimal(item, "tax_rate", Decimal("0"))


def _item_line_net(item: dict) -> Decimal:
    if item.get("line_net") is not None:
        return _parse_item_decimal(item, "line_net")
    if item.get("total") is not None and _item_unit_modifier_sum(item) <= 0:
        return _parse_item_decimal(item, "total")
    price = _parse_item_decimal(item, "price")
    mod_sum = _item_unit_modifier_sum(item)
    return ((price + mod_sum) * _item_qty(item)).quantize(Decimal("0.01"))


def _item_product_line_gross(item: dict) -> Decimal:
    """Yalnızca ürün birim fiyatından brüt satır tutarı (seçenek ücreti hariç)."""
    price = _parse_item_decimal(item, "price")
    net = (price * _item_qty(item)).quantize(Decimal("0.01"))
    rate = _item_tax_rate(item)
    if rate <= 0:
        return net
    denom = Decimal("1") + (rate / Decimal("100"))
    if denom <= 0:
        return net
    return (net / denom).quantize(Decimal("0.01"))


def _item_line_gross(item: dict) -> Decimal:
    if item.get("line_gross") is not None:
        return _parse_item_decimal(item, "line_gross")
    net = _item_line_net(item)
    rate = _item_tax_rate(item)
    if rate <= 0:
        return net
    denom = Decimal("1") + (rate / Decimal("100"))
    if denom <= 0:
        return net
    return (net / denom).quantize(Decimal("0.01"))


def _item_line_tax(item: dict) -> Decimal:
    if item.get("line_tax") is not None:
        return _parse_item_decimal(item, "line_tax")
    return (_item_line_net(item) - _item_line_gross(item)).quantize(Decimal("0.01"))


def _ensure_item_tax_fields(items: list) -> None:
    for item in items:
        if not isinstance(item, dict):
            continue
        net = _item_line_net(item)
        gross = _item_line_gross(item)
        tax = _item_line_tax(item)
        item["line_net"] = float(net)
        item["line_gross"] = float(gross)
        item["line_tax"] = float(tax)


def _sum_items_tax(items: list) -> Decimal:
    total = Decimal("0")
    for item in items:
        if isinstance(item, dict):
            total += _item_line_tax(item)
    return total.quantize(Decimal("0.01"))


def _sum_items_gross(items: list) -> Decimal:
    total = Decimal("0")
    for item in items:
        if isinstance(item, dict):
            total += _item_line_gross(item)
    return total.quantize(Decimal("0.01"))


def _sum_items_net(items: list) -> Decimal:
    total = Decimal("0")
    for item in items:
        if isinstance(item, dict):
            total += _item_line_net(item)
    return total.quantize(Decimal("0.01"))


def _format_tax_rate_label(rate: Decimal) -> str:
    normalized = rate.normalize()
    if normalized == normalized.to_integral_value():
        return str(int(normalized))
    return str(normalized).replace(".", ",")


def _format_item_tax_line(rate: Decimal, tax_amount: Decimal, width: int) -> str:
    left = f"  % {_format_tax_rate_label(rate)}"
    right = _fmt_currency(tax_amount)
    gap = width - len(left) - len(right)
    if gap < 1:
        gap = 1
    return turkish_to_escpos(left + " " * gap + right)


def _item_currency_column_value(
    item: dict,
    field: str,
    uses_tax_rates_mode: bool,
    *,
    product_only_gross: bool = False,
) -> Decimal | None:
    field_l = field.strip().lower()
    if field_l == "price":
        qty = _item_qty(item)
        if uses_tax_rates_mode and product_only_gross:
            line = _item_product_line_gross(item)
        elif uses_tax_rates_mode:
            line = _item_line_gross(item)
        else:
            line = _item_line_net(item)
        return (line / qty).quantize(Decimal("0.01")) if qty else line
    if field_l in ("total", "line_total"):
        return _item_line_gross(item) if uses_tax_rates_mode else _item_line_net(item)
    return None


def _item_display_name(item: dict) -> str:
    """Fiş bağlamındaki kalem için görünen ürün adı."""
    for key in ("name", "product_name", "product"):
        raw = item.get(key)
        if raw is None:
            continue
        if isinstance(raw, dict):
            raw = raw.get("name") or raw.get("product_name")
        label = str(raw).strip() if raw is not None else ""
        if label:
            return label
    return ""


def _compile_descriptions_from_items(items) -> str:
    """Kalem notlarını «ürün adı : not, …» biçiminde birleştirir."""
    descs = []
    if not isinstance(items, list):
        return ""
    for item in items:
        if not isinstance(item, dict):
            continue
        note = item.get("description") or item.get("notes") or item.get("note")
        if not note or not str(note).strip():
            continue
        note = str(note).strip()
        label = _item_display_name(item)
        descs.append(f"{label} : {note}" if label else note)
    return ", ".join(descs)


def _compile_descriptions_from_context(ctx: dict) -> str:
    """Sipariş genel notu + kalem notlarını fiş şablonu {{ descriptions }} için birleştirir."""
    parts = []
    order_note = ctx.get("notes") or ctx.get("order_notes") or ""
    order_note = str(order_note).strip() if order_note else ""
    if order_note:
        parts.append(order_note)
    item_part = _compile_descriptions_from_items(ctx.get("items", []))
    if item_part:
        parts.append(item_part)
    return ", ".join(parts)


def _kitchen_station_id_from_context(context: dict):
    raw = context.get("kitchen_station_id")
    if raw in (None, ""):
        return None
    return str(raw)


def _order_items_for_print(order, kitchen_station_id=None):
    """KDS ile uyumlu: istasyon fişinde yalnız o istasyon + ortak (station NULL) kalemler."""
    from django.db.models import Q

    qs = order.items.filter(is_active=True, parent_item__isnull=True)
    if kitchen_station_id:
        qs = qs.filter(Q(station_id=kitchen_station_id) | Q(station_id__isnull=True))
    return qs


def _order_item_row(oi) -> dict:
    row = {
        "name": oi.product.name if oi.product_id else "",
        "qty": oi.quantity,
        "price": oi.unit_price,
        "unit": oi.unit_name or "",
    }
    if oi.product_id and oi.product is not None:
        row["tax_rate"] = float(oi.product.tax_rate or 0)
    note = (oi.notes or "").strip()
    if note:
        row["notes"] = note
    mod_entries = []
    cache = getattr(oi, '_prefetched_objects_cache', None)
    if cache and 'modifiers' in cache:
        mods = [m for m in cache['modifiers'] if m.is_active]
    else:
        mods = oi.modifiers.filter(is_active=True)
    for m in mods:
        if not m.modifier_id or not getattr(m.modifier, "name", None):
            continue
        mod_entries.append(
            {
                "name": m.modifier.name,
                "price": float(m.price or 0),
            }
        )
    if mod_entries:
        row["modifier_entries"] = mod_entries
        row["modifier_names"] = [e["name"] for e in mod_entries]
        row["modifiers"] = mod_entries
    return row


def _sum_receipt_line_items(items: list) -> Decimal:
    total = Decimal("0")
    for row in items:
        total += Decimal(str(row.get("price", 0))) * Decimal(str(row.get("qty", 0)))
    return total


def _branch_fields_from_model(branch) -> dict:
    """Branch model → fiş context alanları."""
    logo_url = ""
    if branch.logo:
        try:
            logo_url = branch.logo.url
        except Exception:  # noqa: BLE001
            logo_url = ""
    return {
        "branch_id": str(branch.id),
        "branch_name": branch.name or "",
        "branch_address": branch.address or "",
        "branch_phone": branch.phone or "",
        "branch_email": branch.email or "",
        "branch_website": branch.website or "",
        "branch_tax_office": branch.tax_office or "",
        "branch_tax_number": branch.tax_number or "",
        "branch_registry_no": branch.registry_no or "",
        "branch_mersis_no": branch.mersis_no or "",
        "branch_logo_url": logo_url,
    }


def _resolve_branch_id_for_print(context: dict, fallback_branch_id=None) -> str | None:
    if context.get("branch_id"):
        return str(context["branch_id"])
    if fallback_branch_id:
        return str(fallback_branch_id)
    order_id = context.get("order_id")
    if order_id:
        from apps.orders.models import Order

        bid = (
            Order.objects.filter(pk=order_id, is_active=True)
            .values_list("branch_id", flat=True)
            .first()
        )
        if bid:
            return str(bid)
    return None


def enrich_print_context_from_branch(
    context: dict,
    *,
    fallback_branch_id=None,
) -> dict:
    """Şube logosu / branch_info blokları için eksik context alanlarını DB'den doldurur."""
    branch_id = _resolve_branch_id_for_print(context, fallback_branch_id)
    if not branch_id:
        return context

    from apps.branches.models import Branch

    branch = Branch.objects.filter(pk=branch_id, is_active=True).first()
    if not branch:
        return context

    ctx = dict(context)
    for key, value in _branch_fields_from_model(branch).items():
        if key == "branch_id":
            ctx[key] = value
            continue
        existing = ctx.get(key)
        if existing is None or existing == "":
            ctx[key] = value
    return ctx


def enrich_print_context_from_order(context: dict) -> dict:
    """order_id varsa kalemleri ve notları DB'den yükler; istemci context'i eksik olsa bile fiş doğru basılır.

    ``kitchen_station_id`` gönderilmişse (mutfak fişi) KDS ile aynı kapsam: yalnız o istasyon
    kalemleri + istasyonu belirtilmemiş ortak kalemler.
    """
    order_id = context.get("order_id")
    if not order_id:
        return context

    from apps.orders.models import Order

    order = (
        Order.objects.filter(pk=order_id, is_active=True)
        .select_related("customer", "sale")
        .prefetch_related("items__product", "items__modifiers__modifier")
        .first()
    )
    if not order:
        return context

    ctx = dict(context)
    if order.branch_id and not ctx.get("branch_id"):
        ctx["branch_id"] = str(order.branch_id)
    if not ctx.get("order_number"):
        ctx["order_number"] = order.order_number or str(order.id)
    if ctx.get("customer_name") in (None, "") and order.customer_id:
        ctx["customer_name"] = order.customer.name
    if ctx.get("sale_id") in (None, ""):
        try:
            sale = order.sale
        except ObjectDoesNotExist:
            sale = None
        if sale is not None:
            ctx["sale_id"] = str(sale.id)
    if ctx.get("notes") in (None, "") and order.notes:
        ctx["notes"] = order.notes

    kitchen_station_id = _kitchen_station_id_from_context(ctx)
    if kitchen_station_id and not ctx.get("station_name"):
        from apps.branches.models import KitchenStation

        station = (
            KitchenStation.objects.filter(pk=kitchen_station_id, is_active=True)
            .only("name")
            .first()
        )
        if station:
            ctx["station_name"] = station.name

    items = [
        _order_item_row(oi)
        for oi in _order_items_for_print(order, kitchen_station_id)
    ]
    if items:
        ctx["items"] = items
        subtotal = _sum_receipt_line_items(items)
        ctx["subtotal"] = subtotal
        ctx["total"] = subtotal
    return ctx


def _apply_payment_context_from_payments(ctx: dict) -> None:
    """Bölünmüş ödemede payment_type ile payments uyumunu sağlar."""
    payments = ctx.get("payments")
    if not isinstance(payments, list) or not payments:
        return
    summ = _payment_type_from_payments(payments)
    if not summ:
        return
    if len(payments) > 1:
        ctx["payment_type"] = summ
        ctx["payment_method"] = summ
        return
    pm, pt = ctx.get("payment_method"), ctx.get("payment_type")
    if (pm is None or pm == "") and (pt is None or pt == ""):
        ctx["payment_type"] = summ
        ctx["payment_method"] = summ


def _paper_pixel_width(paper_width_chars: int) -> int:
    """Kağıt genişliği (karakter) → termal baskı piksel genişliği (203 DPI)."""
    if paper_width_chars >= 48:
        return 576  # 80mm
    return 384  # 58mm


def _flatten_logo_for_thermal(img):
    """PNG şeffaflığını beyaz zemin üzerine birleştirir (1-bit dönüşümde siyah leke olmasın)."""
    from PIL import Image

    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        background.alpha_composite(rgba)
        return background.convert("RGB")
    return img.convert("RGB")


def _logo_to_escpos_bitmap(img, target_width: int):
    """RGB logoyu hedef genişliğe ölçekleyip termal yazıcı için 1-bit'e çevirir."""
    from PIL import Image

    target_width = max(1, int(target_width))
    ratio = target_width / img.width
    target_height = max(1, int(img.height * ratio))
    img = img.resize((target_width, target_height), Image.LANCZOS)
    gray = img.convert("L")
    return gray.convert("1", dither=Image.Dither.FLOYDSTEINBERG)


def _align_logo_on_paper(logo_bit, paper_pixels: int, align: str):
    """Logoyu kağıt genişliğinde beyaz tuval üzerine hizalar (PIL mode 1: 1=beyaz)."""
    from PIL import Image

    paper_pixels = max(logo_bit.width, int(paper_pixels))
    canvas = Image.new("1", (paper_pixels, logo_bit.height), 1)
    if align == "center":
        x = max(0, (paper_pixels - logo_bit.width) // 2)
    elif align == "right":
        x = max(0, paper_pixels - logo_bit.width)
    else:
        x = 0
    canvas.paste(logo_bit, (x, 0))
    return canvas


# ── Ana Renderer Sınıfı ───────────────────────────────────────────────────────

class ReceiptRenderer:
    """
    layout_json bloklarını:
      - render_to_text()   → monospace metin (frontend önizleme)
      - render_to_escpos() → fiziksel ESC/POS yazıcıya çıktı
    """

    def __init__(self, paper_width: int = 48):
        self.width = paper_width

    # ── Public API ────────────────────────────────────────────────────────────

    def _prepare_context(self, context: dict, layout: list | None = None) -> dict:
        """Context'e date, time gibi otomatik alanlar ekler."""
        ctx = context.copy()

        # Ödeme tipi: şablonda payment_type ve payment_method eş anlamlı (Türkçe etiket string beklenir)
        pm = ctx.get("payment_method")
        pt = ctx.get("payment_type")
        if pm is not None and pm != "" and (pt is None or pt == ""):
            ctx["payment_type"] = pm
        if pt is not None and pt != "" and (pm is None or pm == ""):
            ctx["payment_method"] = pt

        _apply_payment_context_from_payments(ctx)
        
        # created_at varsa ondan, yoksa şimdiki zamandan date/time üret
        from django.utils import timezone
        import datetime
        
        now = timezone.localtime()
        ca = ctx.get("created_at")
        
        if ca:
            try:
                if isinstance(ca, str):
                    # ISO formatını veya ortak formatları dene
                    dt = datetime.datetime.fromisoformat(ca.replace("Z", "+00:00"))
                    now = timezone.localtime(dt)
            except Exception:
                logger.warning("created_at tarih parse hatası (value=%s)", ca)

        if "date" not in ctx:
            ctx["date"] = now.strftime("%d.%m.%Y")
        if "time" not in ctx:
            ctx["time"] = now.strftime("%H:%M")

        ctx["descriptions"] = _compile_descriptions_from_context(ctx)

        if layout and _layout_uses_with_tax_rates(layout):
            ctx["_receipt_uses_with_tax_rates"] = True
            items = ctx.get("items", [])
            if isinstance(items, list):
                _ensure_item_tax_fields(items)
                gross_total = _sum_items_gross(items)
                net_total = _sum_items_net(items)
                tax_total = _sum_items_tax(items)
                ctx["_receipt_items_tax_total"] = float(tax_total)
                ctx["subtotal"] = float(gross_total)
                if ctx.get("tax") in (None, "", 0, 0.0, "0", "0.0", "0,00"):
                    ctx["tax"] = float(tax_total)
                try:
                    discount = Decimal(str(ctx.get("discount") or 0))
                except (InvalidOperation, ValueError, TypeError):
                    discount = Decimal("0")
                ctx["total"] = float((net_total - discount).quantize(Decimal("0.01")))

        return ctx

    def render_to_text(self, layout: list, context: dict) -> str:
        """Blok listesini monospace metin olarak döner (frontend önizleme)."""
        ctx = self._prepare_context(context, layout)
        lines = []
        for block in layout:
            if self._should_skip(block, ctx):
                continue
            lines.extend(self._block_to_lines(block, ctx))
        return "\n".join(lines)

    def render_to_escpos(self, layout: list, context: dict, device):
        """
        Blok listesini python-escpos device'ına doğrudan yazar.
        :param device: escpos.printer.Network | Usb | Dummy instance
        """
        ctx = self._prepare_context(context, layout)
        had_cut = False
        for block in layout:
            if self._should_skip(block, ctx):
                continue
            if block.get("type") == "cut":
                had_cut = True
            self._block_to_escpos(block, ctx, device)
        if not had_cut:
            device.text("\n\n")

    def _should_skip(self, block: dict, ctx: dict) -> bool:
        """Eğer hide_if_empty True ise ve içindeki tüm değişkenler 0/boş ise True döner."""
        if not block.get("hide_if_empty"):
            return False

        combined = f"{block.get('content', '')} {block.get('left', '')} {block.get('right', '')} {block.get('data', '')}"
        variables = re.findall(r"\{\{\s*(.+?)\s*\}\}", combined)

        if not variables:
            return False

        for var_expr in variables:
            key = var_expr.split("|")[0].strip()
            value = ctx
            for k in key.split("."):
                if isinstance(value, dict):
                    value = value.get(k, 0)
                else:
                    value = getattr(value, k, 0)
                if value == "":
                    break
            
            # Değer 0 veya boş değilse gizleme
            try:
                if float(value) != 0:
                    return False
            except (ValueError, TypeError):
                if value:
                    return False
        
        return True

    # ── Text Renderer (önizleme) ──────────────────────────────────────────────

    def _block_to_lines(self, block: dict, ctx: dict) -> list[str]:
        btype = block.get("type", "text")

        if btype == "text":
            return self._text_lines(block, ctx)

        elif btype == "divider":
            char = block.get("char", "-")
            return [char * self.width]

        elif btype == "key_value":
            return self._key_value_lines(block, ctx)

        elif btype == "item_loop":
            return self._item_loop_lines(block, ctx)

        elif btype == "feed":
            n = int(block.get("lines", 1))
            return [""] * n

        elif btype == "cut":
            return ["-" * self.width, ""]

        elif btype == "qr":
            data = _resolve(block.get("data", ""), ctx)
            return [f"[QR: {data}]"]

        elif btype == "branch_logo":
            return ["[Şube Logosu]"]

        elif btype == "branch_info":
            return self._branch_info_lines(block, ctx)

        elif btype == "date":
            content = ctx.get("date", "")
            return self._format_text_lines(content, block.get("align", "left"), block.get("size", "normal"))

        elif btype == "time":
            content = ctx.get("time", "")
            return self._format_text_lines(content, block.get("align", "left"), block.get("size", "normal"))

        else:
            logger.warning(f"ReceiptRenderer: bilinmeyen blok tipi '{btype}'")
            return []

    def _text_lines(self, block: dict, ctx: dict) -> list[str]:
        content = _resolve(block.get("content", ""), ctx)
        ml, mr = self._normalize_margins(block.get("margin_left", 0), block.get("margin_right", 0))
        align = block.get("align", "left")
        size = block.get("size", "normal")
        inner = self._effective_inner_width(size, ml, mr)
        lines: list[str] = []
        for paragraph in content.splitlines() or [""]:
            for wrapped in self._wrap_paragraph(paragraph, inner):
                lines.append(self._layout_text_line(wrapped, align, size, ml, mr))
        if not lines:
            lines = [self._layout_text_line("", align, size, ml, mr)]
        return lines

    def _normalize_margins(self, margin_left, margin_right) -> tuple[int, int]:
        ml = max(0, int(margin_left or 0))
        mr = max(0, int(margin_right or 0))
        if ml + mr >= self.width:
            ml = min(ml, self.width - 1)
            mr = max(0, self.width - ml - 1)
        return ml, mr

    @staticmethod
    def _size_multiplier(size: str) -> int:
        if size == "double":
            return 2
        if size == "triple":
            return 3
        if size == "quadruple":
            return 4
        return 1

    def _effective_inner_width(self, size: str, margin_left: int, margin_right: int) -> int:
        mult = self._size_multiplier(size)
        eff_width = self.width // mult
        eff_ml = margin_left // mult
        eff_mr = margin_right // mult
        return max(1, eff_width - eff_ml - eff_mr)

    @staticmethod
    def _wrap_paragraph(text: str, inner: int) -> list[str]:
        """Uzun metni (ör. virgülle birleşmiş descriptions) kesmeden satırlara böler."""
        if not text:
            return [""]
        lines: list[str] = []
        remaining = text
        while remaining:
            if len(remaining) <= inner:
                lines.append(remaining)
                break
            chunk = remaining[:inner]
            break_at = chunk.rfind(" ")
            if break_at <= 0 or break_at < inner // 3:
                lines.append(chunk)
                remaining = remaining[inner:]
            else:
                lines.append(remaining[:break_at])
                remaining = remaining[break_at:].lstrip()
        return lines

    def _layout_text_line(self, content: str, align: str, size: str, margin_left: int, margin_right: int) -> str:
        """Tek satır: sol/sağ boşluk + içeride hizalı metin (toplam genişlik paper_width)."""
        mult = self._size_multiplier(size)
        eff_width = self.width // mult
        eff_margin_left = margin_left // mult
        eff_margin_right = margin_right // mult
        
        if size != "normal":
            content = content.upper()
            
        inner = max(1, eff_width - eff_margin_left - eff_margin_right)
        if len(content) > inner:
            content = content[:inner]
        if align == "center":
            mid = content.center(inner)
        elif align == "right":
            mid = content.rjust(inner)
        else:
            mid = content.ljust(inner)
        return (" " * eff_margin_left) + mid + (" " * eff_margin_right)

    def _format_text_lines(self, content: str, align: str, size: str) -> list[str]:
        return [self._layout_text_line(content, align, size, 0, 0)]

    def _key_value_lines(self, block: dict, ctx: dict) -> list[str]:
        left = _resolve(block.get("left", ""), ctx)
        right = _resolve(block.get("right", ""), ctx)
        
        # Eğer sağ taraf çok satırlıysa (bölünmüş ödeme gibi)
        right_lines = right.splitlines()
        if not right_lines:
            right_lines = [""]
            
        lines = []
        # İlk satır: sol etiket + sağ değerin ilk satırı
        first_right = right_lines[0]
        gap = self.width - len(left) - len(first_right)
        if gap < 1:
            gap = 1
        lines.append(left + " " * gap + first_right)
        
        # Diğer satırlar: sadece sağ değer (sağa dayalı)
        for i in range(1, len(right_lines)):
            lines.append(right_lines[i].rjust(self.width))
            
        return lines

    def _item_loop_lines(self, block: dict, ctx: dict) -> list[str]:
        variable = block.get("variable", "items")
        items = ctx.get(variable, [])
        columns = block.get("columns", [
            {"field": "name", "width": self.width - 18, "align": "left"},
            {"field": "qty",  "width": 5,  "align": "right"},
            {"field": "price","width": 12, "align": "right", "format": "currency"},
        ])
        lines = []
        uses_tax_rates_mode = _item_loop_uses_with_tax_rates(block)
        for item in items:
            item_ctx = item if isinstance(item, dict) else {}
            if uses_tax_rates_mode and isinstance(item, dict):
                _ensure_item_tax_fields([item_ctx])
            product_only_gross = (
                uses_tax_rates_mode
                and isinstance(item, dict)
                and _item_paid_modifier_total(item_ctx) > 0
            )
            row = ""
            append_options_line = False
            append_tax_line = False
            for col in columns:
                field = str(col.get("field", ""))
                amount_override = None
                uses_with_options = _column_uses_with_options(col)
                uses_with_tax_rates = _column_uses_with_tax_rates(col)
                if uses_with_options or uses_with_tax_rates:
                    value = _item_display_name(item_ctx)
                    if uses_with_options:
                        append_options_line = True
                    if uses_with_tax_rates:
                        append_tax_line = True
                elif "{{" in field:
                    value = _resolve(field, item_ctx)
                else:
                    amount_override = (
                        _item_currency_column_value(
                            item_ctx,
                            field,
                            uses_tax_rates_mode,
                            product_only_gross=product_only_gross,
                        )
                        if isinstance(item, dict)
                        else None
                    )
                    if amount_override is not None:
                        value = amount_override
                    elif isinstance(item, dict):
                        value = item_ctx.get(field, "")
                    else:
                        value = getattr(item, field, "")
                fmt = col.get("format", "")
                if fmt == "currency":
                    if amount_override is None and isinstance(item, dict):
                        amount_override = _item_currency_column_value(
                            item_ctx,
                            field,
                            uses_tax_rates_mode,
                            product_only_gross=product_only_gross,
                        )
                    if amount_override is not None:
                        value = _fmt_currency(amount_override)
                    else:
                        value = _fmt_currency(value)
                elif fmt == "qty":
                    value = _fmt_qty(value)
                elif not uses_with_options:
                    value = turkish_to_escpos(str(value)) if value is not None else ""
                else:
                    value = turkish_to_escpos(str(value)) if value is not None else ""

                # Prefix & Suffix desteği
                prefix = col.get("prefix", "")
                suffix = col.get("suffix", "")
                value = f"{prefix}{value}{suffix}"

                w = col.get("width", 10)
                al = col.get("align", "left")
                if al == "right":
                    value = value.rjust(w)
                elif al == "center":
                    value = value.center(w)
                else:
                    value = value.ljust(w)
                row += value
            lines.append(row.rstrip())
            if append_options_line:
                mod_text = _item_modifier_text(item_ctx)
                if mod_text:
                    lines.append("* " + turkish_to_escpos(mod_text))
            if append_tax_line:
                rate = _item_tax_rate(item_ctx)
                tax_amt = _item_line_tax(item_ctx)
                if rate > 0 and tax_amt > 0:
                    lines.append(_format_item_tax_line(rate, tax_amt, self.width))
        return lines

    # ── ESC/POS Device Renderer ───────────────────────────────────────────────

    @staticmethod
    def _escpos_line(line: str) -> str:
        """Türkçe karakterler bazı yazıcılarda ESC/POS kaçışına dönüşebilir; ASCII'ye çevir."""
        return turkish_to_escpos(line)

    def _block_to_escpos(self, block: dict, ctx: dict, device):
        btype = block.get("type", "text")

        if btype == "text":
            bold = _coerce_bool(block.get("bold"), False)
            size = block.get("size", "normal")
            width_mult = self._size_multiplier(size)
            device.set(align="left", bold=bold, width=width_mult, height=width_mult)
            for line in self._text_lines(block, ctx):
                device.text(self._escpos_line(line) + "\n")

        elif btype == "divider":
            char = block.get("char", "-")
            device.set(align="left", bold=False, width=1, height=1)
            device.text(char * self.width + "\n")

        elif btype == "key_value":
            lines = self._key_value_lines(block, ctx)
            bold = _coerce_bool(block.get("bold"), False)
            device.set(align="left", bold=bold, width=1, height=1)
            for line in lines:
                device.text(self._escpos_line(line) + "\n")

        elif btype == "item_loop":
            device.set(align="left", bold=False, width=1, height=1)
            for line in self._item_loop_lines(block, ctx):
                device.text(self._escpos_line(line) + "\n")

        elif btype == "feed":
            n = int(block.get("lines", 1))
            device.text("\n" * n)

        elif btype == "cut":
            device.cut()

        elif btype == "qr":
            data = _resolve(block.get("data", ""), ctx)
            if data:
                try:
                    device.qr(data, size=6)
                except Exception as e:
                    logger.warning(f"QR kod yazdırılamadı: {e}")

        elif btype == "branch_logo":
            hide_empty = _coerce_bool(block.get("hide_if_empty"), True)
            if hide_empty and not self._branch_logo_available(block, ctx):
                return
            try:
                self._print_branch_logo_escpos(block, ctx, device)
            except Exception as e:
                logger.warning(f"Şube logosu yazdırılamadı: {e}")

        elif btype == "branch_info":
            lines = self._branch_info_lines(block, ctx)
            bold = _coerce_bool(block.get("bold"), False)
            size = block.get("size", "normal")
            width_mult = self._size_multiplier(size)
            device.set(align="left", bold=bold, width=width_mult, height=width_mult)
            for line in lines:
                device.text(self._escpos_line(line) + "\n")

        elif btype == "date":
            content = ctx.get("date", "")
            align = _coerce_align(block.get("align"), "left")
            bold = _coerce_bool(block.get("bold"), False)
            size = block.get("size", "normal")
            
            width_mult = 1
            height_mult = 1
            if size == "double": width_mult = 2; height_mult = 2
            elif size == "triple": width_mult = 3; height_mult = 3
            elif size == "quadruple": width_mult = 4; height_mult = 4
            
            device.set(align=align, bold=bold, width=width_mult, height=height_mult)
            device.text(self._escpos_line(content) + "\n")

        elif btype == "time":
            content = ctx.get("time", "")
            align = _coerce_align(block.get("align"), "left")
            bold = _coerce_bool(block.get("bold"), False)
            size = block.get("size", "normal")
            
            width_mult = 1
            height_mult = 1
            if size == "double": width_mult = 2; height_mult = 2
            elif size == "triple": width_mult = 3; height_mult = 3
            elif size == "quadruple": width_mult = 4; height_mult = 4
            
            device.set(align=align, bold=bold, width=width_mult, height=height_mult)
            device.text(self._escpos_line(content) + "\n")

        else:
            logger.warning(f"ReceiptRenderer (escpos): bilinmeyen blok tipi '{btype}'")

    def _branch_logo_available(self, block: dict, ctx: dict) -> bool:
        branch_id = block.get("branch_id") or ctx.get("branch_id")
        if branch_id:
            from apps.branches.models import Branch

            branch = Branch.objects.filter(pk=branch_id, is_active=True).only("logo").first()
            return bool(branch and branch.logo)
        return bool(ctx.get("branch_logo_url"))

    def _resolve_branch_logo_path(self, block: dict, ctx: dict) -> str | None:
        import os

        from django.conf import settings

        branch_id = block.get("branch_id") or ctx.get("branch_id")
        if branch_id:
            from apps.branches.models import Branch

            branch = Branch.objects.filter(pk=branch_id, is_active=True).first()
            if branch and branch.logo:
                candidate = branch.logo.path
                if os.path.isfile(candidate):
                    return candidate

        logo_url = ctx.get("branch_logo_url", "")
        if not logo_url:
            return None

        media_root = getattr(settings, "MEDIA_ROOT", "")
        if logo_url.startswith("/media/"):
            rel_path = logo_url[len("/media/"):]
        elif logo_url.startswith("media/"):
            rel_path = logo_url[len("media/"):]
        else:
            rel_path = logo_url.lstrip("/")

        logo_path = os.path.join(media_root, rel_path)
        if os.path.isfile(logo_path):
            return logo_path
        logger.warning(f"Şube logosu bulunamadı: {logo_path}")
        return None

    def _print_branch_logo_escpos(self, block: dict, ctx: dict, device):
        """Şube logosunu ESC/POS yazıcıya basar."""
        from PIL import Image

        logo_path = self._resolve_branch_logo_path(block, ctx)
        if not logo_path:
            return

        try:
            img = Image.open(logo_path)
        except Exception as e:
            logger.warning(f"Şube logosu açılamadı: {e}")
            return

        target_width = max(64, min(1024, int(block.get("width_px", 384) or 384)))
        align = _coerce_align(block.get("align"), "center")
        paper_pixels = _paper_pixel_width(self.width)

        try:
            img = _flatten_logo_for_thermal(img)
            img = _logo_to_escpos_bitmap(img, target_width)
            if img.width > paper_pixels:
                ratio = paper_pixels / img.width
                new_h = max(1, int(img.height * ratio))
                img = img.resize((paper_pixels, new_h), Image.LANCZOS)
            img = _align_logo_on_paper(img, paper_pixels, align)
            device.image(
                img,
                high_density_vertical=True,
                high_density_horizontal=True,
                impl="bitImageRaster",
                fragment_height=960,
                center=False,
            )
        except Exception as e:
            logger.warning(f"Logo ESC/POS yazdırma hatası: {e}")

    # ── Branch info label mapping ──────────────────────────────────────────────

    BRANCH_FIELD_LABELS = {
        "name": "Şube",
        "phone": "Tel",
        "email": "E-posta",
        "website": "Web",
        "address": "Adres",
        "tax_office": "Vergi Dairesi",
        "tax_number": "Vergi No",
        "registry_no": "Sicil No",
        "mersis_no": "Mersis No",
    }
    # Bu alanlar fişte yalnızca değer olarak basılır (etiket yok)
    BRANCH_FIELDS_VALUE_ONLY = frozenset({"name", "phone", "address"})
    BRANCH_FIELDS_WRAP = frozenset({"address"})

    def _resolve_branch_context(self, block: dict, ctx: dict) -> dict:
        """block/context branch_id varsa DB'den şube bilgilerini çözümle, yoksa context'i kullan."""
        branch_id = block.get("branch_id") or ctx.get("branch_id")
        if branch_id:
            from apps.branches.models import Branch
            branch = Branch.objects.filter(pk=branch_id, is_active=True).only(
                "name", "phone", "email", "website", "address",
                "tax_office", "tax_number", "registry_no", "mersis_no",
            ).first()
            if branch:
                return {
                    "name": branch.name or "",
                    "phone": branch.phone or "",
                    "email": branch.email or "",
                    "website": branch.website or "",
                    "address": branch.address or "",
                    "tax_office": branch.tax_office or "",
                    "tax_number": branch.tax_number or "",
                    "registry_no": branch.registry_no or "",
                    "mersis_no": branch.mersis_no or "",
                }

        # Context'ten otomatik çözümle
        return {
            "name": ctx.get("branch_name", ""),
            "phone": ctx.get("branch_phone", ""),
            "email": ctx.get("branch_email", ""),
            "website": ctx.get("branch_website", ""),
            "address": ctx.get("branch_address", ""),
            "tax_office": ctx.get("branch_tax_office", ""),
            "tax_number": ctx.get("branch_tax_number", ""),
            "registry_no": ctx.get("branch_registry_no", ""),
            "mersis_no": ctx.get("branch_mersis_no", ""),
        }

    def _branch_info_lines(self, block: dict, ctx: dict) -> list[str]:
        """Şube bilgilerini satır satır döner (ad/tel/adres etiketsiz; adres sarılır)."""
        data = self._resolve_branch_context(block, ctx)
        fields = block.get("fields") or list(self.BRANCH_FIELD_LABELS.keys())
        hide_empty = _coerce_bool(block.get("hide_if_empty"), False)
        align = block.get("align", "left")
        size = block.get("size", "normal")
        inner = self._effective_inner_width(size, 0, 0)

        lines: list[str] = []
        for field_key in fields:
            value = str(data.get(field_key, "") or "").strip()
            if hide_empty and not value:
                continue
            if not value:
                continue
            if field_key in self.BRANCH_FIELDS_VALUE_ONLY:
                text = value
            else:
                label = self.BRANCH_FIELD_LABELS.get(field_key, field_key)
                text = f"{label}: {value}"
            if field_key in self.BRANCH_FIELDS_WRAP:
                for wrapped in self._wrap_paragraph(text, inner):
                    lines.append(self._layout_text_line(wrapped, align, size, 0, 0))
            else:
                lines.extend(self._format_text_lines(text, align, size))
        return lines


# ── Kategori bazlı örnek context'ler (frontend önizleme için) ─────────────────

SAMPLE_CONTEXTS = {
    "POS_RECEIPT": {
        "branch_name": "RAMIS CAFE",
        "branch_address": "Atatürk Cad. No:12",
        "branch_phone": "0212 555 1234",
        "table_name": "Masa 5",
        "waiter_name": "Ahmet",
        "order_number": "ORD-12345",
        "sale_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "items": [
            {
                "name": "Mercimek Çorbası",
                "qty": 1,
                "price": 165.00,
                "total": 165.00,
                "unit": "Az",
                "tax_rate": 10,
                "modifier_names": ["Ekstra Soslu"],
                "modifiers": "Ekstra Soslu",
            },
            {"name": "Americano", "qty": 2, "price": 50.00, "total": 100.00, "tax_rate": 20},
            {"name": "Cheesecake", "qty": 1, "price": 85.00, "total": 85.00, "tax_rate": 20},
        ],
        "subtotal": 200.00,
        "discount": 15.00,
        "tax": 0.00,
        "total": 185.00,
        "payment_method": "Nakit: 60,00 TL\nKredi Kartı: 50,00 TL\nDiğer: 75,00 TL",
        "payment_type": "Nakit: 60,00 TL\nKredi Kartı: 50,00 TL\nDiğer: 75,00 TL",
        "payments": [
            {"method": "Nakit", "amount": 60.00},
            {"method": "Kredi Kartı", "amount": 50.00},
            {"method": "Diğer", "amount": 75.00},
        ],
        "created_at": "03.05.2026",
        "customer_name": "Sedat KOCADOGAN",
    },
    "KITCHEN_TICKET": {
        "station_name": "ANA MUTFAK",
        "table_name": "Masa 5",
        "waiter_name": "Ahmet",
        "order_number": "ORD-12345",
        "created_at": "03.05.2026 13:42",
        "items": [
            {"name": "Izgara Köfte", "qty": 1, "modifiers": "İyi pişmiş", "notes": "Acısız"},
            {"name": "Çorba", "qty": 2, "modifiers": "", "notes": ""},
        ],
    },
    "WAITER_TICKET": {
        "table_name": "Masa 5",
        "waiter_name": "Ahmet",
        "order_number": "ORD-12345",
        "created_at": "03.05.2026 13:42",
        "items": [
            {"name": "Americano", "qty": 2, "price": 50.00, "total": 100.00},
            {"name": "Cheesecake", "qty": 1, "price": 85.00, "total": 85.00},
        ],
        "total": 185.00,
    },
}
