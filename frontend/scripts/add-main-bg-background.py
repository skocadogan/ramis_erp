#!/usr/bin/env python3
"""
<main> tag'lerine bg-background ekler.

Kural:
- <main className="..."> → className içine bg-background ekler (yoksa)
- <main> (className yoksa) → yeni className="bg-background" ekler
- zaten bg-background varsa dokunmaz
- bg-zinc-*, bg-white, bg-* gibi özel arka plan varsa atlar

Kullanım:
  python3 scripts/add-main-bg-background.py [--dry-run]
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "src"


def process_file(filepath: Path, dry_run: bool) -> list[str]:
    lines = filepath.read_text(encoding="utf-8").splitlines(keepends=True)
    changes = []
    result = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # <main ...> tek satırda bitiyor mu?
        main_match = re.search(r'<main\b', line)
        if not main_match:
            result.append(line)
            i += 1
            continue

        # Tag'in kalanını topla (> kadar)
        tag_lines = [line]
        tag_text = line
        while ">" not in tag_text.split("<main", 1)[-1] and i + 1 < len(lines):
            i += 1
            tag_lines.append(lines[i])
            tag_text += lines[i]

        full_tag = "".join(tag_lines)

        # className var mı?
        cls_match = re.search(r'className="([^"]*)"', full_tag)
        if cls_match:
            class_value = cls_match.group(1)
            # Zaten bg-background varsa
            if "bg-background" in class_value:
                result.extend(tag_lines)
                i += 1
                continue
            # Özel bg-* sınıfı varsa atla (bg-zinc-100, bg-white vb.)
            if re.search(r'\bbg-(?!background)\S+', class_value):
                result.extend(tag_lines)
                i += 1
                continue
            # bg-background ekle
            new_value = class_value.rstrip() + " bg-background"
            new_tag = full_tag[:cls_match.start(1)] + new_value + full_tag[cls_match.end(1):]
            result.append(new_tag)
            changes.append(f"  className=\"{class_value.strip()}\" → \"{new_value.strip()}\"")
        else:
            # className yok → <main紧接着> yerine <main className="bg-background">
            new_tag = full_tag.replace("<main", '<main className="bg-background"', 1)
            result.append(new_tag)
            changes.append("  + className=\"bg-background\" (yeni)")

        i += 1

    if changes and not dry_run:
        filepath.write_text("".join(result), encoding="utf-8")

    return changes


def main():
    dry_run = "--dry-run" in sys.argv
    exclude_dirs = {"node_modules", ".next", "dist", "build", "__pycache__"}

    files = []
    for ext in {".tsx", ".ts"}:
        for f in ROOT.rglob(f"*{ext}"):
            if not any(d in f.parts for d in exclude_dirs):
                files.append(f)

    total_changed = 0
    total_main_tags = 0

    for filepath in sorted(files):
        try:
            content = filepath.read_text(encoding="utf-8")
        except Exception:
            continue

        count = len(re.findall(r'<main\b', content))
        if count == 0:
            continue

        total_main_tags += count
        changes = process_file(filepath, dry_run)
        if changes:
            total_changed += 1
            rel = filepath.relative_to(ROOT.parent.parent)
            print(f"📄 {rel}")
            for c in changes:
                print(f"   {c}")
            print()

    print(f"{'🔍 DRY RUN' if dry_run else '✅ TAMAMLANDI'}")
    print(f"Toplam <main>: {total_main_tags}  |  Değişen dosya: {total_changed}")

    if dry_run:
        print(f"\n⚠ Dry run — çalıştır: python3 scripts/add-main-bg-background.py")


if __name__ == "__main__":
    main()
