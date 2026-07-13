#!/usr/bin/env python3
"""
Font token düzeltme scripti.

Yapılan düzeltmeler:
1. Dead Tailwind sınıfları: font-size-* → text-*, font-weight-ui-* → geçerli karşılıklar
2. Hardcoded text-[Npx] → semantic token'lar
3. text-[0.8rem] → text-ui-sm

Kullanım:
  python3 scripts/fix-font-tokens.py [--dry-run]
"""

import re
import os
import sys
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent / "src"

# ---------------------------------------------------------------------------
# 1. Dead class düzeltmeleri (Tailwind v4'te çalışmayan sınıflar)
# ---------------------------------------------------------------------------
DEAD_CLASS_MAP = {
    "font-size-2xs": "text-2xs",
    "font-size-sub": "text-sub",
    "font-size-ui-sm": "text-ui-sm",
    "font-size-xs": "text-xs",
    "font-size-ui": "text-ui",
    "font-weight-ui-thin": "font-light",
    "font-weight-ui-normal": "font-normal",
    "font-weight-ui-medium": "font-medium",
    "font-weight-ui-semibold": "font-semibold",
    "font-weight-ui-bold": "font-bold",
}

# ---------------------------------------------------------------------------
# 2. Hardcoded text-[Npx] → semantic token dönüşüm haritası
# ---------------------------------------------------------------------------
PX_TO_TOKEN = {
    "8px": "4xs",     # 0.5rem
    "9px": "3xs",     # 0.5625rem
    "10px": "2xs",    # 0.625rem
    "11px": "sub",    # 0.6875rem
    "12px": "xs",     # 0.75rem (Tailwind text-xs default)
    "13px": "ui-sm",  # 0.8125rem
    "14px": "xs",     # 0.875rem (Tailwind text-xs = 0.75rem ama projede --font-size-xs = 0.875rem)
    "15px": "ui",     # ~0.9375rem, close to 1rem — use text-ui or keep as arbitrary
}

# text-[14px] özel durum: projede --font-size-xs = 0.875rem = 14px
# text-xs (Tailwind default) = 0.75rem = 12px → bu eşleşmez
# text-sm (Tailwind default) = 0.875rem = 14px → bu eşleşir
# Ama projede --font-size-xs = 0.875rem de var. text-xs kullanılırsa Tailwind'in
# kendi text-xs'i (0.75rem) devreye girer. O halde text-[14px] → text-sm yapmalıyız
# çünkü Tailwind text-sm = 0.875rem = 14px.
# Ancak bu projede semantic token'lar @theme inline ile tanımlı ve text-xs = ?
# Kontrol: @theme inline'da --text-xs tanımlı mı? Hayır, --text-2xs, --text-sub,
# --text-ui-sm, --text-ui var ama --text-xs yok.
# Demek ki text-xs → Tailwind'in default'u (0.75rem = 12px) olur.
# text-[14px] için doğru karşılık: text-sm (Tailwind default, 0.875rem)
# Ama projede semantic --font-size-xs = 0.875rem var. Bunu da bir utility'ye
# bağlamak lazım. Ancak @theme inline'a --text-xs eklemek Tailwind'in kendi
# text-xs'ini override eder. Bu durumda mevcut text-xs kullanımını (1051 adet)
# etkiler. Bu yüzden text-[14px] için text-sm kullanmak daha güvenli.

# Nihai harita:
PX_TO_TOKEN_FINAL = {
    "8px":  ("text-4xs", "~0.5rem"),
    "9px":  ("text-3xs", "~0.5625rem"),
    "10px": ("text-2xs", "0.625rem"),
    "11px": ("text-sub", "0.6875rem"),
    "12px": ("text-xs",  "0.75rem (Tailwind default)"),
    "13px": ("text-ui-sm", "0.8125rem"),
    "14px": ("text-sm",  "0.875rem (Tailwind default)"),
    "15px": ("text-sm",  "~0.9375rem → closest: text-sm 0.875rem"),
}

# text-[0.8rem] → text-ui-sm (0.8125rem ≈ 0.8rem)
REM_SPECIAL = {
    "0.8rem": "text-ui-sm",
}

# ---------------------------------------------------------------------------
# Fix dead classes in className strings
# ---------------------------------------------------------------------------
def fix_dead_classes(content: str) -> list[str]:
    """Dead Tailwind sınıflarını düzelt. Değişiklik listesi döndür."""
    changes = []
    for dead, alive in DEAD_CLASS_MAP.items():
        # className içinde tam eşleşme: "font-size-2xs" → "text-2xs"
        # Leading/trailing space veya boundry kontrolü
        pattern = rf'(?<!\w){re.escape(dead)}(?!\w)'
        new_content = re.sub(pattern, alive, content)
        if new_content != content:
            count = len(re.findall(pattern, content))
            changes.append(f"  {dead} → {alive} ({count}x)")
            content = new_content
    return content, changes

# ---------------------------------------------------------------------------
# Fix hardcoded text-[Npx] → semantic token
# ---------------------------------------------------------------------------
def fix_hardcoded_px(content: str) -> list[str]:
    """text-[Npx] değerlerini semantic token'lara dönüştür."""
    changes = []
    for px_val, (token, desc) in PX_TO_TOKEN_FINAL.items():
        # text-[10px] veya text-[10px] (tailwind arbitrary)
        pattern = rf'text-\[{re.escape(px_val)}\]'
        matches = re.findall(pattern, content)
        if matches:
            content = re.sub(pattern, token, content)
            changes.append(f"  text-[{px_val}] → {token} ({desc}) [{len(matches)}x]")
    return content, changes

# ---------------------------------------------------------------------------
# Fix text-[0.8rem] → text-ui-sm
# ---------------------------------------------------------------------------
def fix_hardcoded_rem(content: str) -> list[str]:
    changes = []
    for rem_val, token in REM_SPECIAL.items():
        pattern = rf'text-\[{re.escape(rem_val)}\]'
        matches = re.findall(pattern, content)
        if matches:
            content = re.sub(pattern, token, content)
            changes.append(f"  text-[{rem_val}] → {token} [{len(matches)}x]")
    return content, changes

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    dry_run = "--dry-run" in sys.argv

    # Dead class ve hardcoded px sadece TSX/TS dosyalarına uygulanır.
    # CSS/SCSS dosyalarında --font-size-* tanımları var, onları bozmamalıyız.
    code_extensions = {".tsx", ".ts"}
    exclude_dirs = {"node_modules", ".next", "dist", "build", "__pycache__"}

    files_to_process = []
    for ext in code_extensions:
        for f in ROOT.rglob(f"*{ext}"):
            if not any(d in f.parts for d in exclude_dirs):
                files_to_process.append(f)

    total_files_changed = 0
    total_changes = defaultdict(int)
    all_changes = []

    for filepath in sorted(files_to_process):
        try:
            original = filepath.read_text(encoding="utf-8")
        except Exception as e:
            print(f"  ⚠ Okunamadı: {filepath} — {e}")
            continue

        content = original
        file_changes = []

        # 1. Dead classes
        content, cls_changes = fix_dead_classes(content)
        file_changes.extend(cls_changes)

        # 2. Hardcoded px
        content, px_changes = fix_hardcoded_px(content)
        file_changes.extend(px_changes)

        # 3. Hardcoded rem
        content, rem_changes = fix_hardcoded_rem(content)
        file_changes.extend(rem_changes)

        if content != original:
            total_files_changed += 1
            rel = filepath.relative_to(ROOT.parent.parent)
            all_changes.append((rel, file_changes))

            if not dry_run:
                filepath.write_text(content, encoding="utf-8")

            for c in file_changes:
                # Parse count from pattern [Nx]
                m = re.search(r'\[(\d+)x\]', c)
                if m:
                    total_changes[c.strip().split(" → ")[0].strip()] += int(m.group(1))

    # Report
    print(f"\n{'🔍 DRY RUN' if dry_run else '✅ TAMAMLANDI'} — Font Token Düzeltme Raporu")
    print(f"{'=' * 60}")
    print(f"İşlenen dosya sayısı: {len(files_to_process)}")
    print(f"Değişen dosya sayısı: {total_files_changed}")
    print(f"{'=' * 60}\n")

    if all_changes:
        for rel_path, changes in all_changes:
            print(f"📄 {rel_path}")
            for c in changes:
                print(f"   {c}")
            print()
    else:
        print("Hiç değişiklik yapılmadı — tüm değerler zaten doğru.\n")

    if total_changes:
        print(f"{'=' * 60}")
        print("Özet:")
        for src, count in sorted(total_changes.items(), key=lambda x: -x[1]):
            print(f"  {src}: {count} kez düzeltildi")

    if dry_run:
        print(f"\n⚠ Dry run modunda — hiçbir dosya değiştirilmedi.")
        print(f"Gerçek değiştirmek için: python3 scripts/fix-font-tokens.py")


if __name__ == "__main__":
    main()
