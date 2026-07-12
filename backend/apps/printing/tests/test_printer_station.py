from django.test import TestCase

from apps.branches.models import Branch, KitchenStation
from apps.printing.models import UsageType
from apps.printing.serializers import PrinterSerializer


class PrinterSerializerStationTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Test Şube", code="TST")
        self.other_branch = Branch.objects.create(name="Diğer Şube", code="OTH")
        self.station = KitchenStation.objects.create(
            branch=self.branch,
            name="Ana Mutfak",
            code="ana-mutfak",
        )
        self.other_station = KitchenStation.objects.create(
            branch=self.other_branch,
            name="Bar",
            code="bar",
        )

    def test_kitchen_printer_requires_station_and_template(self):
        serializer = PrinterSerializer(data={
            'branch': str(self.branch.id),
            'name': 'Mutfak Yazıcı',
            'connection_type': 'NETWORK',
            'ip_address': '192.168.1.10',
            'port': 9100,
            'printer_type': 'GENERIC',
            'usage_type': UsageType.KITCHEN,
            'is_active': True,
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn('kitchen_station', serializer.errors)
        self.assertIn('receipt_template_slug', serializer.errors)

    def test_kitchen_printer_valid_with_station_and_template(self):
        serializer = PrinterSerializer(data={
            'branch': str(self.branch.id),
            'name': 'Mutfak Yazıcı',
            'connection_type': 'NETWORK',
            'ip_address': '192.168.1.10',
            'port': 9100,
            'printer_type': 'GENERIC',
            'usage_type': UsageType.KITCHEN,
            'kitchen_station': str(self.station.id),
            'receipt_template_slug': 'kitchen-default',
            'is_active': True,
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        printer = serializer.save()
        self.assertEqual(printer.kitchen_station_id, self.station.id)
        self.assertEqual(printer.receipt_template_slug, 'kitchen-default')

    def test_kitchen_printer_station_must_match_branch(self):
        serializer = PrinterSerializer(data={
            'branch': str(self.branch.id),
            'name': 'Mutfak Yazıcı',
            'connection_type': 'NETWORK',
            'ip_address': '192.168.1.10',
            'port': 9100,
            'printer_type': 'GENERIC',
            'usage_type': UsageType.KITCHEN,
            'kitchen_station': str(self.other_station.id),
            'receipt_template_slug': 'kitchen-default',
            'is_active': True,
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn('kitchen_station', serializer.errors)

    def test_pos_printer_clears_station_fields(self):
        serializer = PrinterSerializer(data={
            'branch': str(self.branch.id),
            'name': 'Kasa Yazıcı',
            'connection_type': 'NETWORK',
            'ip_address': '192.168.1.11',
            'port': 9100,
            'printer_type': 'GENERIC',
            'usage_type': UsageType.POS,
            'kitchen_station': str(self.station.id),
            'receipt_template_slug': 'pos-receipt',
            'is_active': True,
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        printer = serializer.save()
        self.assertIsNone(printer.kitchen_station_id)
        self.assertIsNone(printer.receipt_template_slug)
