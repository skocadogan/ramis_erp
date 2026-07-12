from decimal import Decimal

from django.test import SimpleTestCase

from core.quantity_format import format_quantity_display, format_signed_quantity_display


class QuantityFormatTests(SimpleTestCase):
    def test_strips_trailing_zeros(self):
        self.assertEqual(format_quantity_display(Decimal('19.000000')), '19')
        self.assertEqual(format_quantity_display(Decimal('895.000000')), '895')
        self.assertEqual(format_quantity_display(Decimal('2.000000')), '2')

    def test_keeps_significant_fractions(self):
        self.assertEqual(format_quantity_display(Decimal('1.5')), '1.5')
        self.assertEqual(format_quantity_display(Decimal('0.125')), '0.125')

    def test_signed_display(self):
        self.assertEqual(format_signed_quantity_display(Decimal('2.000000')), '+2')
        self.assertEqual(format_signed_quantity_display(Decimal('-105.000000')), '-105')
