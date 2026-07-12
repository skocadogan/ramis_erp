#!/usr/bin/env python3
"""
Envanter/FEFO tablolarında kullanılan tema uyumlu tablo stillerini diğer tablolara taşır.

Hedef kalıp (ApproximateCost / FEFO / Envanter tabloları):
  - Container: rounded-lg border border-border (slate/beyaz zemin yok)
  - thead: bg-muted text-muted-foreground, font-ui-medium, px-4 py-2
  - Satırlar: border-b border-border hover:bg-muted/20
  - Loader: text-emerald-600

Kullanım:
  python frontend/scripts/fix_table_theme_styles.py --files src/features/allergens/components/AllergensTable.tsx
  python frontend/scripts/fix_table_theme_styles.py --files src/features/allergens/components/AllergensTable.tsx --apply
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

FRONTEND_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = FRONTEND_ROOT / "src"

INVENTORY_TABLE_HEAD_CLASS = (
    "sticky top-0 z-10 border-b border-border bg-muted text-muted-foreground"
)

INVENTORY_TABLE_ROW_CLASS = (
    "[&_tbody_tr]:border-b [&_tbody_tr]:border-border "
    "[&_tbody_tr]:transition-colors [&_tbody_tr]:hover:bg-muted/20"
)

INVENTORY_TABLE_HEAD_OVERRIDE = (
    "[&_thead]:bg-muted [&_thead]:text-muted-foreground "
    "[&_thead_tr]:bg-muted [&_thead_th]:bg-muted"
)

# Sıra önemli: daha spesifik desenler önce
REPLACEMENTS: tuple[tuple[str, str], ...] = (
    (
        "import { VirtualTable, virtualTableStickyHeadClass } from \"@/components/ui/virtual-table\"",
        "import { VirtualTable } from \"@/components/ui/virtual-table\"",
    ),
    (
        "className={virtualTableStickyHeadClass}",
        f'className="{INVENTORY_TABLE_HEAD_CLASS}"',
    ),
    (
        "bg-white rounded-lg border border-border flex-1 min-h-0 dark:bg-slate-900 dark:border-slate-700",
        "flex-1 min-h-0 rounded-lg border border-border",
    ),
    (
        "flex flex-col flex-1 min-h-0 min-w-0 rounded-lg border border-border bg-white dark:border-slate-700 dark:bg-slate-900",
        "flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-border",
    ),
    (
        "flex flex-col min-h-0 min-w-0 flex-1 overflow-auto rounded-lg border border-border bg-white dark:border-slate-700 dark:bg-slate-900",
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-auto rounded-lg border border-border",
    ),
    (
        "bg-slate-50 border-b border-border dark:bg-slate-800 dark:border-slate-700 sticky top-0 z-10",
        "sticky top-0 z-10 bg-muted text-muted-foreground",
    ),
    (
        "text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground",
        "font-ui-medium",
    ),
    (
        "text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider",
        "font-ui-medium",
    ),
    ("px-4 py-2.5", "px-4 py-2"),
    ("px-3 py-2", "px-4 py-2"),
    ("hover:text-slate-700 dark:hover:text-slate-200", "hover:text-foreground"),
    ("text-slate-300 dark:text-slate-600", "text-muted-foreground/60"),
    ("dark:text-slate-400", "text-muted-foreground"),
    ("dark:text-slate-200", "text-foreground"),
    ("hover:bg-slate-100 text-muted-foreground hover:text-blue-600 dark:hover:bg-slate-800",
     "text-muted-foreground hover:bg-muted/20 hover:text-foreground"),
    ("animate-spin text-blue-600", "animate-spin text-emerald-600"),
    ("h-8 w-8 animate-spin text-blue-600", "h-8 w-8 animate-spin text-emerald-600"),
    (
        "border-2 border-blue-600 border-t-transparent",
        "border-2 border-emerald-600 border-t-transparent",
    ),
)


def resolve_files(patterns: list[str]) -> list[Path]:
    files: set[Path] = set()
    for pattern in patterns:
        path = Path(pattern)
        if path.is_absolute():
            candidate = path
        elif pattern.startswith("src/"):
            candidate = FRONTEND_ROOT / pattern
        else:
            candidate = SRC_ROOT / pattern

        if candidate.is_file():
            files.add(candidate.resolve())
            continue

        for match in candidate.parent.glob(candidate.name):
            if match.is_file():
                files.add(match.resolve())

    return sorted(files)


def patch_virtual_table_classname(content: str) -> tuple[str, list[str]]:
    changes: list[str] = []
    needle = 'tableClassName="w-full text-sm"'
    replacement = (
        f'tableClassName="w-full text-sm {INVENTORY_TABLE_ROW_CLASS} {INVENTORY_TABLE_HEAD_OVERRIDE}"'
    )
    if needle in content and INVENTORY_TABLE_ROW_CLASS not in content:
        content = content.replace(needle, replacement, 1)
        changes.append("tableClassName → tema satır/thead override eklendi")

    needle2 = 'tableClassName="text-sm"'
    replacement2 = f'tableClassName="text-sm {INVENTORY_TABLE_ROW_CLASS} {INVENTORY_TABLE_HEAD_OVERRIDE}"'
    if needle2 in content and INVENTORY_TABLE_ROW_CLASS not in content:
        content = content.replace(needle2, replacement2, 1)
        changes.append("tableClassName → tema satır/thead override eklendi")

    return content, changes


def dedupe_tailwind_tokens(content: str) -> str:
    """Yinelenen ardışık utility sınıflarını temizler (ör. text-muted-foreground text-muted-foreground)."""
    for _ in range(3):
        updated = re.sub(
            r"\b([\w:\/\[\]-]+)\s+\1\b",
            r"\1",
            content,
        )
        if updated == content:
            break
        content = updated
    return content


def apply_replacements(content: str) -> tuple[str, list[str]]:
    changes: list[str] = []
    updated = content

    for old, new in REPLACEMENTS:
        if old not in updated:
            continue
        count = updated.count(old)
        updated = updated.replace(old, new)
        changes.append(f"{old[:60]}… → ({count}x)")

    updated, vt_changes = patch_virtual_table_classname(updated)
    changes.extend(vt_changes)

    deduped = dedupe_tailwind_tokens(updated)
    if deduped != updated:
        changes.append("Yinelenen Tailwind sınıfları temizlendi")
        updated = deduped

    return updated, changes


def main() -> int:
    parser = argparse.ArgumentParser(description="Tablo tema stillerini toplu güncelle")
    parser.add_argument(
        "--files",
        nargs="+",
        required=True,
        help="Dosya yolu veya glob (örn. src/features/allergens/components/AllergensTable.tsx)",
    )
    parser.add_argument("--apply", action="store_true", help="Dosyaları gerçekten yaz")
    args = parser.parse_args()

    targets = resolve_files(args.files)
    if not targets:
        print("Hedef dosya bulunamadı.", file=sys.stderr)
        return 1

    total_changes = 0
    for path in targets:
        rel = path.relative_to(FRONTEND_ROOT)
        original = path.read_text(encoding="utf-8")
        updated, changes = apply_replacements(original)

        if not changes:
            print(f"[skip] {rel} — değişiklik yok")
            continue

        print(f"[{'apply' if args.apply else 'dry-run'}] {rel}")
        for change in changes:
            print(f"  - {change}")

        if args.apply:
            path.write_text(updated, encoding="utf-8")
            total_changes += len(changes)

    if args.apply:
        print(f"\nTamamlandı: {total_changes} değişiklik uygulandı.")
    else:
        print("\nDry-run bitti. Uygulamak için --apply ekleyin.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
