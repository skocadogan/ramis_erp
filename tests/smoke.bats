#!/usr/bin/env bats
# Duman (smoke) testleri: ana betiklerin sözdizimi ve temel CLI davranışı.
#
# Root GEREKTİRMEZ: --help / --version root kontrolünden önce çalışır.
# Çakışan bayraklar (`--purge-all --keep-data`) ise root kontrolünden önce
# hata verip exit 1 döner.

setup() {
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"
    cd "$REPO_ROOT"
}

@test "bash -n tüm ana scriptler için geçer" {
    local f
    local files=(install.sh update.sh uninstall.sh install_i18n.sh)
    while IFS= read -r f; do
        files+=("$f")
    done < <(find system_utils -name '*.sh' | sort)

    for f in "${files[@]}"; do
        run bash -n "$f"
        if [ "$status" -ne 0 ]; then
            echo "Sözdizimi hatası: $f" >&2
            echo "$output" >&2
            return 1
        fi
    done
}

@test "update.sh --version çıktısı sürüm içerir" {
    run bash update.sh --version
    [ "$status" -eq 0 ]
    [[ "$output" == *v* ]]
}

@test "install.sh --help exit 0 döner" {
    run bash install.sh --help
    [ "$status" -eq 0 ]
}

@test "uninstall.sh --help exit 0 döner" {
    run bash uninstall.sh --help
    [ "$status" -eq 0 ]
}

@test "uninstall.sh --purge-all --keep-data çakışma nedeniyle exit 1 döner" {
    run bash uninstall.sh --purge-all --keep-data
    [ "$status" -eq 1 ]
}
