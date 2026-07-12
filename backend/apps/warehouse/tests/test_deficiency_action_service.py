"""
DeficiencyActionService için regression testleri.

Bu testler özellikle şu durumları doğrular:
1. PURCHASE_PARTIAL seçildiğinde gerçekten transfer + PO oluşur
2. FULFILL_STOCK seçildiğinde sadece transfer oluşur
3. PURCHASE_ALL seçildiğinde sadece PO oluşur
4. Allocation yetersizse (aynı depodan birden fazla kalem) fark PO'ya eklenir
5. REJECT seçilen kalemler hiçbir şey oluşturmaz
"""

from decimal import Decimal

import pytest

from apps.branches.models import Branch, KitchenStation
from apps.inventory.models import StockItem, Supplier
from apps.inventory.services import InventoryService
from apps.warehouse.models import (
    DeficiencyReport,
    DeficiencyReportItem,
    DeficiencyReportStatus,
    PurchaseOrderStatus,
    Warehouse,
    WarehouseStockLevel,
    WarehouseTransfer,
    WarehouseType,
)
from apps.warehouse.services.deficiency_action_service import (
    ACTION_FULFILL_STOCK,
    ACTION_PURCHASE_ALL,
    ACTION_PURCHASE_PARTIAL,
    ACTION_REJECT,
    DeficiencyActionService,
)


@pytest.mark.django_db
class TestDeficiencyActionService:
    """DeficiencyActionService.run_item_actions için regression testleri."""

    def _mk_branch(self):
        return Branch.objects.create(name="B1", code="B1")

    def _mk_kitchen_wh(self, branch: Branch):
        wh = Warehouse.objects.create(
            name="Kitchen",
            code=f"KITCHEN-{branch.code}",
            warehouse_type=WarehouseType.KITCHEN,
            is_default=False,
        )
        wh.branches.add(branch)
        return wh

    def _mk_supply_wh(self, branch: Branch, code: str = "SUP-1"):
        wh = Warehouse.objects.create(
            name="Supply",
            code=code,
            warehouse_type=WarehouseType.MAIN,
            is_default=False,
        )
        wh.branches.add(branch)
        return wh

    def _mk_user(self, branch: Branch):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        return User.objects.create_user(
            username=f"u_{branch.code}",
            email=f"{branch.code}@t.local",
            password="pw",
            branch=branch,
        )

    def _mk_station(self, branch: Branch, kitchen_wh: Warehouse):
        return KitchenStation.objects.create(
            branch=branch,
            name="Station-1",
            warehouse=kitchen_wh,
        )

    def _mk_supplier(self):
        return Supplier.objects.create(name="Tedarikçi A", is_active=True)

    def _receive_stock(self, warehouse, stock_item, qty, user, ref="Init"):
        InventoryService.receive_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            quantity=Decimal(str(qty)),
            reference=ref,
            performed_by=user,
            unit_price=Decimal("10.00"),
        )

    def _mk_report_with_items(
        self, station, kitchen_wh, user, items_spec, status=DeficiencyReportStatus.PENDING
    ):
        """items_spec: [(stock_item, qty, unit), ...]"""
        report = DeficiencyReport.objects.create(
            report_number=f"DR-{station.id}",
            kitchen_station=station,
            target_warehouse=kitchen_wh,
            status=status,
            created_by=user,
        )
        item_ids = []
        for stock_item, qty, unit in items_spec:
            ri = DeficiencyReportItem.objects.create(
                report=report,
                stock_item=stock_item,
                quantity=Decimal(str(qty)),
                unit=unit,
            )
            item_ids.append((str(ri.id), stock_item))
        return report, item_ids

    # ─────────────────────────────────────────────────────────────
    # SENARYO 1: PURCHASE_PARTIAL → transfer + PO
    # ─────────────────────────────────────────────────────────────
    def test_purchase_partial_creates_both_transfer_and_po(self):
        """Depoda kısmen varsa: transfer_qty kadar transfer, kalan PO."""
        branch = self._mk_branch()
        kitchen_wh = self._mk_kitchen_wh(branch)
        supply_wh = self._mk_supply_wh(branch, code="SUP-PP")
        user = self._mk_user(branch)
        station = self._mk_station(branch, kitchen_wh)
        supplier = self._mk_supplier()

        stock_item = StockItem.objects.create(
            name="Domates", sku="DOM-PP", unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
        )
        self._receive_stock(supply_wh, stock_item, 7, user)  # Depoda 7 var
        report, [(item_id, _)] = self._mk_report_with_items(
            station, kitchen_wh, user,
            [(stock_item, 10, "kg")],
        )

        result = DeficiencyActionService.run_item_actions(
            str(report.id),
            {
                "items": [{"item_id": item_id, "action": ACTION_PURCHASE_PARTIAL}],
                "supplier_id": str(supplier.id),
                "warehouse_id": str(kitchen_wh.id),
            },
            user=user,
        )

        # 7 transfer + 3 PO olmalı
        transfers = WarehouseTransfer.objects.filter(deficiency_report=report)
        assert transfers.count() == 1
        assert transfers.first().status in ("IN_TRANSIT", "COMPLETED")
        assert transfers.first().items.count() == 1
        assert Decimal(str(transfers.first().items.first().quantity)) == Decimal("7.000")

        po = result.get("purchase_order_id")
        assert po is not None

        # PO'da 3 kg olmalı
        from apps.warehouse.models import PurchaseOrderItem
        po_items = PurchaseOrderItem.objects.filter(purchase_order_id=po)
        assert po_items.count() == 1
        assert Decimal(str(po_items.first().quantity)) == Decimal("3.000")

    # ─────────────────────────────────────────────────────────────
    # SENARYO 2: FULFILL_STOCK → sadece transfer
    # ─────────────────────────────────────────────────────────────
    def test_fulfill_stock_creates_only_transfer(self):
        branch = self._mk_branch()
        kitchen_wh = self._mk_kitchen_wh(branch)
        supply_wh = self._mk_supply_wh(branch, code="SUP-FS")
        user = self._mk_user(branch)
        station = self._mk_station(branch, kitchen_wh)
        supplier = self._mk_supplier()

        stock_item = StockItem.objects.create(
            name="Patates", sku="PAT-FS", unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
        )
        self._receive_stock(supply_wh, stock_item, 15, user)  # 10 talep, 15 var
        report, [(item_id, _)] = self._mk_report_with_items(
            station, kitchen_wh, user,
            [(stock_item, 10, "kg")],
        )

        result = DeficiencyActionService.run_item_actions(
            str(report.id),
            {
                "items": [{"item_id": item_id, "action": ACTION_FULFILL_STOCK}],
                "supplier_id": str(supplier.id),
                "warehouse_id": str(kitchen_wh.id),
            },
            user=user,
        )

        assert result["purchase_order_id"] is None  # PO oluşmamalı
        assert result["transfers_created"] == 1

    # ─────────────────────────────────────────────────────────────
    # SENARYO 3: PURCHASE_ALL → sadece PO
    # ─────────────────────────────────────────────────────────────
    def test_purchase_all_creates_only_po(self):
        branch = self._mk_branch()
        kitchen_wh = self._mk_kitchen_wh(branch)
        supply_wh = self._mk_supply_wh(branch, code="SUP-PA")
        user = self._mk_user(branch)
        station = self._mk_station(branch, kitchen_wh)
        supplier = self._mk_supplier()

        stock_item = StockItem.objects.create(
            name="Soğan", sku="SGN-PA", unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
        )
        # Depoda hiç yok
        report, [(item_id, _)] = self._mk_report_with_items(
            station, kitchen_wh, user,
            [(stock_item, 8, "kg")],
        )

        result = DeficiencyActionService.run_item_actions(
            str(report.id),
            {
                "items": [{"item_id": item_id, "action": ACTION_PURCHASE_ALL}],
                "supplier_id": str(supplier.id),
                "warehouse_id": str(kitchen_wh.id),
            },
            user=user,
        )

        assert result["transfers_created"] == 0
        assert result["purchase_order_id"] is not None

    # ─────────────────────────────────────────────────────────────
    # SENARYO 4 (BUG #2 REGRESSION): Allocation yetersizse fark PO'ya eklenmeli
    # ─────────────────────────────────────────────────────────────
    def test_shortfall_in_allocation_added_to_purchase_lines(self):
        """
        Aynı depodan iki farklı kalem talep ediliyor. Depo miktarı sınırlı.
        Plan'da iki kalem için de 'transfer' denilmiş ama allocation toplam
        depodaki miktardan fazla olamaz. Eksik kısım PO'ya eklenmeli,
        sessizce kaybolmamalı.
        """
        branch = self._mk_branch()
        kitchen_wh = self._mk_kitchen_wh(branch)
        supply_wh = self._mk_supply_wh(branch, code="SUP-SF")
        user = self._mk_user(branch)
        station = self._mk_station(branch, kitchen_wh)
        supplier = self._mk_supplier()

        # İki farklı kalem, depoda sadece 6 adet var (her birinden)
        stock_a = StockItem.objects.create(
            name="Kalem-A", sku="KA-SF", unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
        )
        stock_b = StockItem.objects.create(
            name="Kalem-B", sku="KB-SF", unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
        )
        # Her birinden 6 adet var; A'dan 8, B'den 8 talep ediliyor
        self._receive_stock(supply_wh, stock_a, 6, user)
        self._receive_stock(supply_wh, stock_b, 6, user)

        report, item_ids = self._mk_report_with_items(
            station, kitchen_wh, user,
            [(stock_a, 8, "kg"), (stock_b, 8, "kg")],
        )
        item_a_id, _ = item_ids[0]
        item_b_id, _ = item_ids[1]

        # Her ikisi için de transfer (FULFILL_STOCK) seçilmiş olsun
        # (can_fully_fulfill false olacak çünkü sadece 6 var, 8 talep var)
        # Bu yüzden FULFILL_STOCK hata fırlatır. PURCHASE_PARTIAL kullanalım.
        result = DeficiencyActionService.run_item_actions(
            str(report.id),
            {
                "items": [
                    {"item_id": item_a_id, "action": ACTION_PURCHASE_PARTIAL},
                    {"item_id": item_b_id, "action": ACTION_PURCHASE_PARTIAL},
                ],
                "supplier_id": str(supplier.id),
                "warehouse_id": str(kitchen_wh.id),
            },
            user=user,
        )

        # Her kalem için: plan'da 6 transfer + 2 PO = 8 toplam
        # allocate edilen miktar: A=6, B=6 (depodaki tüm miktar)
        # Bu senaryoda allocation yeterli çünkü her kalem için ayrı ayrı bakılıyor
        # ve depoda her birinden 6 var. Bu test'in asıl amacı planın doğru
        # çalıştığını göstermek.

        from apps.warehouse.models import PurchaseOrderItem
        po_items = PurchaseOrderItem.objects.filter(purchase_order_id=result["purchase_order_id"])
        po_total = sum(Decimal(str(it.quantity)) for it in po_items)
        # Her kalem için 2 PO + 6 transfer = 8 toplam. İki kalem için toplam 4 PO.
        assert po_total == Decimal("4.000"), (
            f"Beklenen toplam PO 4.000, bulundu: {po_total}"
        )

    def test_shortfall_when_allocation_capped(self, monkeypatch):
        """
        Bug #2 regression testi: Allocation yetersiz kaldığında, plan'da
        transfer denilen miktarın gerçekte sağlanamayan kısmı PO'ya eklenmeli.

        Normalde `calculate_allocations_for_targets` her kalem için
        `min(wh_qty, remaining)` döndürür, ancak aynı stock_item iki ayrı
        rapor kaleminde olduğunda, transfer oluşturma sırasındaki gerçek
        stok kontrolü (`partition_transfer_lines_by_source_stock`) bunu
        tolere eder. Bu testte monkey-patch ile allocation'ı yapay olarak
        sınırlıyoruz; bu sayede shortfall logic'inin doğru çalıştığını
        bağımsız olarak doğrulayabiliyoruz.
        """
        from collections import defaultdict
        from apps.warehouse.services.fulfillment_service import (
            DeficiencyFulfillmentService,
        )

        branch = self._mk_branch()
        kitchen_wh = self._mk_kitchen_wh(branch)
        supply_wh = self._mk_supply_wh(branch, code="SUP-SF2")
        user = self._mk_user(branch)
        station = self._mk_station(branch, kitchen_wh)
        supplier = self._mk_supplier()

        # Depoda 10 adet var
        stock = StockItem.objects.create(
            name="Paylaşılan", sku="PAY-1", unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
        )
        self._receive_stock(supply_wh, stock, 10, user)

        # Tek rapor kalemi, plan'da 8 transfer
        # Monkey-patch ile allocation sadece 5 döndürsün
        report, [(item_id, _)] = self._mk_report_with_items(
            station, kitchen_wh, user,
            [(stock, 8, "kg")],
        )

        original_calc = DeficiencyFulfillmentService.calculate_allocations_for_targets

        def capped_allocation(report_arg, availability, targets):
            # Sadece 5 tahsisat yap
            real = original_calc(report_arg, availability, targets)
            capped = defaultdict(list)
            for wh_id, items in real.items():
                for a in items:
                    if a['quantity'] > Decimal("5.000"):
                        a = {**a, 'quantity': Decimal("5.000")}
                    capped[wh_id].append(a)
            return capped

        monkeypatch.setattr(
            DeficiencyFulfillmentService,
            "calculate_allocations_for_targets",
            staticmethod(capped_allocation),
        )

        result = DeficiencyActionService.run_item_actions(
            str(report.id),
            {
                "items": [{"item_id": item_id, "action": ACTION_PURCHASE_PARTIAL}],
                "supplier_id": str(supplier.id),
                "warehouse_id": str(kitchen_wh.id),
            },
            user=user,
        )

        # Plan: 8 transfer + 0 PO. Gerçek: 5 transfer + 3 PO.
        # Bug #2 düzeltmesi olmadan PO 0 olurdu ve 3 birim kaybolurdu.
        from apps.warehouse.models import PurchaseOrderItem
        po_items = PurchaseOrderItem.objects.filter(
            purchase_order_id=result["purchase_order_id"]
        )
        po_total = sum(Decimal(str(it.quantity)) for it in po_items)

        assert po_total == Decimal("3.000"), (
            f"Shortfall (8-5=3) PO'ya eklenmeliydi, bulundu: {po_total}"
        )

        transfers = WarehouseTransfer.objects.filter(deficiency_report=report)
        transfer_total = sum(
            Decimal(str(it.quantity))
            for t in transfers
            for it in t.items.all()
        )
        # Toplam 8 = 5 transfer + 3 PO
        assert (transfer_total + po_total) == Decimal("8.000"), (
            f"Toplam karşılama 8 olmalı, transfer={transfer_total} + PO={po_total}"
        )

    # ─────────────────────────────────────────────────────────────
    # SENARYO 5: REJECT → hiçbir şey oluşmaz
    # ─────────────────────────────────────────────────────────────
    def test_reject_creates_nothing(self):
        branch = self._mk_branch()
        kitchen_wh = self._mk_kitchen_wh(branch)
        supply_wh = self._mk_supply_wh(branch, code="SUP-RJ")
        user = self._mk_user(branch)
        station = self._mk_station(branch, kitchen_wh)
        supplier = self._mk_supplier()

        stock_item = StockItem.objects.create(
            name="Reddedilen", sku="RD", unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
        )
        self._receive_stock(supply_wh, stock_item, 100, user)
        report, [(item_id, _)] = self._mk_report_with_items(
            station, kitchen_wh, user,
            [(stock_item, 10, "kg")],
        )

        result = DeficiencyActionService.run_item_actions(
            str(report.id),
            {
                "items": [{"item_id": item_id, "action": ACTION_REJECT}],
                "supplier_id": str(supplier.id),
                "warehouse_id": str(kitchen_wh.id),
            },
            user=user,
        )

        assert result["transfers_created"] == 0
        assert result["purchase_order_id"] is None

    # ─────────────────────────────────────────────────────────────
    # SENARYO 6: Preview ile execute tutarlı olmalı
    # ─────────────────────────────────────────────────────────────
    def test_preview_matches_execute(self):
        """
        preview_item_actions ve run_item_actions aynı plan vermeli.
        Özellikle: aynı miktarlarda transfer ve PO öngörülmeli.
        """
        branch = self._mk_branch()
        kitchen_wh = self._mk_kitchen_wh(branch)
        supply_wh = self._mk_supply_wh(branch, code="SUP-PV")
        user = self._mk_user(branch)
        station = self._mk_station(branch, kitchen_wh)
        supplier = self._mk_supplier()

        stock_item = StockItem.objects.create(
            name="Test", sku="PV", unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
        )
        self._receive_stock(supply_wh, stock_item, 6, user)  # 10 talep, 6 var

        report, [(item_id, _)] = self._mk_report_with_items(
            station, kitchen_wh, user,
            [(stock_item, 10, "kg")],
        )

        # Önce onay (preview supplier_id olmadan çağrılır)
        plan = DeficiencyActionService.preview_item_actions(
            str(report.id),
            [{"item_id": item_id, "action": ACTION_PURCHASE_PARTIAL}],
        )
        # plan['transfers'] içindeki transfer miktarını bul
        preview_transfer_qty = sum(
            Decimal(str(it["quantity"]))
            for tr in plan["transfers"]
            for it in tr["items"]
        )
        preview_purchase_qty = sum(
            Decimal(str(p["quantity"])) for p in plan["purchases"]
        )
        assert preview_transfer_qty == Decimal("6.000")
        assert preview_purchase_qty == Decimal("4.000")

        # Sonra gerçek execute
        # Önce preview'daki transfer/PO oranlarını doğrula
        # Execute edince transfer ve PO aynı miktarlarda olmalı
        result = DeficiencyActionService.run_item_actions(
            str(report.id),
            {
                "items": [{"item_id": item_id, "action": ACTION_PURCHASE_PARTIAL}],
                "supplier_id": str(supplier.id),
                "warehouse_id": str(kitchen_wh.id),
            },
            user=user,
        )

        transfers = WarehouseTransfer.objects.filter(deficiency_report=report)
        actual_transfer_qty = sum(
            Decimal(str(it.quantity))
            for t in transfers
            for it in t.items.all()
        )
        from apps.warehouse.models import PurchaseOrderItem
        po_items = PurchaseOrderItem.objects.filter(purchase_order_id=result["purchase_order_id"])
        actual_purchase_qty = sum(Decimal(str(it.quantity)) for it in po_items)

        assert actual_transfer_qty == preview_transfer_qty, (
            f"Preview {preview_transfer_qty}, execute {actual_transfer_qty}"
        )
        assert actual_purchase_qty == preview_purchase_qty, (
            f"Preview {preview_purchase_qty}, execute {actual_purchase_qty}"
        )
