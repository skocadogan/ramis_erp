#!/usr/bin/env bash
# Ramis kurulum durumu (state) yardımcısı.
#
# install.sh kurulum sonunda /etc/ramis/install.conf dosyasını yazar.
# update.sh ve uninstall.sh bu dosyayı okuyarak özelleştirilmiş INSTALL_DIR /
# SYS_USER / PG_DB gibi değerleri öğrenir. Böylece sihirbazda seçilen özel
# dizinlerde de güncelleme/kaldırma doğru çalışır.
#
# Kullanım:
#   # shellcheck source=system_utils/install_state.sh
#   source "${SCRIPT_DIR}/system_utils/install_state.sh"
#   ramis_load_install_state            # dosya varsa değerleri yükler
#   ramis_write_install_state           # mevcut değişkenlerden dosyayı yazar
#
# Desteklenen anahtarlar (mevcut değilse dokunulmaz):
#   RAMIS_STATE_VERSION, INSTALL_DIR, SYS_USER, INSTALL_LANG, IP_ONLY_MODE,
#   API_DOMAIN, APP_DOMAIN, SAME_DOMAIN, PG_DB, PG_USER, RAMIS_VERSION
#
# Not: Dosya `source` edilmez; yalnızca izin verilen anahtarlar ayrıştırılır.
# Bu, ele geçirilmiş bir state dosyasının keyfi kod çalıştırmasını engeller.

RAMIS_STATE_FILE="${RAMIS_STATE_FILE:-/etc/ramis/install.conf}"
RAMIS_STATE_VERSION="1"

# Tek satır + değer içindeki yeni satırları temizler (env güvenliği).
ramis_state_sanitize() {
    printf '%s' "$1" | tr -d '\r\n'
}

# State dosyasına yazılacak `KEY=VALUE` satırı üretir.
ramis_state_line() {
    local key="$1"
    local value="${2:-}"
    printf '%s=%s\n' "$key" "$(ramis_state_sanitize "$value")"
}

# /etc/ramis/install.conf varsa yalnızca bilinen anahtarları yükler.
# Yüklendiyse 0, dosya yoksa 1 döner.
ramis_load_install_state() {
    [[ -f "$RAMIS_STATE_FILE" ]] || return 1

    local line key value
    while IFS= read -r line || [[ -n "$line" ]]; do
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ "$line" == *=* ]] || continue
        key="${line%%=*}"
        value="${line#*=}"
        key="${key//[[:space:]]/}"
        case "$key" in
            INSTALL_DIR)      [[ -n "$value" ]] && INSTALL_DIR="$value" ;;
            SYS_USER)         [[ -n "$value" ]] && SYS_USER="$value" ;;
            INSTALL_LANG)     [[ -n "$value" ]] && INSTALL_LANG="$value" ;;
            IP_ONLY_MODE)     IP_ONLY_MODE="$value" ;;
            API_DOMAIN)       API_DOMAIN="$value" ;;
            APP_DOMAIN)       APP_DOMAIN="$value" ;;
            SAME_DOMAIN)      SAME_DOMAIN="$value" ;;
            PG_DB)            [[ -n "$value" ]] && PG_DB="$value" ;;
            PG_USER)          [[ -n "$value" ]] && PG_USER="$value" ;;
            RAMIS_VERSION)    RAMIS_VERSION="$value" ;;
        esac
    done < "$RAMIS_STATE_FILE"

    return 0
}

# Mevcut değişkenlerden state dosyasını (yeniden) yazar. Atomik + kısıtlı izin.
# Dizin /etc/ramis yoksa oluşturulur. Başarısızsa 1 döner (kritik değildir).
ramis_write_install_state() {
    local state="${1:-$RAMIS_STATE_FILE}"
    local dir
    dir="$(dirname "$state")"

    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir" 2>/dev/null || return 1
    fi

    local tmp
    tmp="$(mktemp "${state}.tmp.XXXXXX")" || return 1
    {
        echo "# Ramis ERP — kurulum durumu (otomatik üretildi)"
        echo "# Bu dosya install.sh tarafından yazılır; update.sh / uninstall.sh okur."
        ramis_state_line "RAMIS_STATE_VERSION" "${RAMIS_STATE_VERSION:-1}"
        ramis_state_line "INSTALL_DIR" "${INSTALL_DIR:-}"
        ramis_state_line "SYS_USER" "${SYS_USER:-}"
        ramis_state_line "INSTALL_LANG" "${INSTALL_LANG:-tr}"
        ramis_state_line "IP_ONLY_MODE" "${IP_ONLY_MODE:-false}"
        ramis_state_line "API_DOMAIN" "${API_DOMAIN:-}"
        ramis_state_line "APP_DOMAIN" "${APP_DOMAIN:-}"
        ramis_state_line "SAME_DOMAIN" "${SAME_DOMAIN:-false}"
        ramis_state_line "PG_DB" "${PG_DB:-ramis}"
        ramis_state_line "PG_USER" "${PG_USER:-ramis}"
        ramis_state_line "RAMIS_VERSION" "${RAMIS_VERSION:-}"
    } > "$tmp" || { rm -f "$tmp"; return 1; }

    local owner="${SYS_USER:-ramis}"
    chown "${owner}:${owner}" "$tmp" 2>/dev/null || true
    chmod 600 "$tmp" 2>/dev/null || true
    mv -f "$tmp" "$state" || { rm -f "$tmp"; return 1; }

    return 0
}
