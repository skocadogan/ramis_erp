#!/usr/bin/env python3
"""
Tüm border-slate-* sınıflarını kaldırır.

Kaldırılan kalıplar:
- border-slate-50 .. border-slate-950
- dark:border-slate-50 .. dark:border-slate-950

Kullanım:
  python3 scripts/remove-border-slate.py [--dry-run]
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "src"

PATTERNS = [
    re.compile(r'\bdark:border-slate-\d+\b'),
    re.compile(r'\bborder-slate-\d+\b'),
]


def clean_class_string(s: str) -> str:
    s = re.sub(r'  +', ' ', s)
    return s.strip()


def process_file(filepath: Path, dry_run: bool) -> list[str]:
    content = filepath.read_text(encoding="utf-8")
    changes = []

    new_content = content
    for pattern in PATTERNS:
        matches = pattern.findall(new_content)
        if matches:
            for m in set(matches):
                changes.append(f"  - {m} ({matches.count(m)}x)")
            new_content = pattern.sub('', new_content)

    if new_content == content:
        return []

    def fix_classname(m):
        val = m.group(1)
        cleaned = clean_class_string(val)
        if cleaned != val:
            return f'className="{cleaned}"'
        return m.group(0)

    new_content = re.sub(r'className="([^"]*)"', fix_classname, new_content)

    def fix_template_classname(m):
        val = m.group(1)
        cleaned = clean_class_string(val)
        if cleaned != val:
            return f'className={{`{cleaned}`}}'
        return m.group(0)

    new_content = re.sub(r'className={`([^`]*)`}', fix_template_classname, new_content)

    if not dry_run:
        filepath.write_text(new_content, encoding="utf-8")

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
    total_removed = 0

    for filepath in sorted(files):
        try:
            content = filepath.read_text(encoding="utf-8")
        except Exception:
            continue

        if "border-slate-" not in content and "dark:border-slate-" not in content:
            continue

        changes = process_file(filepath, dry_run)
        if changes:
            total_changed += 1
            rel = filepath.relative_to(ROOT.parent.parent)
            print(f"📄 {rel}")
            for c in changes:
                print(f"   {c}")
                m = re.search(r'\((\d+)x\)', c)
                if m:
                    total_removed += int(m.group(1))
            print()

    print(f"{'🔍 DRY RUN' if dry_run else '✅ TAMAMLANDI'}")
    print(f"Değişen dosya: {total_changed}  |  Kaldırılan border-slate: ~{total_removed}")

    if dry_run:
        print(f"\n⚠ Dry run — çalıştır: python3 scripts/remove-border-slate.py")


if __name__ == "__main__":
    main()
