import pytest
from decimal import Decimal
from django.utils.translation import gettext as _
from apps.branches.models import Table, TableStatus
from apps.orders.models import Order, OrderStatus
from apps.orders.services import OrderService
from apps.sales.models import Sale
from apps.orders.tasks import auto_close_active_tables_task

@pytest.mark.django_db
class TestAutoCloseActiveTablesTask:
    def test_auto_close_task_completes_orders_and_updates_sales(self, branch, table, product):
        # Create a table order
        items_data = [{
            'product_id': product.id,
            'quantity': 1,
            'unit_price': Decimal('100.00'),
        }]
        order = OrderService.create_order(
            branch_id=branch.id,
            table_id=table.id,
            order_type='TABLE',
            user=None,
            notes='',
            items_data=items_data,
        )
        
        # Verify order and table state
        assert order.status == OrderStatus.PENDING
        table.refresh_from_db()
        assert table.status == TableStatus.OCCUPIED

        # Run task
        res = auto_close_active_tables_task()
        
        # Verify result
        assert res == {"closed_tables_count": 1}
        
        # Verify order state is completed and notes are set
        order.refresh_from_db()
        assert order.status == OrderStatus.COMPLETED
        note_text = _("Sistem tarafından OTOMATİK kapama")
        assert order.notes == note_text
        
        # Verify table state is CLEANING (since OrderService.complete_table puts it to CLEANING)
        table.refresh_from_db()
        assert table.status == TableStatus.CLEANING
        
        # Verify sale is created and notes are set
        sale = Sale.objects.get(order=order)
        assert sale.notes == note_text

    def test_occupied_table_without_active_orders_is_closed(self, branch, table):
        # Directly set table to OCCUPIED
        table.status = TableStatus.OCCUPIED
        table.save()
        
        # Run task
        res = auto_close_active_tables_task()
        
        # Verify result
        assert res == {"closed_tables_count": 1}
        
        # Verify table state is FREE
        table.refresh_from_db()
        assert table.status == TableStatus.FREE
