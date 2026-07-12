from django.test import TestCase
from django.utils import timezone
from apps.branches.models import Branch, Zone, Table, TableStatus
from apps.branches.services import TableService


class TableServiceTest(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Test Branch", code="TB1")
        self.zone = Zone.objects.create(branch=self.branch, name="Test Zone")
        self.table = Table.objects.create(zone=self.zone, name="T1", table_number=1, status=TableStatus.FREE)

    def test_open_table_sets_occupied_status(self):
        table = TableService.open_table(self.table.id)
        self.assertEqual(table.status, TableStatus.OCCUPIED)

    def test_close_table_sets_free_status(self):
        self.table.status = TableStatus.OCCUPIED
        self.table.save()
        table = TableService.close_table(self.table.id)
        self.assertEqual(table.status, TableStatus.FREE)

    def test_close_table_rejected_when_active_order_exists(self):
        from apps.orders.models import Order, OrderStatus
        from decimal import Decimal

        self.table.status = TableStatus.OCCUPIED
        self.table.save()
        Order.objects.create(
            branch=self.branch,
            table=self.table,
            status=OrderStatus.READY,
            total_amount=Decimal("10.00"),
        )
        with self.assertRaises(ValueError):
            TableService.close_table(self.table.id)
        self.table.refresh_from_db()
        self.assertEqual(self.table.status, TableStatus.OCCUPIED)

    def test_start_cleaning_from_free(self):
        table = TableService.start_cleaning(self.table.id)
        self.assertEqual(table.status, TableStatus.CLEANING)
        self.assertIsNotNone(table.cleaning_started_at)

    def test_start_cleaning_rejected_in_takeaway_zone(self):
        takeaway_zone = Zone.objects.create(
            branch=self.branch, name="Paket", is_takeaway=True
        )
        t = Table.objects.create(zone=takeaway_zone, name="P1", table_number=1, status=TableStatus.FREE)
        with self.assertRaises(ValueError):
            TableService.start_cleaning(t.id)

    def test_finish_cleaning_sets_free(self):
        self.table.status = TableStatus.CLEANING
        self.table.cleaning_started_at = timezone.now()
        self.table.save()
        table = TableService.finish_cleaning(self.table.id)
        self.assertEqual(table.status, TableStatus.FREE)
        self.assertIsNone(table.cleaning_started_at)

    def test_cannot_open_out_of_service_table(self):
        self.table.status = TableStatus.OUT_OF_SERVICE
        self.table.save()
        table = TableService.open_table(self.table.id)
        # Should remain OUT_OF_SERVICE
        self.assertEqual(table.status, TableStatus.OUT_OF_SERVICE)

    def test_bulk_create_tables_for_zone(self):
        tables = TableService.bulk_create_for_zone(self.zone.id, count=3, prefix="A")
        self.assertEqual(len(tables), 3)
        self.assertEqual(Table.objects.filter(zone=self.zone).count(), 4) # 1 from setup + 3 new
        
        self.assertTrue(Table.objects.filter(name="A2").exists())

    def test_open_reserved_table_marks_reservation_as_seated(self):
        from apps.reservations.models import Reservation, ReservationStatus
        import datetime
        
        self.table.status = TableStatus.RESERVED
        self.table.reservation_info = "Ahmet Yılmaz"
        self.table.save()
        
        reservation = Reservation.objects.create(
            branch=self.branch,
            table=self.table,
            customer_name="Ahmet Yılmaz",
            party_size=4,
            scheduled_date=datetime.date.today(),
            scheduled_time=datetime.time(19, 0),
            status=ReservationStatus.CONFIRMED
        )
        
        table = TableService.open_table(self.table.id)
        
        self.assertEqual(table.status, TableStatus.OCCUPIED)
        reservation.refresh_from_db()
        self.assertEqual(reservation.status, ReservationStatus.SEATED)
