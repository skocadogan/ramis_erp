"""ReceiptRenderer ESC/POS stil normalleştirme testleri."""
from escpos.printer import Dummy
from PIL import Image

from apps.reporting.services.receipt_renderer import (
    ReceiptRenderer,
    _align_logo_on_paper,
    _coerce_align,
    _coerce_bool,
    _flatten_logo_for_thermal,
    _logo_to_escpos_bitmap,
)


class TestEscposCoercion:
    def test_coerce_bool_strings(self):
        assert _coerce_bool("true") is True
        assert _coerce_bool("false") is False
        assert _coerce_bool("1") is True
        assert _coerce_bool(0) is False

    def test_coerce_align_invalid_falls_back(self):
        assert _coerce_align("CENTER", "left") == "center"
        assert _coerce_align("bogus", "right") == "right"

    def test_block_to_escpos_accepts_string_bold(self):
        renderer = ReceiptRenderer(32)
        device = Dummy()
        layout = [{"type": "text", "content": "Test", "bold": "true"}]
        renderer.render_to_escpos(layout, {}, device)
        device.close()


class TestLogoImagePrep:
    def test_flatten_transparent_background_becomes_white(self):
        img = Image.new("RGBA", (20, 20), (0, 0, 0, 0))
        draw_area = Image.new("RGBA", (10, 10), (0, 0, 0, 255))
        img.paste(draw_area, (5, 5))
        flat = _flatten_logo_for_thermal(img)
        assert flat.getpixel((0, 0)) == (255, 255, 255)
        assert flat.getpixel((10, 10)) == (0, 0, 0)

    def test_align_logo_center_on_paper(self):
        logo = Image.new("1", (100, 20), 0)
        canvas = _align_logo_on_paper(logo, 384, "center")
        assert canvas.size == (384, 20)
        assert canvas.getpixel((0, 0)) == 1
        assert canvas.getpixel((142, 10)) == 0
        assert canvas.getpixel((250, 10)) == 1

    def test_logo_escpos_pipeline_uses_white_canvas(self, tmp_path):
        logo_path = tmp_path / "logo.png"
        img = Image.new("RGBA", (80, 40), (0, 0, 0, 0))
        mark = Image.new("RGBA", (40, 20), (0, 0, 0, 255))
        img.paste(mark, (20, 10))
        img.save(logo_path)

        renderer = ReceiptRenderer(32)
        flat = _flatten_logo_for_thermal(Image.open(logo_path))
        bit = _logo_to_escpos_bitmap(flat, 80)
        aligned = _align_logo_on_paper(bit, 384, "center")
        assert aligned.getpixel((0, 0)) == 1
        assert aligned.getpixel((192, 20)) == 0
