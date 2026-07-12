#!/usr/bin/env python3
"""
Dialog/modal dosyalarındaki arka plan renk uyumsuzluklarını düzeltir.

Sorun: DialogContent `bg-background` (sıcak taş tonu) kullanırken iç bölümlerde
`bg-card` (saf beyaz), `bg-muted/30`, `bg-muted/50` gibi farklı token'lar
görsel tutarsızlık yaratır.

Kullanım:
  python frontend/scripts/fix_modal_dialog_colors.py          # dry-run
  python frontend/scripts/fix_modal_dialog_colors.py --apply  # dosyaları güncelle
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

FRONTEND_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = FRONTEND_ROOT / "src"

INCLUDE_GLOBS = (
    "**/*Modal*.tsx",
    "**/*Dialog*.tsx",
    "**/modal-overlay/**/*.tsx",
)

EXCLUDE_REL_PATHS = {
    "components/ui/card.tsx",
    "components/ui/table.tsx",
    "components/ui/badge.tsx",
    "components/ui/async-state.tsx",
}

# Glob desenine uymayan ama footer/token kaynağı olan dosyalar
EXTRA_FILES = (
    SRC_ROOT / "components/ui/dialog.tsx",
    SRC_ROOT / "components/ui/alert-dialog.tsx",
)

# Sıra önemli: daha spesifik desenler önce
REPLACEMENTS: tuple[tuple[str, str], ...] = (
    ("bg-muted/30", "bg-background"),
    ("bg-muted/50", "bg-background"),
    ("bg-card/50", "bg-background"),
    ("bg-card", "bg-background"),
    ("text-card-foreground", "text-foreground"),
)

DIALOG_FOOTER_BG_PATTERN = re.compile(
    r"(<DialogFooter\b[^>]*className=\{?\"([^\"]*?)\"?\}?[^>]*>)"
)

DIALOG_FOOTER_CN_PATTERN = re.compile(
    r"(<DialogFooter\b[^>]*className=\{cn\(\s*\"([^\"]*?)\")"
)


def collect_target_files() -> list[Path]:
    files: set[Path] = set()
    for pattern in INCLUDE_GLOBS:
        for path in SRC_ROOT.glob(pattern):
            rel = path.relative_to(SRC_ROOT).as_posix()
            if rel in EXCLUDE_REL_PATHS:
                continue
            if path.is_file():
                files.add(path)
    for path in EXTRA_FILES:
        if path.is_file():
            files.add(path)
    return sorted(files)


def apply_replacements(content: str) -> tuple[str, list[str]]:
    changes: list[str] = []
    updated = content

    for old, new in REPLACEMENTS:
        if old not in updated:
            continue
        count = updated.count(old)
        updated = updated.replace(old, new)
        changes.append(f"  {old!r} → {new!r} ({count}x)")

    updated, footer_changes = ensure_dialog_footer_background(updated)
    changes.extend(footer_changes)

    return updated, changes


def ensure_dialog_footer_background(content: str) -> tuple[str, list[str]]:
    changes: list[str] = []

    def patch_footer_class(class_value: str) -> str | None:
        if "bg-background" in class_value:
            return None
        if "border-t" not in class_value and "DialogFooter" not in class_value:
            return None
        return f"{class_value} bg-background".strip()

    def repl_double_quote(match: re.Match[str]) -> str:
        full = match.group(0)
        classes = match.group(2)
        patched = patch_footer_class(classes)
        if not patched:
            return full
        changes.append("  DialogFooter className → bg-background eklendi")
        return full.replace(f'"{classes}"', f'"{patched}"', 1)

    updated = DIALOG_FOOTER_BG_PATTERN.sub(repl_double_quote, content)

    def repl_cn(match: re.Match[str]) -> str:
        full = match.group(0)
        classes = match.group(2)
        patched = patch_footer_class(classes)
        if not patched:
            return full
        changes.append("  DialogFooter cn(...) → bg-background eklendi")
        return full.replace(f'"{classes}"', f'"{patched}"', 1)

    updated = DIALOG_FOOTER_CN_PATTERN.sub(repl_cn, updated)

    return updated, changes


def process_file(path: Path, apply: bool) -> list[str]:
    original = path.read_text(encoding="utf-8")
    updated, changes = apply_replacements(original)
    if not changes or updated == original:
        return []

    rel = path.relative_to(FRONTEND_ROOT).as_posix()
    header = [f"{rel}:"]
    header.extend(changes)

    if apply:
        path.write_text(updated, encoding="utf-8")

    return header


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Değişiklikleri dosyalara yaz (varsayılan: dry-run)",
    )
    args = parser.parse_args()

    targets = collect_target_files()
    all_reports: list[str] = []

    for path in targets:
        report = process_file(path, apply=args.apply)
        if report:
            all_reports.extend(report)
            all_reports.append("")

    if not all_reports:
        print("Değiştirilecek dosya bulunamadı.")
        return 0

    mode = "UYGULANDI" if args.apply else "DRY-RUN"
    print(f"[{mode}] {len([r for r in all_reports if r.endswith(':')])} dosya güncellenecek:\n")
    print("\n".join(all_reports))

    if not args.apply:
        print("\nUygulamak için: python frontend/scripts/fix_modal_dialog_colors.py --apply")
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
