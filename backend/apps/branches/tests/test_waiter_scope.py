from django.test import TestCase
from django.contrib.auth import get_user_model
from apps.branches.models import Branch, Zone, Table, TableStatus, WaiterBranchAssignment
from decimal import Decimal

from apps.menu.models import Category, Product
from apps.orders.models import Order, OrderItem, OrderStatus, OrderType
from apps.branches.waiter_scope import (
    eligible_table_ids_for,
    ready_order_items_qs_for_waiter,
    validate_assignment_zone_table_ids,
)

User = get_user_model()

class WaiterScopeTakeawayTest(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Test Branch", code="TB1")
        
        # Create takeaway zone and standard zone
        self.takeaway_zone = Zone.objects.create(
            branch=self.branch, 
            name="Paket Servis", 
            is_takeaway=True
        )
        self.dining_zone = Zone.objects.create(
            branch=self.branch, 
            name="Salon", 
            is_takeaway=False
        )
        
        # Create tables
        self.takeaway_table = Table.objects.create(
            zone=self.takeaway_zone, 
            name="P1", 
            table_number=1, 
            status=TableStatus.FREE
        )
        self.dining_table = Table.objects.create(
            zone=self.dining_zone, 
            name="S1", 
            table_number=2, 
            status=TableStatus.FREE
        )
        
        # Create waiter user
        self.waiter = User.objects.create_user(
            username='waiter', 
            password='password123', 
            email='waiter@test.com'
        )

    def test_validate_assignment_allows_takeaway_zones_and_tables(self):
        # validate_assignment_zone_table_ids should NOT raise ValueError for takeaway zones/tables anymore
        try:
            validate_assignment_zone_table_ids(
                branch_id=self.branch.id,
                zone_ids=[str(self.takeaway_zone.id), str(self.dining_zone.id)],
                table_ids=[str(self.takeaway_table.id), str(self.dining_table.id)]
            )
        except ValueError as e:
            self.fail(f"validate_assignment_zone_table_ids raised ValueError unexpectedly: {e}")

    def test_eligible_table_ids_includes_assigned_takeaway_tables(self):
        # Create assignment with takeaway zone and takeaway table
        assignment = WaiterBranchAssignment.objects.create(
            user=self.waiter,
            branch=self.branch
        )
        assignment.zones.add(self.takeaway_zone)
        assignment.tables.add(self.takeaway_table)
        
        # Get eligible table ids
        allowed_ids = eligible_table_ids_for(self.waiter, self.branch.id)
        
        # Takeaway table should be eligible since the zone and table are explicitly assigned
        self.assertIn(str(self.takeaway_table.id), allowed_ids)


class ReadyForWaiterTakeawayTest(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Test Branch", code="TB2")
        self.takeaway_zone = Zone.objects.create(
            branch=self.branch,
            name="Paket Servis",
            is_takeaway=True,
        )
        self.dining_zone = Zone.objects.create(
            branch=self.branch,
            name="Salon",
            is_takeaway=False,
        )
        self.dining_table = Table.objects.create(
            zone=self.dining_zone,
            name="S1",
            table_number=1,
            status=TableStatus.FREE,
        )
        self.waiter = User.objects.create_user(
            username="waiter_ready",
            password="password123",
            email="waiter_ready@test.com",
        )
        self.category = Category.objects.create(name="Yemek")
        self.product = Product.objects.create(
            category=self.category,
            name="Lahmacun",
            base_price=Decimal("80.00"),
        )

    def _assign_waiter(self, *, zones, tables=None):
        assignment = WaiterBranchAssignment.objects.create(
            user=self.waiter,
            branch=self.branch,
        )
        assignment.zones.set(zones)
        if tables:
            assignment.tables.set(tables)
        return assignment

    def _ready_item(self, *, order_type, table=None, takeaway_zone=None):
        order = Order.objects.create(
            branch=self.branch,
            table=table,
            takeaway_zone=takeaway_zone,
            order_type=order_type,
            status=OrderStatus.READY,
        )
        return OrderItem.objects.create(
            order=order,
            product=self.product,
            quantity=1,
            unit_price=Decimal("80.00"),
            total_price=Decimal("80.00"),
            status=OrderStatus.READY,
        )

    def test_ready_items_include_takeaway_without_table_when_takeaway_zone_assigned(self):
        self._assign_waiter(zones=[self.takeaway_zone])
        item = self._ready_item(
            order_type=OrderType.TAKEAWAY,
            table=None,
            takeaway_zone=self.takeaway_zone,
        )
        ids = set(ready_order_items_qs_for_waiter(self.waiter, self.branch.id).values_list("id", flat=True))
        self.assertIn(item.id, ids)

    def test_ready_items_exclude_takeaway_when_only_dining_zone_assigned(self):
        self._assign_waiter(zones=[self.dining_zone], tables=[self.dining_table])
        takeaway_item = self._ready_item(
            order_type=OrderType.TAKEAWAY,
            table=None,
            takeaway_zone=self.takeaway_zone,
        )
        table_item = self._ready_item(
            order_type=OrderType.TABLE,
            table=self.dining_table,
        )
        ids = set(ready_order_items_qs_for_waiter(self.waiter, self.branch.id).values_list("id", flat=True))
        self.assertIn(table_item.id, ids)
        self.assertNotIn(takeaway_item.id, ids)
