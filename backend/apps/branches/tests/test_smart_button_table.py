from django.test import TestCase
from django.urls import reverse

from apps.branches.models import Branch, Table, TableStatus, Zone


class SmartButtonTableViewTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Şube", code="SB1")
        self.zone = Zone.objects.create(branch=self.branch, name="Salon")
        self.table = Table.objects.create(
            zone=self.zone,
            name="Masa 12",
            table_number=12,
            status=TableStatus.FREE,
        )
        self.url = reverse("smart-button-table")

    def test_missing_table_id_returns_400(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 400)

    def test_invalid_uuid_returns_400(self):
        res = self.client.get(
            self.url,
            {"table_id": "52eed3c8-9631-4616-81c6-005726f9cc6"},
        )
        self.assertEqual(res.status_code, 400)

    def test_unknown_table_returns_404(self):
        res = self.client.get(
            self.url,
            {"table_id": "00000000-0000-0000-0000-000000000000"},
        )
        self.assertEqual(res.status_code, 404)

    def test_returns_table_name(self):
        res = self.client.get(self.url, {"table_id": str(self.table.id)})
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["table_id"], str(self.table.id))
        self.assertEqual(body["table_name"], "Masa 12")
        self.assertEqual(body["zone_name"], "Salon")
