#!/usr/bin/env bats
# system_utils/install_state.sh için birim testleri.
#
# RAMIS_STATE_FILE geçici bir dosyaya yönlendirilir; gerçek /etc/ramis'e
# dokunulmaz. `chown` root gerektirebilir ama script bunu `|| true` ile tolere
# eder, bu yüzden root olmayan ortamda da güvenle çalışır.

setup() {
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"
    STATE_DIR="$(mktemp -d)"
    export RAMIS_STATE_FILE="${STATE_DIR}/install.conf"

    # install_state.sh çağıran taraftan gelen varsayılanları bekler.
    INSTALL_DIR=/srv/ramis_default
    SYS_USER="$(id -un)"
    INSTALL_LANG=tr
    IP_ONLY_MODE=false
    PG_DB=ramis
    PG_USER=ramis
    RAMIS_VERSION=0.0

    # shellcheck source=../system_utils/install_state.sh
    source "${REPO_ROOT}/system_utils/install_state.sh"
}

teardown() {
    rm -rf "$STATE_DIR"
}

@test "ramis_write_install_state dosyayı 600 izinle yazar" {
    INSTALL_DIR=/opt/ramis_test
    SYS_USER=ramisuser
    PG_DB=ramisdb
    IP_ONLY_MODE=true
    RAMIS_VERSION=9.9

    run ramis_write_install_state
    [ "$status" -eq 0 ]
    [ -f "$RAMIS_STATE_FILE" ]
    [ "$(stat -c %a "$RAMIS_STATE_FILE")" = "600" ]

    run grep -Fx 'INSTALL_DIR=/opt/ramis_test' "$RAMIS_STATE_FILE"
    [ "$status" -eq 0 ]

    run grep -Fx 'SYS_USER=ramisuser' "$RAMIS_STATE_FILE"
    [ "$status" -eq 0 ]

    run grep -Fx 'PG_DB=ramisdb' "$RAMIS_STATE_FILE"
    [ "$status" -eq 0 ]
}

@test "ramis_load_install_state özel INSTALL_DIR/SYS_USER/PG_DB/IP_ONLY_MODE değerlerini geri yükler" {
    cat > "$RAMIS_STATE_FILE" <<'EOF'
# Ramis test state dosyası
RAMIS_STATE_VERSION=1
INSTALL_DIR=/custom/ramis
SYS_USER=customuser
PG_DB=customdb
PG_USER=custompg
IP_ONLY_MODE=true
INSTALL_LANG=en
RAMIS_VERSION=2.5
EOF

    # Önce varsayılan değerlere dön.
    INSTALL_DIR=/default
    SYS_USER=defaultu
    PG_DB=defaultdb
    PG_USER=defaultpg
    IP_ONLY_MODE=false
    INSTALL_LANG=tr

    # Doğrudan çağrılır (run alt kabukta çalışır ve değişken atamaları kaybolur).
    ramis_load_install_state

    [ "$INSTALL_DIR" = "/custom/ramis" ]
    [ "$SYS_USER" = "customuser" ]
    [ "$PG_DB" = "customdb" ]
    [ "$PG_USER" = "custompg" ]
    [ "$IP_ONLY_MODE" = "true" ]
    [ "$INSTALL_LANG" = "en" ]
    [ "$RAMIS_VERSION" = "2.5" ]
}

@test "ramis_load_install_state dosya yoksa 1 döner ve değerleri değiştirmez" {
    rm -f "$RAMIS_STATE_FILE"
    INSTALL_DIR=/original
    SYS_USER=origuser
    PG_DB=origdb

    # `if` içinde çağırmak errexit'i devre dışı bırakır ve atamalar korunur.
    if ramis_load_install_state; then
        status=0
    else
        status=$?
    fi

    [ "$status" -eq 1 ]
    [ "$INSTALL_DIR" = "/original" ]
    [ "$SYS_USER" = "origuser" ]
    [ "$PG_DB" = "origdb" ]
}

@test "state dosyasındaki bilinmeyen anahtar/komut enjeksiyonu çalıştırılmaz" {
    local marker="${STATE_DIR}/pwned"
    printf 'EVIL=1; touch %s\nINSTALL_DIR=/from/inject\n' "$marker" > "$RAMIS_STATE_FILE"

    INSTALL_DIR=/keepme
    ramis_load_install_state

    # Komut enjeksiyonu çalıştırılmamalı.
    [ ! -e "$marker" ]

    # Bilinmeyen anahtar atlanmalı (EVIL hiç atanmamalı).
    [ -z "${EVIL:-}" ]

    # Bilinen anahtar yine de güvenle yüklenmeli.
    [ "$INSTALL_DIR" = "/from/inject" ]
}
