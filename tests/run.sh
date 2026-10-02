#!/usr/bin/env bash
# Ramis ERP — Bash kod kalitesi çalıştırıcısı.
#
# Yaptıkları (root GEREKTİRMEZ):
#   1. Tüm ana betikler için `bash -n` (sözdizimi) kontrolü
#   2. `--help` / `--version` çıktılarının exit 0 dönmesi
#   3. bats kuruluysa `tests/*.bats`; değilse uyarı verip atla
#
# CI: .github/workflows/scripts-ci.yml bu betiği çağırır.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Renkler yalnızca TTY'de (CI loglarını kirletmemek için).
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; NC=''
fi

PASS=0
FAIL=0
SKIP=0

ok()      { printf '  %b✓%b %s\n' "$GREEN" "$NC" "$*"; PASS=$((PASS + 1)); }
bad()     { printf '  %b✗%b %s\n' "$RED" "$NC" "$*"; FAIL=$((FAIL + 1)); }
skip()    { printf '  %b-%b %s\n' "$YELLOW" "$NC" "$*"; SKIP=$((SKIP + 1)); }
section() { printf '\n%b%s%b\n' "${BOLD}${CYAN}" "$*" "$NC"; }

cd "$REPO_ROOT"

# ── 1) Sözdizimi kontrolü (bash -n) ──────────────────────────────────
section "Sözdizimi kontrolü (bash -n)"

mapfile -t sh_files < <(
    {
        printf '%s\n' install.sh update.sh uninstall.sh install_i18n.sh
        find system_utils -name '*.sh'
    } | LC_ALL=C sort
)

syntax_fail=0
for f in "${sh_files[@]}"; do
    if [[ ! -f "$f" ]]; then
        bad "Bulunamadı: $f"
        syntax_fail=1
        continue
    fi
    if err="$(bash -n "$f" 2>&1)"; then
        ok "$f"
    else
        bad "Sözdizimi hatası: $f"
        printf '%s\n' "$err" | sed 's/^/      /'
        syntax_fail=1
    fi
done

# ── 2) --help / --version (root gerektirmez) ─────────────────────────
section "Yardım/sürüm çıktıları (root gerektirmez)"

cli_fail=0
run_cli() {
    local out rc
    if out="$(bash "$@" 2>&1)"; then
        ok "bash $*"
    else
        rc=$?
        bad "bash $* (exit ${rc})"
        printf '%s\n' "$out" | sed 's/^/      /' | head -20
        cli_fail=1
    fi
}

run_cli update.sh --help
run_cli update.sh --version
run_cli uninstall.sh --help
run_cli uninstall.sh --version
run_cli install.sh --help
run_cli install.sh --version

# ── 3) bats testleri ─────────────────────────────────────────────────
section "bats testleri"

bats_fail=0
if command -v bats >/dev/null 2>&1; then
    if bats tests/; then
        ok "bats tests/"
    else
        bad "bats tests/"
        bats_fail=1
    fi
else
    skip "bats kurulu değil — tests/*.bats atlandı (CI'da kurulup çalıştırılır)"
fi

# ── Özet ─────────────────────────────────────────────────────────────
section "Özet"
printf '  %d geçti, %d başarısız, %d atlandı\n' "$PASS" "$FAIL" "$SKIP"

if [[ $((syntax_fail + cli_fail + bats_fail)) -ne 0 ]]; then
    printf '  %bKod kalitesi kontrolleri BAŞARISIZ%b\n' "$RED" "$NC"
    exit 1
fi

printf '  %bTüm kontroller başarılı%b\n' "$GREEN" "$NC"
exit 0
