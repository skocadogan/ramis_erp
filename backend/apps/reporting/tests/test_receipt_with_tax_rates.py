from decimal import Decimal

from django.test import SimpleTestCase

from apps.reporting.services.receipt_renderer import (
    ReceiptRenderer,
    _item_line_gross,
    _item_line_net,
    _item_line_tax,
    _item_modifier_text,
    _sum_items_gross,
    _sum_items_tax,
)


class ReceiptWithTaxRatesTests(SimpleTestCase):
    def test_item_tax_from_inclusive_price(self):
        item = {"price": 165, "qty": 1, "tax_rate": 10}
        self.assertEqual(_item_line_gross(item), Decimal("150.00"))
        self.assertEqual(_item_line_tax(item), Decimal("15.00"))

    def test_modifier_price_in_line_and_options_text(self):
        item = {
            "price": 240,
            "qty": 1,
            "tax_rate": 20,
            "modifier_entries": [
                {"name": "Aci Sos", "price": 0},
                {"name": "Ekstra Aci", "price": 20},
            ],
        }
        self.assertEqual(_item_line_net(item), Decimal("260.00"))
        self.assertEqual(_item_line_gross(item), Decimal("216.67"))
        self.assertIn("(+20)", _item_modifier_text(item))

    def test_subtotal_gross_and_total_net_with_modifiers(self):
        renderer = ReceiptRenderer(paper_width=48)
        layout = [
            {
                "type": "item_loop",
                "columns": [
                    {"field": "{{ name | with_options | with_tax_rates }}", "width": 22, "align": "left"},
                    {"field": "qty", "width": 5, "align": "right", "format": "qty"},
                    {"field": "price", "width": 12, "align": "right", "format": "currency"},
                ],
            },
            {"type": "key_value", "left": "Alt Toplam:", "right": "{{ subtotal | currency }}"},
            {"type": "key_value", "left": "KDV:", "right": "{{ tax | currency }}"},
            {"type": "key_value", "left": "Toplam:", "right": "{{ total | currency }}"},
        ]
        items = [
            {"name": "Mercimek Corbasi", "qty": 1, "price": 300, "tax_rate": 20},
            {
                "name": "Tavuk Suyu Corba",
                "qty": 1,
                "price": 240,
                "tax_rate": 20,
                "modifier_entries": [
                    {"name": "Aci Sos", "price": 0},
                    {"name": "Ekstra Aci", "price": 20},
                ],
            },
        ]
        text = renderer.render_to_text(layout, {"items": items})
        gross = _sum_items_gross(items)
        tax = _sum_items_tax(items)
        net = sum(_item_line_net(i) for i in items)
        self.assertEqual(gross, Decimal("466.67"))
        self.assertEqual(tax, Decimal("93.33"))
        self.assertEqual(net, Decimal("560.00"))
        self.assertIn("466,67 TL", text)
        self.assertIn("93,33 TL", text)
        self.assertIn("560,00 TL", text)
        self.assertIn("(+20)", text)
        self.assertIn("200,00 TL", text)

    def test_item_loop_with_tax_rates_and_options(self):
        renderer = ReceiptRenderer(paper_width=48)
        layout = [
            {
                "type": "item_loop",
                "variable": "items",
                "columns": [
                    {"field": "{{ name | with_options | with_tax_rates }}", "width": 22, "align": "left"},
                    {"field": "qty", "width": 5, "align": "right", "format": "qty"},
                    {"field": "price", "width": 12, "align": "right", "format": "currency"},
                ],
            },
            {"type": "key_value", "left": "KDV:", "right": "{{ tax | currency }}"},
        ]
        context = {
            "items": [
                {
                    "name": "Mercimek Çorbası",
                    "qty": 1,
                    "price": 165,
                    "tax_rate": 10,
                    "modifier_names": ["Ekstra Soslu"],
                },
                {"name": "Americano", "qty": 2, "price": 50, "tax_rate": 20},
            ]
        }
        text = renderer.render_to_text(layout, context)
        lines = text.split("\n")
        self.assertTrue(any("150,00 TL" in line for line in lines))
        self.assertTrue(any(line.startswith("* ") for line in lines))
        self.assertTrue(any("% 10" in line and "15,00 TL" in line for line in lines))
        self.assertTrue(any(line.startswith("KDV:") for line in lines))

    def test_tax_without_rate_uses_item_sum(self):
        renderer = ReceiptRenderer(paper_width=48)
        layout = [
            {
                "type": "item_loop",
                "columns": [
                    {"field": "{{ name | with_tax_rates }}", "width": 30, "align": "left"},
                    {"field": "price", "width": 12, "align": "right", "format": "currency"},
                ],
            },
            {"type": "key_value", "left": "KDV:", "right": "{{ tax | currency }}"},
        ]
        items = [{"name": "Test", "qty": 1, "price": 110, "tax_rate": 10}]
        text = renderer.render_to_text(layout, {"items": items})
        self.assertIn("10,00 TL", text)
