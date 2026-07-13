#!/usr/bin/env python3
"""
font-ui-* ve text-muted sınıflarını düzeltme scripti.

Yapılan düzeltmeler:
1. font-ui-bold → font-bold (761 kullanım)
2. font-ui-semibold → font-semibold (709 kullanım)
3. font-ui-medium → font-medium (703 kullanım)
4. font-ui-normal → font-normal (26 kullanım)
5. font-ui-black → font-black (11 kullanım, Tailwind'de black=900)
6. text-muted → text-muted-foreground (1 kullanım, bug)

Kullanım:
  python3 scripts/fix-font-ui-classes.py [--dry-run]
"""

import re
import sys
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent / "src"

# font-ui-* → standart Tailwind font-weight karşılıkları
FONT_UI_MAP = {
    "font-ui-bold": "font-bold",
    "font-ui-semibold": "font-semibold",
    "font-ui-medium": "font-medium",
    "font-ui-normal": "font-normal",
    "font-ui-black": "font-black",
}

# text-muted → text-muted-foreground (bug fix)
TEXT_MUTED_FIX = {
    "text-muted": "text-muted-foreground",
}


def fix_font_ui_classes(content: str) -> tuple[str, list[str]]:
    """font-ui-* sınıflarını standart karşılıklarıyla değiştir."""
    changes = []
    for old, new in FONT_UI_MAP.items():
        # className bağlamında tam eşleşme
        # "font-ui-bold" → "font-bold"
        # Leading space, quote, veya template literal boundry
        pattern = rf'\b{re.escape(old)}\b'
        matches = re.findall(pattern, content)
        if matches:
            content = re.sub(pattern, new, content)
            changes.append(f"  {old} → {new} [{len(matches)}x]")
    return content, changes


def fix_text_muted(content: str) -> tuple[str, list[str]]:
    """text-muted → text-muted-foreground (sadece tam eşleşme)."""
    changes = []
    for old, new in TEXT_MUTED_FIX.items():
        # "text-muted" ama "text-muted-foreground" değil
        # Negative lookbehind/lookahead ile
        pattern = r'(?<!\w)text-muted(?![\w-])'
        matches = re.findall(pattern, content)
        if matches:
            content = re.sub(pattern, new, content)
            changes.append(f"  {old} → {new} [{len(matches)}x]")
    return content, changes


def main():
    dry_run = "--dry-run" in sys.argv

    exclude_dirs = {"node_modules", ".next", "dist", "build", "__pycache__"}

    files_to_process = []
    for ext in {".tsx", ".ts"}:
        for f in ROOT.rglob(f"*{ext}"):
            if not any(d in f.parts for d in exclude_dirs):
                files_to_process.append(f)

    total_files_changed = 0
    all_changes = []

    for filepath in sorted(files_to_process):
        try:
            original = filepath.read_text(encoding="utf-8")
        except Exception:
            continue

        content = original
        file_changes = []

        content, cls_changes = fix_font_ui_classes(content)
        file_changes.extend(cls_changes)

        content, muted_changes = fix_text_muted(content)
        file_changes.extend(muted_changes)

        if content != original:
            total_files_changed += 1
            rel = filepath.relative_to(ROOT.parent.parent)
            all_changes.append((rel, file_changes))

            if not dry_run:
                filepath.write_text(content, encoding="utf-8")

    print(f"\n{'🔍 DRY RUN' if dry_run else '✅ TAMAMLANDI'} — font-ui-* & text-muted Düzeltme Raporu")
    print(f"{'=' * 60}")
    print(f"İşlenen dosya: {len(files_to_process)}")
    print(f"Değişen dosya: {total_files_changed}")
    print(f"{'=' * 60}\n")

    total_by_class = defaultdict(int)
    if all_changes:
        for rel_path, changes in all_changes:
            print(f"📄 {rel_path}")
            for c in changes:
                print(f"   {c}")
                # Parse count
                m = re.search(r'\[(\d+)x\]', c)
                if m:
                    cls = c.strip().split(" → ")[0].strip()
                    total_by_class[cls] += int(m.group(1))
            print()

    if total_by_class:
        print(f"{'=' * 60}")
        print("Özet:")
        for src, count in sorted(total_by_class.items(), key=lambda x: -x[1]):
            print(f"  {src}: {count} kez düzeltildi")
        print(f"  Toplam: {sum(total_by_class.values())} düzeltme")

    if dry_run:
        print(f"\n⚠ Dry run — hiçbir dosya değiştirilmedi.")
        print(f"Gerçekleştirmek için: python3 scripts/fix-font-ui-classes.py")


if __name__ == "__main__":
    main()
