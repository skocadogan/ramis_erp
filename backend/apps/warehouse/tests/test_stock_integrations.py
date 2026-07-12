import pytest
from decimal import Decimal

from django.utils import timezone

from apps.branches.models import Branch, KitchenStation, Zone
from apps.menu.models import Category, Product, CombinedProductItem
from apps.recipes.models import Recipe, RecipeIngredient
from apps.inventory.models import StockItem, Supplier, StockMovement, StockMovementType, StockLot
from apps.inventory.services import InventoryService, InsufficientStockError
from apps.orders.models import Order, OrderItem, OrderStatus
from apps.orders.services import OrderService
from apps.warehouse.models import (
    Warehouse,
    WarehouseType,
    GoodsReceiving,
    GoodsReceivingItem,
    GoodsReceivingStatus,
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseOrderStatus,
    WarehouseTransfer,
    WarehouseTransferItem,
    TransferStatus,
    StockCounting,
    StockCountingItem,
    CountingStatus,
    CountingDifferenceReason,
    DeficiencyReport,
    DeficiencyReportItem,
    DeficiencyReportStatus,
)
from apps.warehouse.services import (
    GoodsReceivingService,
    TransferService,
    StockCountingService,
    DeficiencyFulfillmentService,
)


@pytest.mark.django_db
class TestWarehouseStockIntegrations:
    def _mk_branch(self):
        return Branch.objects.create(name="B1", code="B1")

    def _mk_kitchen_wh(self, branch: Branch):
        wh = Warehouse.objects.create(
            name="Kitchen",
            code="KITCHEN-1",
            warehouse_type=WarehouseType.KITCHEN,
            is_default=False,
        )
        wh.branches.add(branch)
        return wh

    def _mk_supply_wh(self, branch: Branch, code="SUP-1"):
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

    def _mk_product_with_recipe(
        self,
        *,
        category: Category,
        name: str,
        stock_item: StockItem,
        ingredient_qty: Decimal,
        servings: int = 1,
        is_combined: bool = False,
    ) -> Product:
        product = Product.objects.create(category=category, name=name, base_price=Decimal("10.00"), is_combined=is_combined)
        recipe = Recipe.objects.create(product=product, name=f"R-{name}", servings=servings)
        RecipeIngredient.objects.create(recipe=recipe, stock_item=stock_item, quantity=ingredient_qty, unit=stock_item.unit)
        return product

    def test_complete_order_deducts_recipe_stock_normalized_by_servings(self):
        branch = self._mk_branch()
        kitchen_wh = self._mk_kitchen_wh(branch)
        user = self._mk_user(branch)

        stock_item = StockItem.objects.create(
            name="Un",
            sku="UN-ITG-1",
            unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
        )

        # Başlangıç stoğu
        InventoryService.receive_stock(
            warehouse_id=kitchen_wh.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("10.000"),
            reference="Init",
            performed_by=user,
            unit_price=Decimal("10.00"),
        )

        category = Category.objects.create(name="Yemek")
        # Reçete: toplam 2 kg / 4 porsiyon => porsiyon başı 0.5 kg
        product = self._mk_product_with_recipe(
            category=category,
            name="Pide",
            stock_item=stock_item,
            ingredient_qty=Decimal("2.000"),
            servings=4,
        )

        order = Order.objects.create(
            branch=branch,
            status=OrderStatus.PENDING,
            total_amount=Decimal("20.00"),
            stock_tracking_mode="INGREDIENT",
        )
        OrderItem.objects.create(
            order=order,
            product=product,
            quantity=2,  # 2 porsiyon
            unit_price=Decimal("10.00"),
            total_price=Decimal("20.00"),
            status=OrderStatus.PENDING,
        )

        OrderService.complete_order(order, "CASH", user)

        # Beklenen düşüm: 0.5kg * 2 = 1kg
        from apps.warehouse.models import WarehouseStockLevel

        level = WarehouseStockLevel.objects.get(warehouse=kitchen_wh, stock_item=stock_item)
        assert level.quantity == Decimal("9.000")

        out_movs = StockMovement.objects.filter(warehouse=kitchen_wh, stock_item=stock_item, movement_type=StockMovementType.OUT)
        assert out_movs.count() == 1

        # Lot düşümü gerçekleşmiş olmalı
        lot = StockLot.objects.filter(warehouse=kitchen_wh, stock_item=stock_item).order_by("received_at").first()
        assert lot is not None
        assert lot.quantity == Decimal("9.000")

    def test_combined_product_child_recipe_is_skipped_if_parent_has_recipe(self):
        branch = self._mk_branch()
        Zone.objects.create(branch=branch, name="Paket", is_takeaway=True)
        kitchen_wh = self._mk_kitchen_wh(branch)
        user = self._mk_user(branch)

        stock_item = StockItem.objects.create(
            name="Peynir",
            sku="PYN-1",
            unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("100.00"),
        )
        InventoryService.receive_stock(
            warehouse_id=kitchen_wh.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("10.000"),
            reference="Init",
            performed_by=user,
            unit_price=Decimal("100.00"),
        )

        station = self._mk_station(branch, kitchen_wh)
        category = Category.objects.create(name="Paketler", station=station)
        parent = self._mk_product_with_recipe(
            category=category,
            name="KahvaltiPaketi",
            stock_item=stock_item,
            ingredient_qty=Decimal("1.000"),
            servings=1,
            is_combined=True,
        )
        child = self._mk_product_with_recipe(
            category=category,
            name="PeynirTabagi",
            stock_item=stock_item,
            ingredient_qty=Decimal("1.000"),
            servings=1,
            is_combined=False,
        )
        CombinedProductItem.objects.create(parent_product=parent, product=child, quantity=1)

        order = OrderService.create_order(
            branch_id=branch.id,
            table_id=None,
            order_type="TAKEAWAY",
            user=user,
            notes="",
            items_data=[{"product_id": parent.id, "quantity": 1, "unit_price": Decimal("10.00")}],
            stock_tracking_mode="INGREDIENT",
        )
        assert order.items.count() == 1  # birleşik ürün tek üst satır; alt bileşenler reçete/stok katmanında çözülür

        OrderService.complete_order(order, "CASH", user)

        from apps.warehouse.models import WarehouseStockLevel

        level = WarehouseStockLevel.objects.get(warehouse=kitchen_wh, stock_item=stock_item)
        # Parent recipe 1kg düşer, child recipe düşmemeli => toplam 1kg
        assert level.quantity == Decimal("9.000")

    def test_complete_order_rolls_back_if_insufficient_stock(self):
        branch = self._mk_branch()
        kitchen_wh = self._mk_kitchen_wh(branch)
        user = self._mk_user(branch)

        stock_item = StockItem.objects.create(
            name="Et",
            sku="ET-1",
            unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("200.00"),
        )
        # Bilerek düşük stok
        InventoryService.receive_stock(
            warehouse_id=kitchen_wh.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("1.000"),
            reference="Init",
            performed_by=user,
            unit_price=Decimal("200.00"),
        )

        category = Category.objects.create(name="Yemek")
        product = self._mk_product_with_recipe(
            category=category,
            name="Steak",
            stock_item=stock_item,
            ingredient_qty=Decimal("2.000"),
            servings=1,
        )
        order = Order.objects.create(
            branch=branch,
            status=OrderStatus.PENDING,
            total_amount=Decimal("10.00"),
            stock_tracking_mode="INGREDIENT",
        )
        OrderItem.objects.create(
            order=order,
            product=product,
            quantity=1,
            unit_price=Decimal("10.00"),
            total_price=Decimal("10.00"),
            status=OrderStatus.PENDING,
        )

        with pytest.raises(InsufficientStockError):
            OrderService.complete_order(order, "CASH", user)

        order.refresh_from_db()
        assert order.status == OrderStatus.PENDING

    def test_goods_receiving_complete_creates_stock_in_and_updates_po_status(self):
        branch = self._mk_branch()
        user = self._mk_user(branch)
        wh = self._mk_supply_wh(branch, code="MAIN-PO-1")

        supplier = Supplier.objects.create(name="T1")
        stock_item = StockItem.objects.create(
            name="Domates",
            sku="DMTS-1",
            unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
        )

        po = PurchaseOrder.objects.create(
            order_number="PO-1",
            supplier=supplier,
            warehouse=wh,
            status=PurchaseOrderStatus.APPROVED,
            order_date=timezone.now().date(),
            created_by=user,
        )
        PurchaseOrderItem.objects.create(
            purchase_order=po,
            stock_item=stock_item,
            quantity=Decimal("5.000"),
            unit="kg",
            unit_price=Decimal("20.00"),
            received_quantity=Decimal("0.000"),
        )

        receiving = GoodsReceiving.objects.create(
            receiving_number="GR-1",
            purchase_order=po,
            supplier=supplier,
            warehouse=wh,
            status=GoodsReceivingStatus.PENDING,
            received_date=timezone.now().date(),
            received_by=user,
        )
        GoodsReceivingItem.objects.create(
            goods_receiving=receiving,
            stock_item=stock_item,
            expected_quantity=Decimal("5.000"),
            received_quantity=Decimal("5.000"),
            rejected_quantity=Decimal("0.000"),
            unit="kg",
            unit_price=Decimal("20.00"),
        )

        GoodsReceivingService.complete_receiving(receiving.id, user=user)

        receiving.refresh_from_db()
        assert receiving.status == GoodsReceivingStatus.ACCEPTED

        from apps.warehouse.models import WarehouseStockLevel

        level = WarehouseStockLevel.objects.get(warehouse=wh, stock_item=stock_item)
        assert level.quantity == Decimal("5.000")

        po.refresh_from_db()
        assert po.status == PurchaseOrderStatus.RECEIVED

    def test_goods_receiving_complete_with_rejection_creates_return_and_updates_po(self):
        branch = self._mk_branch()
        user = self._mk_user(branch)
        wh = self._mk_supply_wh(branch, code="MAIN-PO-REJ")

        supplier = Supplier.objects.create(name="T2")
        stock_item = StockItem.objects.create(
            name="Pirinç",
            sku="PRNC-1",
            unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("150.00"),
        )

        po = PurchaseOrder.objects.create(
            order_number="PO-REJ-1",
            supplier=supplier,
            warehouse=wh,
            status=PurchaseOrderStatus.APPROVED,
            order_date=timezone.now().date(),
            total_amount=Decimal("1500.00"),
            created_by=user,
        )
        po_item = PurchaseOrderItem.objects.create(
            purchase_order=po,
            stock_item=stock_item,
            quantity=Decimal("10.000"),
            unit="kg",
            unit_price=Decimal("150.00"),
            received_quantity=Decimal("0.000"),
        )

        receiving = GoodsReceiving.objects.create(
            receiving_number="GR-REJ-1",
            purchase_order=po,
            supplier=supplier,
            warehouse=wh,
            status=GoodsReceivingStatus.PENDING,
            received_date=timezone.now().date(),
            received_by=user,
            total_amount=Decimal("1200.00"),
        )
        GoodsReceivingItem.objects.create(
            goods_receiving=receiving,
            stock_item=stock_item,
            expected_quantity=Decimal("10.000"),
            received_quantity=Decimal("8.000"),
            rejected_quantity=Decimal("2.000"),
            unit="kg",
            unit_price=Decimal("150.00"),
        )

        GoodsReceivingService.complete_receiving(receiving.id, user=user)

        receiving.refresh_from_db()
        assert receiving.status == GoodsReceivingStatus.PARTIALLY_ACCEPTED

        from apps.warehouse.models import WarehouseStockLevel

        level = WarehouseStockLevel.objects.get(warehouse=wh, stock_item=stock_item)
        assert level.quantity == Decimal("8.000")

        po.refresh_from_db()
        po_item.refresh_from_db()
        assert po_item.received_quantity == Decimal("8.000")
        assert po.status == PurchaseOrderStatus.PARTIALLY_RECEIVED
        assert po.total_amount == Decimal("1200.00")

        return_movements = StockMovement.objects.filter(
            stock_item=stock_item,
            movement_type=StockMovementType.RETURN,
            quantity=Decimal("2.000"),
        )
        assert return_movements.count() == 1
        movement = return_movements.first()
        assert movement.unit_price == Decimal("150.00")
        assert "PO-REJ-1" in (movement.notes or "")
        assert "GR-REJ-1" in (movement.notes or "")

    def test_goods_receiving_create_accepts_separate_accepted_and_rejected_quantities(self):
        branch = self._mk_branch()
        user = self._mk_user(branch)
        wh = self._mk_supply_wh(branch, code="MAIN-PO-ACC")

        supplier = Supplier.objects.create(name="T3")
        stock_item = StockItem.objects.create(
            name="Pirinç 2",
            sku="PRNC-2",
            unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("150.00"),
        )

        po = PurchaseOrder.objects.create(
            order_number="PO-ACC-1",
            supplier=supplier,
            warehouse=wh,
            status=PurchaseOrderStatus.APPROVED,
            order_date=timezone.now().date(),
            total_amount=Decimal("1500.00"),
            created_by=user,
        )
        PurchaseOrderItem.objects.create(
            purchase_order=po,
            stock_item=stock_item,
            quantity=Decimal("10.000"),
            unit="kg",
            unit_price=Decimal("150.00"),
            received_quantity=Decimal("0.000"),
        )

        receiving = GoodsReceivingService.create_receiving(
            data={
                'purchase_order_id': po.id,
                'supplier_id': supplier.id,
                'warehouse_id': wh.id,
                'received_date': timezone.now().date(),
            },
            items_data=[{
                'stock_item_id': stock_item.id,
                'expected_quantity': Decimal("10.000"),
                'received_quantity': Decimal("2.000"),
                'rejected_quantity': Decimal("8.000"),
                'unit': 'kg',
                'unit_price': Decimal("150.00"),
            }],
            user=user,
        )

        item = receiving.items.get()
        assert item.received_quantity == Decimal("2.000")
        assert item.rejected_quantity == Decimal("8.000")
        assert item.accepted_quantity == Decimal("2.000")
        assert receiving.total_amount == Decimal("300.00")

        GoodsReceivingService.complete_receiving(receiving.id, user=user)

        from apps.warehouse.models import WarehouseStockLevel

        level = WarehouseStockLevel.objects.get(warehouse=wh, stock_item=stock_item)
        assert level.quantity == Decimal("2.000")

        return_movements = StockMovement.objects.filter(
            stock_item=stock_item,
            movement_type=StockMovementType.RETURN,
            quantity=Decimal("8.000"),
        )
        assert return_movements.count() == 1
        assert return_movements.first().unit_price == Decimal("150.00")

        po.refresh_from_db()
        assert po.total_amount == Decimal("300.00")

    def test_goods_receiving_partial_acceptance_does_not_subtract_rejected_from_received(self):
        """Beklenen 5, kabul 3, red 2 → stoğa 3 kg girer (3-2=1 değil)."""
        branch = self._mk_branch()
        user = self._mk_user(branch)
        wh = self._mk_supply_wh(branch, code="MAIN-PO-PART")

        supplier = Supplier.objects.create(name="T4")
        stock_item = StockItem.objects.create(
            name="test-stok-urunu",
            sku="STK-test-001",
            unit="kg",
            minimum_quantity=Decimal("1.000"),
            last_purchase_price=Decimal("80.00"),
        )

        receiving = GoodsReceivingService.create_receiving(
            data={
                'supplier_id': supplier.id,
                'warehouse_id': wh.id,
                'received_date': timezone.now().date(),
            },
            items_data=[{
                'stock_item_id': stock_item.id,
                'expected_quantity': Decimal("5.000"),
                'received_quantity': Decimal("3.000"),
                'rejected_quantity': Decimal("2.000"),
                'unit': 'kg',
                'unit_price': Decimal("80.00"),
            }],
            user=user,
        )

        item = receiving.items.get()
        assert item.received_quantity == Decimal("3.000")
        assert item.rejected_quantity == Decimal("2.000")
        assert item.accepted_quantity == Decimal("3.000")

        GoodsReceivingService.complete_receiving(receiving.id, user=user)

        from apps.warehouse.models import WarehouseStockLevel

        level = WarehouseStockLevel.objects.get(warehouse=wh, stock_item=stock_item)
        assert level.quantity == Decimal("3.000")

        return_movements = StockMovement.objects.filter(
            stock_item=stock_item,
            movement_type=StockMovementType.RETURN,
            quantity=Decimal("2.000"),
        )
        assert return_movements.count() == 1

    def test_goods_receiving_delete_pending_soft_deletes_record(self):
        branch = self._mk_branch()
        user = self._mk_user(branch)
        wh = self._mk_supply_wh(branch)
        supplier = Supplier.objects.create(name="Tedarikci")
        stock_item = StockItem.objects.create(name="Un", sku="UN-GR-DEL", unit="kg")

        receiving = GoodsReceiving.objects.create(
            supplier=supplier,
            warehouse=wh,
            status=GoodsReceivingStatus.PENDING,
            received_date=timezone.now().date(),
            received_by=user,
        )
        item = GoodsReceivingItem.objects.create(
            goods_receiving=receiving,
            stock_item=stock_item,
            expected_quantity=Decimal("10.000"),
            received_quantity=Decimal("10.000"),
            unit="kg",
            unit_price=Decimal("5.00"),
        )

        GoodsReceivingService.delete_receiving(receiving.id, user=user)

        receiving.refresh_from_db()
        item.refresh_from_db()
        assert receiving.is_active is False
        assert item.is_active is False

    def test_goods_receiving_delete_completed_raises(self):
        branch = self._mk_branch()
        user = self._mk_user(branch)
        wh = self._mk_supply_wh(branch)
        supplier = Supplier.objects.create(name="Tedarikci2")
        stock_item = StockItem.objects.create(name="Seker", sku="SK-GR-DEL", unit="kg")

        receiving = GoodsReceiving.objects.create(
            supplier=supplier,
            warehouse=wh,
            status=GoodsReceivingStatus.ACCEPTED,
            received_date=timezone.now().date(),
            received_by=user,
        )
        GoodsReceivingItem.objects.create(
            goods_receiving=receiving,
            stock_item=stock_item,
            expected_quantity=Decimal("5.000"),
            received_quantity=Decimal("5.000"),
            unit="kg",
            unit_price=Decimal("10.00"),
        )

        with pytest.raises(ValueError, match="Tamamlanmış"):
            GoodsReceivingService.delete_receiving(receiving.id, user=user)

    def test_transfer_complete_moves_stock_without_cost_corruption(self):
        branch = self._mk_branch()
        user = self._mk_user(branch)
        source = self._mk_supply_wh(branch, code="SRC-1")
        target = self._mk_supply_wh(branch, code="TGT-1")

        stock_item = StockItem.objects.create(
            name="Yag",
            sku="YAG-1",
            unit="lt",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("30.00"),
            average_cost=Decimal("30.0000"),
        )

        # source'a satın-alma gibi giriş (maliyet set olur)
        InventoryService.receive_stock(
            warehouse_id=source.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("10.000"),
            reference="Init",
            performed_by=user,
            unit_price=Decimal("30.00"),
        )
        stock_item.refresh_from_db()
        assert stock_item.last_purchase_price == Decimal("30.00")

        transfer = WarehouseTransfer.objects.create(
            transfer_number="TR-1",
            source_warehouse=source,
            target_warehouse=target,
            status=TransferStatus.PENDING,
            transfer_date=timezone.now().date(),
            requested_by=user,
        )
        WarehouseTransferItem.objects.create(
            transfer=transfer,
            stock_item=stock_item,
            quantity=Decimal("3.000"),
            unit="lt",
            received_quantity=Decimal("0.000"),
        )

        TransferService.approve_transfer(transfer.id, user=user)
        TransferService.complete_transfer(transfer.id, user=user)

        from apps.warehouse.models import WarehouseStockLevel

        src_level = WarehouseStockLevel.objects.get(warehouse=source, stock_item=stock_item)
        tgt_level = WarehouseStockLevel.objects.get(warehouse=target, stock_item=stock_item)
        assert src_level.quantity == Decimal("7.000")
        assert tgt_level.quantity == Decimal("3.000")

        from apps.inventory.models import StockLot, StockMovement, StockMovementType

        tgt_lots = StockLot.objects.filter(
            warehouse=target, stock_item=stock_item, quantity__gt=0, is_active=True
        )
        assert tgt_lots.exists()
        assert all(lot.unit_price == Decimal("30.00") for lot in tgt_lots)

        out_mov = StockMovement.objects.filter(
            warehouse=source,
            stock_item=stock_item,
            movement_type=StockMovementType.TRANSFER,
        ).first()
        assert out_mov is not None
        assert out_mov.lot_consumptions.filter(is_active=True).exists()

        stock_item.refresh_from_db()
        assert stock_item.last_purchase_price == Decimal("30.00")

    def test_stock_counting_approve_creates_adjustment_and_lot_sync(self):
        branch = self._mk_branch()
        user = self._mk_user(branch)
        wh = self._mk_supply_wh(branch, code="CNT-1")

        stock_item = StockItem.objects.create(
            name="Seker",
            sku="SKR-1",
            unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
            average_cost=Decimal("10.0000"),
        )
        InventoryService.receive_stock(
            warehouse_id=wh.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("5.000"),
            reference="Init",
            performed_by=user,
            unit_price=Decimal("10.00"),
        )

        counting = StockCounting.objects.create(
            counting_number="SC-1",
            warehouse=wh,
            status=CountingStatus.COMPLETED,
            counting_date=timezone.now().date(),
            counted_by=user,
        )
        StockCountingItem.objects.create(
            counting=counting,
            stock_item=stock_item,
            system_quantity=Decimal("5.000"),
            counted_quantity=Decimal("7.000"),  # +2
            difference=Decimal("2.000"),
            unit="kg",
            difference_reason=CountingDifferenceReason.CORRECTION,
        )

        StockCountingService.approve_counting(counting.id, user=user)

        from apps.warehouse.models import WarehouseStockLevel

        level = WarehouseStockLevel.objects.get(warehouse=wh, stock_item=stock_item)
        assert level.quantity == Decimal("7.000")

        assert StockMovement.objects.filter(
            warehouse=wh, stock_item=stock_item, movement_type=StockMovementType.ADJUSTMENT
        ).exists()

        # ADJ lotu oluşmalı
        assert StockLot.objects.filter(warehouse=wh, stock_item=stock_item, lot_number="ADJ").exists()

    def test_stock_counting_update_items_allowed_when_completed(self):
        branch = self._mk_branch()
        user = self._mk_user(branch)
        wh = self._mk_supply_wh(branch, code="CNT-UPD")
        stock_item = StockItem.objects.create(
            name="Say",
            sku="SAY-1",
            unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
            average_cost=Decimal("10.0000"),
        )
        InventoryService.receive_stock(
            warehouse_id=wh.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("5.000"),
            reference="Init",
            performed_by=user,
            unit_price=Decimal("10.00"),
        )
        counting = StockCounting.objects.create(
            counting_number="SC-UPD-1",
            warehouse=wh,
            status=CountingStatus.COMPLETED,
            counting_date=timezone.now().date(),
            counted_by=user,
        )
        item = StockCountingItem.objects.create(
            counting=counting,
            stock_item=stock_item,
            system_quantity=Decimal("5.000"),
            counted_quantity=Decimal("7.000"),
            difference=Decimal("2.000"),
            unit="kg",
        )
        StockCountingService.update_counting_items(
            counting.id,
            [{
                "id": str(item.id),
                "counted_quantity": Decimal("8.000"),
                "notes": "düzeltme",
                "difference_reason": CountingDifferenceReason.CORRECTION,
            }],
        )
        item.refresh_from_db()
        assert item.counted_quantity == Decimal("8.000")
        assert item.notes == "düzeltme"

    def test_stock_counting_update_items_rejected_when_approved(self):
        branch = self._mk_branch()
        user = self._mk_user(branch)
        wh = self._mk_supply_wh(branch, code="CNT-REJ")
        stock_item = StockItem.objects.create(
            name="Say2",
            sku="SAY-2",
            unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
            average_cost=Decimal("10.0000"),
        )
        counting = StockCounting.objects.create(
            counting_number="SC-REJ-1",
            warehouse=wh,
            status=CountingStatus.APPROVED,
            counting_date=timezone.now().date(),
            counted_by=user,
        )
        item = StockCountingItem.objects.create(
            counting=counting,
            stock_item=stock_item,
            system_quantity=Decimal("5.000"),
            counted_quantity=Decimal("5.000"),
            difference=Decimal("0.000"),
            unit="kg",
        )
        with pytest.raises(ValueError):
            StockCountingService.update_counting_items(
                counting.id,
                [{
                    "id": str(item.id),
                    "counted_quantity": Decimal("6.000"),
                    "notes": "",
                    "difference_reason": CountingDifferenceReason.CORRECTION,
                }],
            )

    def test_stock_counting_update_items_accepts_json_float_payload(self):
        branch = self._mk_branch()
        user = self._mk_user(branch)
        wh = self._mk_supply_wh(branch, code="CNT-FLT")
        stock_item = StockItem.objects.create(
            name="Say3",
            sku="SAY-3",
            unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
            average_cost=Decimal("10.0000"),
        )
        counting = StockCounting.objects.create(
            counting_number="SC-FLT-1",
            warehouse=wh,
            status=CountingStatus.IN_PROGRESS,
            counting_date=timezone.now().date(),
            counted_by=user,
        )
        item = StockCountingItem.objects.create(
            counting=counting,
            stock_item=stock_item,
            system_quantity=Decimal("5.000"),
            counted_quantity=Decimal("5.000"),
            difference=Decimal("0.000"),
            unit="kg",
        )
        StockCountingService.update_counting_items(
            counting.id,
            [{
                "id": str(item.id),
                "counted_quantity": 8.5,
                "notes": "",
                "difference_reason": CountingDifferenceReason.CORRECTION,
            }],
        )
        item.refresh_from_db()
        assert item.counted_quantity == Decimal("8.5")
        assert item.difference == Decimal("3.5")

    def test_stock_counting_update_items_accepts_stock_item_id(self):
        branch = self._mk_branch()
        user = self._mk_user(branch)
        wh = self._mk_supply_wh(branch, code="CNT-SID")
        stock_item = StockItem.objects.create(
            name="Say4",
            sku="SAY-4",
            unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
            average_cost=Decimal("10.0000"),
        )
        counting = StockCounting.objects.create(
            counting_number="SC-SID-1",
            warehouse=wh,
            status=CountingStatus.IN_PROGRESS,
            counting_date=timezone.now().date(),
            counted_by=user,
        )
        item = StockCountingItem.objects.create(
            counting=counting,
            stock_item=stock_item,
            system_quantity=Decimal("3.000"),
            counted_quantity=Decimal("3.000"),
            difference=Decimal("0.000"),
            unit="kg",
        )
        StockCountingService.update_counting_items(
            counting.id,
            [{
                "stock_item_id": str(stock_item.id),
                "counted_quantity": 4,
                "notes": "mobil",
                "difference_reason": CountingDifferenceReason.CORRECTION,
            }],
        )
        item.refresh_from_db()
        assert item.counted_quantity == Decimal("4")
        assert item.notes == "mobil"

    def test_stock_counting_approve_waste_creates_waste_movement(self):
        branch = self._mk_branch()
        user = self._mk_user(branch)
        wh = self._mk_supply_wh(branch, code="CNT-WST")
        stock_item = StockItem.objects.create(
            name="Baharat",
            sku="BAH-1",
            unit="g",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
            average_cost=Decimal("10.0000"),
        )
        InventoryService.receive_stock(
            warehouse_id=wh.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("1000.000"),
            reference="Init",
            performed_by=user,
            unit_price=Decimal("10.00"),
        )
        counting = StockCounting.objects.create(
            counting_number="SC-WST-1",
            warehouse=wh,
            status=CountingStatus.COMPLETED,
            counting_date=timezone.now().date(),
            counted_by=user,
        )
        item = StockCountingItem.objects.create(
            counting=counting,
            stock_item=stock_item,
            system_quantity=Decimal("1000.000"),
            counted_quantity=Decimal("895.000"),
            difference=Decimal("-105.000"),
            unit="g",
            difference_reason=CountingDifferenceReason.WASTE,
        )

        StockCountingService.approve_counting(counting.id, user=user)

        from apps.warehouse.models import WarehouseStockLevel

        level = WarehouseStockLevel.objects.get(warehouse=wh, stock_item=stock_item)
        assert level.quantity == Decimal("895.000")

        movement = StockMovement.objects.get(
            warehouse=wh,
            stock_item=stock_item,
            movement_type=StockMovementType.WASTE,
        )
        assert movement.quantity == Decimal("105.000")
        item.refresh_from_db()
        assert item.linked_movement_id == movement.id
        assert "Sayım #SC-WST-1" in movement.notes

    def test_stock_counting_delete_reverses_waste_movement(self):
        branch = self._mk_branch()
        user = self._mk_user(branch)
        wh = self._mk_supply_wh(branch, code="CNT-DEL")
        stock_item = StockItem.objects.create(
            name="SilTest",
            sku="DEL-1",
            unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
            average_cost=Decimal("10.0000"),
        )
        InventoryService.receive_stock(
            warehouse_id=wh.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("50.000"),
            reference="Init",
            performed_by=user,
            unit_price=Decimal("10.00"),
        )
        counting = StockCounting.objects.create(
            counting_number="SC-DEL-1",
            warehouse=wh,
            status=CountingStatus.COMPLETED,
            counting_date=timezone.now().date(),
            counted_by=user,
        )
        StockCountingItem.objects.create(
            counting=counting,
            stock_item=stock_item,
            system_quantity=Decimal("50.000"),
            counted_quantity=Decimal("40.000"),
            difference=Decimal("-10.000"),
            unit="kg",
            difference_reason=CountingDifferenceReason.CANCEL_RETURN,
        )

        StockCountingService.approve_counting(counting.id, user=user)
        movement_id = StockMovement.objects.get(
            warehouse=wh,
            stock_item=stock_item,
            movement_type=StockMovementType.CANCEL,
        ).id

        StockCountingService.delete_counting(counting.id, user=user)

        from apps.warehouse.models import WarehouseStockLevel

        level = WarehouseStockLevel.objects.get(warehouse=wh, stock_item=stock_item)
        assert level.quantity == Decimal("50.000")
        assert not StockMovement.objects.filter(id=movement_id, is_active=True).exists()

    def test_stock_counting_update_items_requires_reason_when_diff(self):
        branch = self._mk_branch()
        user = self._mk_user(branch)
        wh = self._mk_supply_wh(branch, code="CNT-RSN")
        stock_item = StockItem.objects.create(
            name="Neden",
            sku="NDN-1",
            unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
            average_cost=Decimal("10.0000"),
        )
        counting = StockCounting.objects.create(
            counting_number="SC-RSN-1",
            warehouse=wh,
            status=CountingStatus.IN_PROGRESS,
            counting_date=timezone.now().date(),
            counted_by=user,
        )
        item = StockCountingItem.objects.create(
            counting=counting,
            stock_item=stock_item,
            system_quantity=Decimal("10.000"),
            counted_quantity=Decimal("10.000"),
            difference=Decimal("0.000"),
            unit="kg",
        )
        with pytest.raises(ValueError, match="neden"):
            StockCountingService.update_counting_items(
                counting.id,
                [{"id": str(item.id), "counted_quantity": Decimal("8.000"), "notes": ""}],
            )

    def test_commit_reservations_triggers_deficiency_report_on_low_stock(self):
        """
        INGREDIENT modlu bir sipariş tamamlanırken commit_reservations çalışıyorsa,
        stok minimumun altına düşen kalemler için otomatik DeficiencyReport oluşmalıdır.
        Bu, fix-commit-reservations düzeltmesinin entegrasyon testidir.
        """
        from apps.inventory.models import StockReservation, StockReservationStatus
        from apps.inventory.services.stock_reservation_service import StockReservationService

        branch = self._mk_branch()
        kitchen_wh = self._mk_kitchen_wh(branch)
        user = self._mk_user(branch)
        station = self._mk_station(branch, kitchen_wh)

        stock_item = StockItem.objects.create(
            name="Stk-Rez-Test",
            sku="SRT-1",
            unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("5.00"),
        )
        # Mutfak deposuna minimum sınırın biraz üzerinde stok ekle (2.0 kg, min=1.5 kg)
        InventoryService.receive_stock(
            warehouse_id=kitchen_wh.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("2.000"),
            reference="Init",
            performed_by=user,
            unit_price=Decimal("5.00"),
        )
        # Depo stok seviyesine minimum tanımla
        from apps.warehouse.models import WarehouseStockLevel
        level = WarehouseStockLevel.objects.get(warehouse=kitchen_wh, stock_item=stock_item)
        level.minimum_quantity = Decimal("1.500")
        level.save(update_fields=["minimum_quantity"])

        category = Category.objects.create(name="Rez-Kat")
        # Reçete: 1 porsiyon = 1.0 kg (düşümden sonra 1.0 kg kalır → minimum 1.5 kg'nın altında)
        product = self._mk_product_with_recipe(
            category=category,
            name="Rez-Urun",
            stock_item=stock_item,
            ingredient_qty=Decimal("1.000"),
            servings=1,
        )

        # INGREDIENT modlu sipariş oluştur
        order = Order.objects.create(
            branch=branch,
            status=OrderStatus.PENDING,
            total_amount=Decimal("10.00"),
            stock_tracking_mode="INGREDIENT",
        )
        order_item = OrderItem.objects.create(
            order=order,
            product=product,
            quantity=1,
            unit_price=Decimal("10.00"),
            total_price=Decimal("10.00"),
            status=OrderStatus.PENDING,
        )

        # Rezervasyon oluştur (commit_reservations'ın rezervasyon yolunu izlemesi için)
        StockReservation.objects.create(
            order_item=order_item,
            stock_item=stock_item,
            warehouse=kitchen_wh,
            quantity=Decimal("1.000"),
            status=StockReservationStatus.RESERVED,
        )

        # Siparişi tamamla → commit_reservations → _batch_check_low_stock_alerts
        OrderService.complete_order(order, "CASH", user)

        # Otomatik DeficiencyReport oluşmuş olmalı
        report = DeficiencyReport.objects.filter(
            target_warehouse=kitchen_wh,
            status=DeficiencyReportStatus.PENDING,
        ).first()
        assert report is not None, "commit_reservations sonrası otomatik eksik listesi oluşmalıydı"
        assert DeficiencyReportItem.objects.filter(report=report, stock_item=stock_item).exists()

    def test_deficiency_auto_fulfill_creates_transfers_and_updates_report(self):
        branch = self._mk_branch()
        kitchen_wh = self._mk_kitchen_wh(branch)
        supply_wh = self._mk_supply_wh(branch, code="SUP-AF-1")
        user = self._mk_user(branch)
        station = self._mk_station(branch, kitchen_wh)

        stock_item = StockItem.objects.create(
            name="Biber",
            sku="BBR-1",
            unit="kg",
            minimum_quantity=Decimal("0.000"),
            last_purchase_price=Decimal("10.00"),
        )

        InventoryService.receive_stock(
            warehouse_id=supply_wh.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("5.000"),
            reference="Init",
            performed_by=user,
            unit_price=Decimal("10.00"),
        )

        report = DeficiencyReport.objects.create(
            report_number="DR-1",
            kitchen_station=station,
            target_warehouse=kitchen_wh,
            status=DeficiencyReportStatus.PENDING,
            created_by=user,
        )
        DeficiencyReportItem.objects.create(
            report=report,
            stock_item=stock_item,
            quantity=Decimal("3.000"),
            unit="kg",
        )

        transfers = DeficiencyFulfillmentService.auto_fulfill(report.id, user=user)
        assert len(transfers) >= 1

        report.refresh_from_db()
        assert report.status in (DeficiencyReportStatus.APPROVED, DeficiencyReportStatus.COMMITTED)

        # Transfer taslakları oluşturulmuş ve IN_TRANSIT'e alınmış olmalı
        assert WarehouseTransfer.objects.filter(deficiency_report=report).exists()

