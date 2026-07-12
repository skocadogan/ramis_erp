"""
Sipariş bazlı hammadde rezervasyon / düşüm teşhisi.

Kullanım:
  python manage.py diagnose_order_stock <order_uuid>
"""

import json
from core.decimal_constants import ZERO_QTY
from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from apps.inventory.models import StockMovement, StockReservation, StockReservationStatus
from apps.inventory.services.cart_recipe_requirements import (
    add_order_item_recipe_requirements,
    build_order_recipe_requirements,
    pos_kitchen_and_fallback_warehouse,
)
from apps.inventory.stock_minimum import ZERO_QTY
from apps.orders.models import Order, OrderStatus
from apps.warehouse.models import WarehouseStockLevel


class Command(BaseCommand):
    help = "INGREDIENT siparişi için rezervasyon, stok hareketi ve depo uyumunu raporlar."

    def add_arguments(self, parser):
        parser.add_argument("order_id", type=str, help="Sipariş UUID")
        parser.add_argument(
            "--json",
            action="store_true",
            help="Yapılandırılmış özet (geliştirici)",
        )

    def handle(self, *args, **options):
        order_id = options["order_id"]
        try:
            order = Order.objects.select_related("branch").get(pk=order_id)
        except Order.DoesNotExist as exc:
            raise CommandError(f"Sipariş bulunamadı: {order_id}") from exc

        from apps.sales.models import Sale

        sale = Sale.objects.filter(order_id=order.id).first()
        kitchen_wh, fallback_wh = pos_kitchen_and_fallback_warehouse(order.branch_id)
        expected = build_order_recipe_requirements(order)

        reservations = StockReservation.objects.filter(
            order_item__order=order
        ).select_related("stock_item", "warehouse", "order_item")
        reserved = reservations.filter(status=StockReservationStatus.RESERVED)
        committed = reservations.filter(status=StockReservationStatus.COMMITTED)

        movements = StockMovement.objects.filter(
            reference__icontains=str(order.id)
        ).select_related("warehouse", "stock_item")

        warnings: list[str] = []

        if order.stock_tracking_mode != "INGREDIENT":
            warnings.append(
                f"Sipariş modu INGREDIENT değil: {order.stock_tracking_mode!r} "
                "(rezerv/düşüm bu modda çalışmaz)."
            )
        if not expected:
            warnings.append(
                "Reçete ihtiyacı hesaplanamadı (reçete yok, depo yok veya iptal kalemler)."
            )
        if order.stock_tracking_mode == "INGREDIENT" and expected and not reservations.exists():
            warnings.append(
                "Beklenen hammadde var ama hiç StockReservation kaydı yok "
                "(sipariş PRODUCT modunda oluşmuş veya rezerv atlanmış olabilir)."
            )
        if reserved.exists() and order.status == OrderStatus.COMPLETED:
            warnings.append(
                f"Ödeme sonrası hâlâ {reserved.count()} RESERVED rezerv var; "
                "commit_reservations çalışmamış olabilir."
            )
        if order.status == OrderStatus.COMPLETED and sale and not movements.exists() and expected:
            warnings.append(
                "Sipariş tamamlanmış ve satış var ama stok OUT hareketi yok."
            )
        if sale and reserved.exists():
            warnings.append(
                "Satış kaydı varken RESERVED rezerv var; complete_table Sale-atlama "
                "senaryosu olabilir (düzeltme sonrası commit gerekir)."
            )

        if options["json"]:
            payload = {
                "order_id": str(order.id),
                "stock_tracking_mode": order.stock_tracking_mode,
                "status": order.status,
                "has_sale": bool(sale),
                "expected_requirement_keys": len(expected),
                "reservation_counts": {
                    "reserved": reserved.count(),
                    "committed": committed.count(),
                    "total": reservations.count(),
                },
                "movement_count": movements.count(),
                "warnings": warnings,
            }
            self.stdout.write(json.dumps(payload, ensure_ascii=False, default=str))
            return

        self.stdout.write(self.style.MIGRATE_HEADING(f"Sipariş {order.id}"))
        self.stdout.write(f"  Numara      : {order.order_number or '—'}")
        self.stdout.write(f"  Şube        : {order.branch_id}")
        self.stdout.write(f"  Durum       : {order.status}")
        self.stdout.write(f"  Takip modu  : {order.stock_tracking_mode}")
        self.stdout.write(f"  Satış       : {'var' if sale else 'yok'}")
        self.stdout.write(
            f"  Fallback depo: kitchen={getattr(kitchen_wh, 'name', None)} "
            f"fallback={getattr(fallback_wh, 'name', None)}"
        )
        self.stdout.write("")

        items = order.items.exclude(status=OrderStatus.CANCELLED).select_related(
            "product__recipe",
            "station__warehouse",
            "product__category__station__warehouse",
        ).prefetch_related("product__combined_items__product__recipe")

        self.stdout.write(self.style.MIGRATE_LABEL("Kalemler"))
        for oi in items:
            station_wh = (
                oi.station.warehouse.name
                if oi.station_id and oi.station.warehouse_id
                else "—"
            )
            has_recipe = bool(getattr(oi.product, "recipe", None))
            line_req: dict[tuple, Decimal] = defaultdict(lambda: ZERO_QTY)
            add_order_item_recipe_requirements(oi, line_req, fallback_wh)
            self.stdout.write(
                f"  • {oi.product.name} x{oi.quantity} "
                f"(istasyon={oi.station_id}, depo={station_wh}, reçete={'evet' if has_recipe else 'hayır'})"
            )
            for (wid, sid), qty in line_req.items():
                level = WarehouseStockLevel.objects.filter(
                    warehouse_id=wid, stock_item_id=sid, is_active=True
                ).first()
                physical = level.quantity if level else Decimal("0")
                self.stdout.write(
                    f"      → depo={wid} stok_kalemi={sid} gerekli={qty} fiziksel={physical}"
                )

        self.stdout.write("")
        self.stdout.write(
            self.style.MIGRATE_LABEL(
                f"Rezervasyonlar (RESERVED={reserved.count()}, COMMITTED={committed.count()})"
            )
        )
        for res in reservations[:50]:
            self.stdout.write(
                f"  • {res.status} wh={res.warehouse_id} item={res.stock_item.name} "
                f"qty={res.quantity} order_item={res.order_item_id}"
            )
        if reservations.count() > 50:
            self.stdout.write(f"  … (+{reservations.count() - 50} kayıt)")

        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_LABEL(f"Stok hareketleri ({movements.count()})"))
        for mov in movements[:30]:
            self.stdout.write(
                f"  • {mov.movement_type} {mov.stock_item.name} "
                f"qty={mov.quantity} wh={mov.warehouse.name} ref={mov.reference}"
            )

        self.stdout.write("")
        if warnings:
            self.stdout.write(self.style.WARNING("Uyarılar:"))
            for w in warnings:
                self.stdout.write(self.style.WARNING(f"  ! {w}"))
        else:
            self.stdout.write(self.style.SUCCESS("Kritik uyarı yok (manuel doğrulama önerilir)."))

        self.stdout.write("")
        self.stdout.write(
            "Checklist: POS modu INGREDIENT → RESERVED istasyon deposunda → "
            "ödeme sonrası COMMITTED + OUT hareketi + fiziksel miktar azalması."
        )
