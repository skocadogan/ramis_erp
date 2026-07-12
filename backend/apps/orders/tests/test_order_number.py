"""Sipariş numarası tahsis birim testleri."""

from datetime import date
from unittest.mock import patch

from django.test import TestCase

from apps.branches.models import Branch, BranchOrderCounter
from apps.orders.order_number import allocate_branch_order_number


class OrderNumberTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Test", code="test-num")

    def test_db_fallback_allocates_sequential_numbers(self):
        day = date(2026, 5, 26)
        with patch("apps.orders.order_number.cache.incr", side_effect=Exception("no cache")):
            n1 = allocate_branch_order_number(self.branch.id, day)
            n2 = allocate_branch_order_number(self.branch.id, day)
        self.assertEqual(n1, "#1")
        self.assertEqual(n2, "#2")
        row = BranchOrderCounter.objects.get(branch_id=self.branch.id, date=day)
        self.assertEqual(row.last_number, 2)
