"""
Depo modülü — Global Arama konfigürasyonu.

Depolar ve satın alma siparişleri (PO numarası) ile arama yapılır.
"""

from __future__ import annotations

from django.db.models import Q

from apps.search.registry import SearchableModule, register
from apps.search.services import is_uuid_like
from core.branch_scope import (
    user_accessible_warehouse_id_strings,
    filter_queryset_by_accessible_warehouses,
    filter_warehouse_transfer_queryset,
)


def search_warehouses(query: str, user, request) -> list[dict]:
    """Depolarda ad, kod veya UUID prefix ile arama yapar."""
    from apps.warehouse.models import Warehouse

    qs = Warehouse.objects.filter(is_active=True).only("id", "name", "code", "warehouse_type")

    # Depo erişim kapsamı
    allowed_wh = user_accessible_warehouse_id_strings(user)
    if allowed_wh is not None:
        if not allowed_wh:
            return []
        qs = qs.filter(id__in=list(allowed_wh))

    if is_uuid_like(query):
        qs = qs.filter(id__istartswith=query.replace("-", ""))
    else:
        qs = qs.filter(Q(name__icontains=query) | Q(code__icontains=query))

    TYPE_LABELS = {
        "MAIN": "Ana Depo",
        "SUB": "Ara Depo",
        "COLD": "Soğuk Hava",
        "DRY": "Kuru Depo",
        "RAW": "Hammadde",
        "KITCHEN": "Mutfak Deposu",
    }

    return [
        {
            "id": str(w.id),
            "title": w.name,
            "subtitle": f"{w.code} — {TYPE_LABELS.get(w.warehouse_type, w.warehouse_type)}",
        }
        for w in qs[:7]
    ]


def search_purchase_orders(query: str, user, request) -> list[dict]:
    """Satın alma siparişlerinde no, tedarikçi adı veya UUID ile arama yapar."""
    from apps.warehouse.models import PurchaseOrder

    qs = (
        PurchaseOrder.objects.filter(is_active=True)
        .select_related("supplier", "warehouse")
        .only("id", "order_number", "status", "supplier__name", "warehouse__name")
    )

    # Depo erişim kapsamı
    allowed_wh = user_accessible_warehouse_id_strings(user)
    if allowed_wh is not None:
        if not allowed_wh:
            return []
        qs = qs.filter(warehouse_id__in=list(allowed_wh))

    if is_uuid_like(query):
        qs = qs.filter(id__istartswith=query.replace("-", ""))
    else:
        qs = qs.filter(
            Q(order_number__icontains=query) | Q(supplier__name__icontains=query)
        )

    STATUS_LABELS = {
        "DRAFT": "Taslak",
        "PENDING": "Onay Bekliyor",
        "APPROVED": "Onaylandı",
        "ORDERED": "Sipariş Verildi",
        "PARTIALLY_RECEIVED": "Kısmen Alındı",
        "RECEIVED": "Teslim Alındı",
        "CANCELLED": "İptal",
    }

    return [
        {
            "id": str(po.id),
            "title": po.order_number,
            "subtitle": f"{po.supplier.name} — {STATUS_LABELS.get(po.status, po.status)}",
        }
        for po in qs[:7]
    ]


def search_deficiency_reports(query: str, user, request) -> list[dict]:
    """Eksik listelerinde no, istasyon adı veya UUID ile arama yapar."""
    from apps.warehouse.models import DeficiencyReport

    qs = (
        DeficiencyReport.objects.filter(is_active=True)
        .select_related("kitchen_station")
        .only("id", "report_number", "status", "kitchen_station__name")
    )

    # Depo erişim kapsamı
    qs = filter_queryset_by_accessible_warehouses(qs, user, warehouse_id_field="target_warehouse_id")

    if is_uuid_like(query):
        qs = qs.filter(id__istartswith=query.replace("-", ""))
    else:
        qs = qs.filter(
            Q(report_number__icontains=query) | Q(kitchen_station__name__icontains=query)
        )

    STATUS_LABELS = {
        "DRAFT": "Taslak",
        "PENDING": "Bekliyor",
        "APPROVED": "Onaylandı",
        "ORDERED": "Sipariş Verildi",
        "PARTIALLY_COMMITTED": "Kısmen İşlendi",
        "COMMITTED": "Tamamlandı",
        "CANCELLED": "İptal",
    }

    return [
        {
            "id": str(dr.id),
            "title": dr.report_number,
            "subtitle": f"{dr.kitchen_station.name} — {STATUS_LABELS.get(dr.status, dr.status)}",
        }
        for dr in qs[:7]
    ]


def search_goods_receivings(query: str, user, request) -> list[dict]:
    """Mal kabul işlemlerinde no, tedarikçi adı, fatura no veya UUID ile arama yapar."""
    from apps.warehouse.models import GoodsReceiving

    qs = (
        GoodsReceiving.objects.filter(is_active=True)
        .select_related("supplier")
        .only("id", "receiving_number", "status", "supplier__name", "invoice_number")
    )

    # Depo erişim kapsamı
    qs = filter_queryset_by_accessible_warehouses(qs, user)

    if is_uuid_like(query):
        qs = qs.filter(id__istartswith=query.replace("-", ""))
    else:
        qs = qs.filter(
            Q(receiving_number__icontains=query)
            | Q(supplier__name__icontains=query)
            | Q(invoice_number__icontains=query)
        )

    STATUS_LABELS = {
        "PENDING": "Bekliyor",
        "INSPECTED": "Kontrol Edildi",
        "ACCEPTED": "Kabul Edildi",
        "PARTIALLY_ACCEPTED": "Kısmen Kabul",
        "REJECTED": "Reddedildi",
    }

    return [
        {
            "id": str(gr.id),
            "title": gr.receiving_number,
            "subtitle": f"{gr.supplier.name} — {STATUS_LABELS.get(gr.status, gr.status)}",
        }
        for gr in qs[:7]
    ]


def search_transfers(query: str, user, request) -> list[dict]:
    """Depo transferlerinde no veya UUID ile arama yapar."""
    from apps.warehouse.models import WarehouseTransfer

    qs = (
        WarehouseTransfer.objects.filter(is_active=True)
        .select_related("source_warehouse", "target_warehouse")
        .only("id", "transfer_number", "status", "source_warehouse__code", "target_warehouse__code")
    )

    # Depo erişim kapsamı
    qs = filter_warehouse_transfer_queryset(qs, user)

    if is_uuid_like(query):
        qs = qs.filter(id__istartswith=query.replace("-", ""))
    else:
        qs = qs.filter(transfer_number__icontains=query)

    STATUS_LABELS = {
        "DRAFT": "Taslak",
        "PENDING": "Bekliyor",
        "IN_TRANSIT": "Transferde",
        "COMPLETED": "Tamamlandı",
        "CANCELLED": "İptal",
    }

    return [
        {
            "id": str(tr.id),
            "title": tr.transfer_number,
            "subtitle": f"{tr.source_warehouse.code} → {tr.target_warehouse.code} — {STATUS_LABELS.get(tr.status, tr.status)}",
        }
        for tr in qs[:7]
    ]


def search_stock_countings(query: str, user, request) -> list[dict]:
    """Stok sayımlarında no veya UUID ile arama yapar."""
    from apps.warehouse.models import StockCounting

    qs = (
        StockCounting.objects.filter(is_active=True)
        .select_related("warehouse")
        .only("id", "counting_number", "status", "warehouse__code")
    )

    # Depo erişim kapsamı
    qs = filter_queryset_by_accessible_warehouses(qs, user)

    if is_uuid_like(query):
        qs = qs.filter(id__istartswith=query.replace("-", ""))
    else:
        qs = qs.filter(counting_number__icontains=query)

    STATUS_LABELS = {
        "DRAFT": "Taslak",
        "IN_PROGRESS": "Devam Ediyor",
        "COMPLETED": "Tamamlandı",
        "APPROVED": "Onaylandı",
    }

    return [
        {
            "id": str(sc.id),
            "title": sc.counting_number,
            "subtitle": f"{sc.warehouse.code} — {STATUS_LABELS.get(sc.status, sc.status)}",
        }
        for sc in qs[:7]
    ]


def register_search_modules() -> None:
    register(
        SearchableModule(
            key="warehouses",
            label="Depolar",
            icon="Warehouse",
            required_permissions=[
                "warehouse.view_warehouse",
                "warehouse.manage_warehouse",
            ],
            search_fn=search_warehouses,
            result_url_template="/warehouse",
            branch_scope_field=None,  # search_fn içinde user_accessible_warehouse_id_strings ile
        )
    )
    register(
        SearchableModule(
            key="purchase_orders",
            label="Satın Alma Siparişleri",
            icon="ClipboardList",
            required_permissions=[
                "warehouse.view_purchase_order",
                "warehouse.manage_purchase_order",
            ],
            search_fn=search_purchase_orders,
            result_url_template="/warehouse?tab=purchase_orders",
            branch_scope_field=None,
        )
    )
    register(
        SearchableModule(
            key="deficiency_reports",
            label="Eksik Listeleri",
            icon="AlertCircle",
            required_permissions=[
                "warehouse.view_deficiency_report",
                "warehouse.manage_deficiency_report",
            ],
            search_fn=search_deficiency_reports,
            result_url_template="/warehouse?tab=deficiency_reports",
            branch_scope_field=None,
        )
    )
    register(
        SearchableModule(
            key="goods_receivings",
            label="Mal Kabul",
            icon="PackageCheck",
            required_permissions=[
                "warehouse.view_goods_receiving",
                "warehouse.manage_goods_receiving",
            ],
            search_fn=search_goods_receivings,
            result_url_template="/warehouse?tab=goods_receiving",
            branch_scope_field=None,
        )
    )
    register(
        SearchableModule(
            key="transfers",
            label="Transferler",
            icon="ArrowLeftRight",
            required_permissions=[
                "warehouse.view_transfer",
                "warehouse.manage_transfer",
            ],
            search_fn=search_transfers,
            result_url_template="/warehouse?tab=transfers",
            branch_scope_field=None,
        )
    )
    register(
        SearchableModule(
            key="stock_countings",
            label="Stok Sayımı",
            icon="Calculator",
            required_permissions=[
                "warehouse.view_stock_counting",
                "warehouse.manage_stock_counting",
            ],
            search_fn=search_stock_countings,
            result_url_template="/warehouse?tab=stock_counting",
            branch_scope_field=None,
        )
    )
