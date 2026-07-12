#!/usr/bin/env python3
"""
django.po -> django.mo derlemesi (polib). GNU gettext msgfmt kurulu değilse kullanılır.

Kullanım (backend kökünden):
  python scripts/compile_locale_mo.py
"""

from pathlib import Path

import polib


def main() -> None:
    base = Path(__file__).resolve().parent.parent / "locale"
    if not base.is_dir():
        raise SystemExit(f"locale directory not found: {base}")
    for po_path in sorted(base.glob("*/LC_MESSAGES/django.po")):
        po = polib.pofile(str(po_path))
        mo_path = po_path.with_suffix(".mo")
        po.save_as_mofile(str(mo_path))
        print(f"Wrote {mo_path}")


if __name__ == "__main__":
    main()
