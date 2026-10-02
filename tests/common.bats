#!/usr/bin/env bats
# system_utils/common.sh içindeki yardımcı fonksiyonlar için birim testleri.
#
# Not: common.sh bir kütüphanedir; çağıran scriptlerin tanımladığı renk/log
# değişkenlerini ve `die()` fonksiyonunu bekler. Bu yüzden source etmeden önce
# bunları burada tanımlıyoruz.

setup() {
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"

    # Çağıran taraftan gelen renk sembolleri (common.sh bunları olduğu gibi kullanır).
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    DIM='\033[2m'
    NC='\033[0m'
    CHECK='✓'
    CROSS='✗'
    WARN='‼'
    INFO='·'

    # Çağıran taraftan gelen değişkenler.
    LOG_FILE="$(mktemp)"
    INSTALL_LANG=tr
    INSTALL_DIR=/tmp/ramis-test
    SYS_USER="$(id -un)"
    RAMIS_ASSUME_YES=false

    # `_env_set` hata yolunda `die` çağırır; çağıran tarafta bu şekilde tanımlıdır.
    die() { echo "$*" >&2; return 1; }

    # shellcheck source=../system_utils/common.sh
    source "${REPO_ROOT}/system_utils/common.sh"
}

teardown() {
    rm -f "$LOG_FILE"
    if [[ -n "${TMP_ENV_FILE:-}" ]]; then
        rm -f "$TMP_ENV_FILE"
    fi
}

@test "trim_space baştaki ve sondaki boşlukları kırpar" {
    run trim_space "   hello world   "
    [ "$status" -eq 0 ]
    [ "$output" = "hello world" ]
}

@test "trim_space yalnızca boşluktan oluşan girişi boşaltır" {
    run trim_space "     "
    [ "$status" -eq 0 ]
    [ "$output" = "" ]
}

@test "env_single_line satır sonu karakterlerini temizler" {
    run env_single_line $'abc\r\ndef\r\n'
    [ "$status" -eq 0 ]
    [ "$output" = "abcdef" ]
}

@test "_sed_replacement_escape & | ve \\ karakterlerini kaçışlar" {
    run _sed_replacement_escape 'a&b|c\d'
    [ "$status" -eq 0 ]
    [ "$output" = 'a\&b\|c\\d' ]
}

@test "_env_set yeni anahtar ekler" {
    TMP_ENV_FILE="$(mktemp)"
    printf 'EXIST=1\n' > "$TMP_ENV_FILE"

    run _env_set "$TMP_ENV_FILE" NEWKEY 'v&x|y'
    [ "$status" -eq 0 ]

    run grep -Fx 'NEWKEY=v&x|y' "$TMP_ENV_FILE"
    [ "$status" -eq 0 ]
}

@test "_env_set mevcut anahtarı & ve | içeren değerle güvenle günceller" {
    TMP_ENV_FILE="$(mktemp)"
    printf 'FOO=old\n' > "$TMP_ENV_FILE"

    run _env_set "$TMP_ENV_FILE" FOO 'a&b|c'
    [ "$status" -eq 0 ]

    # Değer birebir yazılmalı (kaçış karakterleri sızmamalı).
    run grep -Fx 'FOO=a&b|c' "$TMP_ENV_FILE"
    [ "$status" -eq 0 ]

    # Yalnızca tek bir FOO satırı kalmalı.
    [ "$(grep -c '^FOO=' "$TMP_ENV_FILE")" -eq 1 ]
}

@test "_env_ensure_default yorum satırını açar" {
    TMP_ENV_FILE="$(mktemp)"
    printf '#FOO=bar\n' > "$TMP_ENV_FILE"

    run _env_ensure_default "$TMP_ENV_FILE" FOO "baz"
    [ "$status" -eq 0 ]

    run grep -Fx 'FOO=baz' "$TMP_ENV_FILE"
    [ "$status" -eq 0 ]
}

@test "_env_ensure_default anahtar zaten aktifse 1 döner ve dokunmaz" {
    TMP_ENV_FILE="$(mktemp)"
    printf 'FOO=existing\n' > "$TMP_ENV_FILE"

    run _env_ensure_default "$TMP_ENV_FILE" FOO "yeni"
    [ "$status" -eq 1 ]

    run grep -Fx 'FOO=existing' "$TMP_ENV_FILE"
    [ "$status" -eq 0 ]
}

@test "_is_ipv4 geçerli adresleri kabul eder" {
    run _is_ipv4 192.168.1.1
    [ "$status" -eq 0 ]

    run _is_ipv4 0.0.0.0
    [ "$status" -eq 0 ]

    run _is_ipv4 255.255.255.255
    [ "$status" -eq 0 ]
}

@test "_is_ipv4 geçersiz adresleri reddeder" {
    run _is_ipv4 256.0.0.1
    [ "$status" -eq 1 ]

    run _is_ipv4 999.1.1.1
    [ "$status" -eq 1 ]

    run _is_ipv4 1.2.3
    [ "$status" -eq 1 ]

    run _is_ipv4 abc
    [ "$status" -eq 1 ]
}

@test "RAMIS_ASSUME_YES=true iken confirm_yn stdin okumadan 0 döner" {
    RAMIS_ASSUME_YES=true

    run confirm_yn "Devam edilsin mi?"
    [ "$status" -eq 0 ]
}

@test "ramis_disable_colors renk değişkenlerini boşaltır" {
    # Semboller sade kalır, renk kodları temizlenir.
    RED='X'; GREEN='X'; YELLOW='X'; BLUE='X'
    CYAN='X'; BOLD='X'; DIM='X'; NC='X'

    ramis_disable_colors

    [ -z "$RED" ]
    [ -z "$GREEN" ]
    [ -z "$YELLOW" ]
    [ -z "$BLUE" ]
    [ -z "$CYAN" ]
    [ -z "$BOLD" ]
    [ -z "$DIM" ]
    [ -z "$NC" ]
    [ -n "$CHECK" ]
}
