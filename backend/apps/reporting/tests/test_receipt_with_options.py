from django.test import SimpleTestCase

from apps.reporting.services.receipt_renderer import ReceiptRenderer, _item_modifier_text


class ReceiptWithOptionsTests(SimpleTestCase):
    def test_item_modifier_text_from_string_and_list(self):
        self.assertEqual(
            _item_modifier_text({"modifiers": "Acı Soslu, Karabiberli"}),
            "Acı Soslu, Karabiberli",
        )
        self.assertEqual(
            _item_modifier_text({"modifier_names": ["Acı Soslu", "Karabiberli"]}),
            "Acı Soslu, Karabiberli",
        )

    def test_item_loop_with_options_column(self):
        renderer = ReceiptRenderer(paper_width=48)
        layout = [
            {
                "type": "item_loop",
                "variable": "items",
                "columns": [
                    {"field": "{{ name | with_options }}", "width": 30, "align": "left"},
                    {"field": "qty", "width": 5, "align": "right", "format": "qty"},
                ],
            }
        ]
        context = {
            "items": [
                {
                    "name": "Soslu Patlıcan",
                    "qty": 1,
                    "modifier_names": ["Acı Soslu", "Karabiberli"],
                },
                {"name": "Çoban Salata", "qty": 1},
            ]
        }
        text = renderer.render_to_text(layout, context)
        lines = text.split("\n")
        self.assertTrue(any("Soslu Patlican" in line or "Soslu Patlıcan" in line for line in lines))
        self.assertIn("* Aci Soslu, Karabiberli", lines)
        self.assertTrue(any("Coban Salata" in line or "Çoban Salata" in line for line in lines))
        self.assertEqual(sum(1 for line in lines if line.startswith("* ")), 1)
