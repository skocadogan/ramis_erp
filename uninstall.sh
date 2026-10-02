#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════╗
# ║  Ramis  — Kurulum Kaldırma Scripti                                   ║
# ║  Kullanım: sudo bash uninstall.sh                                    ║
# ║  Servisleri, konfigürasyonları ve opsiyonel olarak verileri kaldırır ║
# ╚══════════════════════════════════════════════════════════════════════╝
set -euo pipefail

# ── Renkler ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

CHECK="${GREEN}✓${NC}"
WARN="${YELLOW}‼${NC}"
INFO="${BLUE}·${NC}"

# ── Script dizini ve kurulum durumu (state) ──────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=system_utils/common.sh
source "${SCRIPT_DIR}/system_utils/common.sh"
# shellcheck source=system_utils/install_state.sh
source "${SCRIPT_DIR}/system_utils/install_state.sh"
# shellcheck source=system_utils/uninstall_i18n.sh
source "${SCRIPT_DIR}/system_utils/uninstall_i18n.sh"

# ── Global değişkenler ────────────────────────────────────────────────
INSTALL_DIR="/srv/ramis_erp"
SYS_USER="ramis"
PG_DB="ramis"
PG_USER="ramis"

LOG_DIR="/var/log/ramis"
LOG_FILE="${LOG_DIR}/uninstall.log"

# ── Kaldırma kapsamı ve UX bayrakları (argümanlarla değiştirilir) ─────
PURGE_ALL="false"
KEEP_DATA="false"
RAMIS_VERSION="${RAMIS_VERSION:-1.0}"
RAMIS_DRY_RUN="${RAMIS_DRY_RUN:-false}"

# ── Yardımcı fonksiyonlar ────────────────────────────────────────────

die()     { echo ""; echo -e "  ${RED}✗  $*${NC}"; log "FAIL: $*"; echo ""; exit 1; }

section() {
    echo ""
    echo -e "${CYAN}  ──────────────────────────────────────────────────────────────────────${NC}"
    echo -e "  ${DIM}$1${NC}  ${BOLD}$2${NC}"
    echo -e "${CYAN}  ──────────────────────────────────────────────────────────────────────${NC}"
    echo ""
}

# install.sh ile yazılan backend.env değerlerini oku (silmeden önce; source etmeden — parola genişlemesi yok)
normalize_pg_name() {
    local s="$1"
    s=$(printf '%s' "$s" | tr -d '\r\n')
    s="${s#"${s%%[![:space:]]*}"}"
    s="${s%"${s##*[![:space:]]}"}"
    case "$s" in
        \"*\") s="${s#\"}"; s="${s%\"}" ;;
        \'*\') s="${s#\'}"; s="${s%\'}" ;;
    esac
    printf '%s' "$s"
}

load_postgres_config() {
    PG_DB="ramis"
    PG_USER="ramis"
    local env_file="/etc/ramis/backend.env"
    local raw_db raw_user
    [[ -f "$env_file" ]] || return 0
    raw_db=$(grep -E '^POSTGRES_DB=' "$env_file" 2>/dev/null | cut -d= -f2- | head -1 || true)
    raw_user=$(grep -E '^POSTGRES_USER=' "$env_file" 2>/dev/null | cut -d= -f2- | head -1 || true)
    [[ -n "$raw_db" ]] && PG_DB=$(normalize_pg_name "$raw_db")
    [[ -n "$raw_user" ]] && PG_USER=$(normalize_pg_name "$raw_user")
}

is_pg_identifier() {
    local name
    name=$(normalize_pg_name "$1")
    # tr_TR.UTF-8: bash [[ a-zA-Z ]] ASCII'yi reddedebilir; grep + LC_ALL=C güvenli
    printf '%s' "$name" | LC_ALL=C grep -qxE '[a-zA-Z_][a-zA-Z0-9_]*'
}

sanitize_pg_name_or_die() {
    local label="$1"
    local value
    value=$(normalize_pg_name "$2")
    if ! is_pg_identifier "$value"; then
        die "Geçersiz ${label}: $(printf '%q' "$value") — yalnızca harf, rakam ve alt çizgi kullanılabilir."
    fi
    printf '%s' "$value"
}

# Aktif bağlantıları kes → veritabanı → OWNED BY → rol (install.sh ters kurulum için tam temizlik)
remove_postgresql_ramis() {
    local pg_db pg_user
    local failed=false

    pg_db=$(sanitize_pg_name_or_die "veritabanı adı" "$1")
    pg_user=$(sanitize_pg_name_or_die "kullanıcı adı" "$2")

    if ! command -v psql &>/dev/null; then
        warn "psql bulunamadı; PostgreSQL adımı atlandı."
        return 0
    fi

    if ! sudo -u postgres pg_isready -q 2>/dev/null; then
        warn "PostgreSQL çalışmıyor; '${pg_db}' / '${pg_user}' elle kontrol edin."
        return 0
    fi

    info "Aktif '${pg_db}' bağlantıları sonlandırılıyor…"
    sudo -u postgres psql -d postgres -v ON_ERROR_STOP=0 -c \
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${pg_db}' AND pid <> pg_backend_pid();" \
        >/dev/null 2>&1 || true

    if sudo -u postgres psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${pg_db}'" 2>/dev/null | grep -q 1; then
        info "Veritabanı '${pg_db}' siliniyor…"
        if ! sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE \"${pg_db}\";"; then
            warn "Veritabanı '${pg_db}' silinemedi."
            failed=true
        fi
    else
        info "Veritabanı '${pg_db}' zaten yok."
    fi

    if sudo -u postgres psql -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='${pg_user}'" 2>/dev/null | grep -q 1; then
        info "'${pg_user}' kullanıcısına ait kalan nesneler temizleniyor…"
        sudo -u postgres psql -d postgres -v ON_ERROR_STOP=0 -c "DROP OWNED BY \"${pg_user}\" CASCADE;" \
            >/dev/null 2>&1 || true
        info "Kullanıcı '${pg_user}' siliniyor…"
        if ! sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "DROP ROLE \"${pg_user}\";"; then
            warn "Kullanıcı '${pg_user}' silinemedi."
            failed=true
        fi
    else
        info "Kullanıcı '${pg_user}' zaten yok."
    fi

    if [[ "$failed" == "true" ]]; then
        warn "PostgreSQL temizliği kısmen başarısız — sudo -u postgres psql ile kontrol edin."
        return 1
    fi

    success "PostgreSQL: '${pg_db}' veritabanı ve '${pg_user}' rolü kaldırıldı."
    return 0
}

# ── Yardım / sürüm / argüman ayrıştırma ──────────────────────────────

show_help() {
    ramis_maybe_disable_colors
    echo ""
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo -e "  ${BOLD}$(_L unins_help_title "RAMIS ERP · Kurulumu kaldırma")${NC}  ${DIM}$(_L unins_help_help "yardım")${NC}"
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BOLD}$(_L unins_help_usage "Kullanım")${NC}  ${DIM}$(_L unins_help_from_root "proje kök dizininden:")${NC}"
    echo -e "    ${BOLD}sudo bash uninstall.sh${NC} ${DIM}$(_L unins_help_option_word "[seçenek]")${NC}"
    echo ""
    echo -e "  ${BOLD}$(_L unins_help_options "Seçenekler")${NC}"
    echo ""
    echo "    -y, --yes         $(_L unins_help_yes "Tüm onay sorularını otomatik 'evet' kabul et.")"
    echo "    --quiet           $(_L unins_help_quiet "Bilgi/başarı satırlarını gizle (uyarılar görünür kalır).")"
    echo "    --no-color        $(_L unins_help_no_color "Renkli çıktıyı kapat.")"
    echo "    --dry-run         $(_L unins_help_dry_run "Hiçbir şeyi silmeden yapılacakları özetle.")"
    echo "    --purge-all       $(_L unins_help_purge_all "Veritabanı, kurulum dizini, günlükler ve sistem kullanıcısı dahil hepsini kaldır (varsayılan yanıt: evet).")"
    echo "    --keep-data       $(_L unins_help_keep_data "Veritabanı, kurulum dizini, günlükler ve kullanıcıyı koru; yalnızca servis/config/nginx kaldır.")"
    echo "    --version         $(_L unins_help_version "Sürüm bilgisini yazdır ve çık.")"
    echo "    -h, --help        $(_L unins_help_h "Bu metni göster.")"
    echo ""
    echo -e "  ${DIM}$(_L unins_help_log "Ayrıntılı günlük:") ${LOG_FILE}${NC}"
    echo ""
}

# --purge-all: veri/kullanıcı soruları varsayılan 'evet'; aksi halde mevcut 'hayır'.
_scope_default() {
    if [[ "${PURGE_ALL:-false}" == "true" ]]; then printf 'e'; else printf 'h'; fi
}

show_dry_run() {
    section "$(_L unins_dry_run_title "Kuru çalıştırma (dry-run)")" "$(_L unins_dry_run_sub "Hiçbir değişiklik yapılmaz")"

    echo -e "  ${BOLD}$(_L unins_dry_run_will_remove "Kaldırılacak öğeler:")${NC}"
    echo "    - $(_L unins_dry_services "Tüm ramis-* systemd servisleri (durdur + devre dışı)")"
    echo "    - $(_L unins_dry_units "/etc/systemd/system/ramis-*.service birim dosyaları")"
    echo "    - $(_L unins_dry_nginx "Ramis Nginx site dosyaları (sites-available + sites-enabled)")"
    echo "    - $(_L unins_dry_etcramis "/etc/ramis ortam/state dosyaları")"
    echo "    - $(_L unins_dry_udev "ESC/POS udev kuralı (/etc/udev/rules.d/99-escpos.rules)")"
    echo "    - $(_L unins_dry_desktop "Masaüstü / autostart girdileri")"
    echo "    - $(_L unins_dry_ufw "Ramis için eklenen UFW kuralları (onay verilirse)")"
    echo ""

    local pg_state dir_state log_state user_state
    if [[ "$KEEP_DATA" == "true" && "$PURGE_ALL" != "true" ]]; then
        pg_state="$(_L unins_dry_pg_kept "PostgreSQL veritabanı + rol: KORUNUR")"
        dir_state="$(_L unins_dry_dir_kept "Kurulum dizini: KORUNUR")"
        log_state="$(_L unins_dry_logs_kept "Günlükler: KORUNUR")"
        user_state="$(_L unins_dry_user_kept "Sistem kullanıcısı: KORUNUR")"
    elif [[ "$PURGE_ALL" == "true" ]]; then
        pg_state="$(_L unins_dry_pg_removed "PostgreSQL veritabanı + rol: KALDIRILIR")"
        dir_state="$(_L unins_dry_dir_removed "Kurulum dizini: KALDIRILIR")"
        log_state="$(_L unins_dry_logs_removed "Günlükler: KALDIRILIR")"
        user_state="$(_L unins_dry_user_removed "Sistem kullanıcısı: KALDIRILIR")"
    else
        pg_state="$(_L unins_dry_pg_ask "PostgreSQL veritabanı + rol: sorulacak")"
        dir_state="$(_L unins_dry_dir_ask "Kurulum dizini: sorulacak")"
        log_state="$(_L unins_dry_logs_ask "Günlükler: sorulacak")"
        user_state="$(_L unins_dry_user_ask "Sistem kullanıcısı: sorulacak")"
    fi

    echo -e "  ${BOLD}$(_L unins_dry_run_data "Veri ve kullanıcı:")${NC}"
    echo "    - ${pg_state}  (${PG_DB} / ${PG_USER})"
    echo "    - ${dir_state}  (${INSTALL_DIR})"
    echo "    - ${log_state}  (/var/log/ramis)"
    echo "    - ${user_state}  (${SYS_USER})"
    echo ""

    echo -e "  ${YELLOW}${BOLD}$(_L unins_dry_run_note "DRY-RUN: hiçbir değişiklik yapılmadı")${NC}"
    log "DRY-RUN: hiçbir değişiklik yapılmadı"
    echo ""
    return 0
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -y|--yes)      RAMIS_ASSUME_YES="true"; shift ;;
            --quiet)       RAMIS_QUIET="true"; shift ;;
            --no-color)    RAMIS_NO_COLOR="true"; shift ;;
            --dry-run)     RAMIS_DRY_RUN="true"; shift ;;
            --purge-all)   PURGE_ALL="true"; shift ;;
            --keep-data)   KEEP_DATA="true"; shift ;;
            --version)
                echo "Ramis ERP uninstall.sh v${RAMIS_VERSION}"
                exit 0
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                die "$(_L unins_err_unknown_option "Bilinmeyen seçenek"): $1  (yardım: sudo bash uninstall.sh --help)"
                ;;
        esac
    done

    if [[ "$PURGE_ALL" == "true" && "$KEEP_DATA" == "true" ]]; then
        die "$(_L unins_err_purge_keep_conflict "--purge-all ile --keep-data birlikte kullanılamaz (biri veriyi siler, diğeri korur).")"
    fi
}

# ══════════════════════════════════════════════════════════════════════
# ANA AKIŞ
# ══════════════════════════════════════════════════════════════════════

main() {
    # Argümanlar root kontrolünden ÖNCE ayrıştırılır (--help/--version root istemez).
    parse_args "$@"
    ramis_maybe_disable_colors

    # Dil: state dosyasından yüklenmişse korunur; aksi halde varsayılan tr.
    # confirm_yn (common.sh) ve _L bu değişkeni `set -u` altında güvenle okur.
    INSTALL_LANG="${INSTALL_LANG:-tr}"

    echo ""
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo -e "  ${BOLD}$(_L unins_banner_title "RAMIS ERP · Kurulumu kaldır")${NC}"
    echo -e "  ${DIM}$(_L unins_banner_desc "Uygulama servisleri, Nginx site dosyaları ve ortam yapılandırması kaldırılır.")${NC}"
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo ""

    if [[ $EUID -ne 0 ]]; then
        die "$(_L unins_root_required "Bu betik yönetici yetkisiyle çalıştırılmalıdır: sudo bash uninstall.sh")"
    fi

    # Günlük dizini (kurulumda /var/log/ramis altındaki kayıtları silmeden önce aç)
    mkdir -p "$LOG_DIR" 2>/dev/null || true

    # Daha önce yazılan kurulum durumunu oku; özel INSTALL_DIR/SYS_USER/PG_DB
    # gibi değerleri al. State yoksa varsayılanlar korunur.
    ramis_load_install_state || true
    INSTALL_LANG="${INSTALL_LANG:-tr}"
    log "=== Ramis kaldırma işlemi başladı ==="

    # backend.env kaynaklı hedefler (herhangi bir silme işleminden önce).
    load_postgres_config

    # --dry-run: hiçbir durdurma/silme yapmadan ne yapılacağını özetle ve çık.
    if [[ "$RAMIS_DRY_RUN" == "true" ]]; then
        show_dry_run
        return 0
    fi

    warn "$(_L unins_intro_warn "Bu işlem sunucudan Ramis uygulamasını kaldırır; veritabanı ve proje dosyaları isteğinize bağlı silinir.")"
    echo ""
    if ! confirm_yn "$(_L unins_confirm_continue "Kaldırmaya devam edilsin mi?")" "$(_scope_default)"; then
        echo -e "  ${DIM}$(_L unins_cancelled "İşlem iptal edildi.")${NC}"
        echo ""
        exit 0
    fi
    echo ""

    section "$(_L unins_sec1 "1 · Servisler")" "$(_L unins_sec1_sub "Duraklatılıyor")"
    info "$(_L unins_sec1_info_stop "Tüm ramis-* systemd birimleri durduruluyor ve devre dışı bırakılıyor…")"
    # Sabit listeye güvenme: /etc/systemd/system/ramis-*.service glob'u
    # ramis-worker-pdf ve çoklu Daphne/Uvicorn port birimlerini de kapsar.
    local unit unit_file
    local -a unit_files=()
    shopt -s nullglob
    unit_files=(/etc/systemd/system/ramis-*.service)
    shopt -u nullglob
    if [[ ${#unit_files[@]} -eq 0 ]]; then
        info "$(_L unins_sec1_info_none "/etc/systemd/system içinde Ramis birim dosyası bulunamadı.")"
    fi
    for unit_file in "${unit_files[@]}"; do
        unit="$(basename "$unit_file")"
        systemctl stop "$unit" 2>/dev/null || true
        systemctl disable "$unit" 2>/dev/null || true
        systemctl reset-failed "$unit" 2>/dev/null || true
    done
    success "$(_L unins_sec1_ok "Ramis systemd birimleri durduruldu ve devre dışı bırakıldı")"

    section "$(_L unins_sec2 "2 · Systemd")" "$(_L unins_sec2_sub "Birim dosyaları siliniyor")"
    for unit_file in "${unit_files[@]}"; do
        unit="$(basename "$unit_file")"
        rm -f "$unit_file"
        info "$(_L unins_sec2_info_removed "Birim dosyası silindi"): ${unit}"
    done
    systemctl daemon-reload 2>/dev/null || true
    systemctl reset-failed 2>/dev/null || true
    success "$(_L unins_sec2_ok "/etc/systemd/system içindeki Ramis birim tanımları kaldırıldı")"

    section "$(_L unins_sec3 "3 · Nginx")" "$(_L unins_sec3_sub "Site yapılandırması")"
    rm -f /etc/nginx/sites-enabled/ramis.conf
    rm -f /etc/nginx/sites-enabled/ramis-api.conf
    rm -f /etc/nginx/sites-enabled/ramis-app.conf
    rm -f /etc/nginx/sites-available/ramis.conf
    rm -f /etc/nginx/sites-available/ramis-api.conf
    rm -f /etc/nginx/sites-available/ramis-app.conf

    if nginx -t 2>/dev/null; then
        systemctl reload nginx 2>/dev/null || true
    fi
    success "$(_L unins_sec3_ok "Ramis Nginx site dosyaları kaldırıldı (nginx paketi kurulu kalır)")"

    section "$(_L unins_sec4 "4 · PostgreSQL")" "$(_L unins_sec4_sub "Veritabanı ve uygulama rolü")"

    if [[ "$KEEP_DATA" == "true" && "$PURGE_ALL" != "true" ]]; then
        info "$(_L unins_keepdata_pg "--keep-data: PostgreSQL veritabanı ve kullanıcı korundu.")"
    else
        warn "$(_L unins_sec4_warn "Sıfır kurulum için Ramis veritabanı ve DB kullanıcısının tamamen kaldırılması önerilir.")"
        echo ""
        info "$(_L unins_sec4_info_target "backend.env kaynaklı hedef: veritabanı='${PG_DB}', kullanıcı='${PG_USER}'")"
        echo ""

        if confirm_yn "$(_L unins_q_pg_remove "PostgreSQL veritabanını ve kullanıcı rolünü tamamen silmek istiyor musunuz?")" "e"; then
            local pg_db pg_user input_db input_user
            pg_db=$(normalize_pg_name "$PG_DB")
            pg_user=$(normalize_pg_name "$PG_USER")

            # --yes / --purge-all altında ek isim sorulmaz; okuma bloklanmasın.
            if [[ "${RAMIS_ASSUME_YES:-false}" != "true" && "$PURGE_ALL" != "true" ]]; then
                if confirm_yn "$(_L unins_q_pg_custom "Farklı veritabanı/kullanıcı adı girmek ister misiniz? (varsayılan: ${pg_db} / ${pg_user})")" "h"; then
                    read -rp "  $(_L unins_prm_db_name "Veritabanı adı") [${pg_db}]: " input_db
                    read -rp "  $(_L unins_prm_db_user "Kullanıcı adı") [${pg_user}]: " input_user
                    [[ -n "$input_db" ]] && pg_db=$(normalize_pg_name "$input_db")
                    [[ -n "$input_user" ]] && pg_user=$(normalize_pg_name "$input_user")
                fi
            fi

            remove_postgresql_ramis "$pg_db" "$pg_user" || true
        else
            info "$(_L unins_pg_kept "PostgreSQL veritabanı ve kullanıcı korundu.")"
        fi
    fi

    section "$(_L unins_sec5 "5 · Ortam")" "$(_L unins_sec5_sub "/etc/ramis")"
    rm -f /etc/ramis/backend.env
    rm -f /etc/ramis/frontend.env
    rm -f /etc/ramis/runtime-config.json
    rm -f /etc/ramis/install.conf
    rm -f /etc/ramis/lang
    rmdir /etc/ramis 2>/dev/null || true
    success "$(_L unins_sec5_ok "Ortam dosyaları silindi")"

    section "$(_L unins_sec6 "6 · Artıklar")" "$(_L unins_sec6_sub "udev ve masaüstü girdileri")"
    if [[ -f /etc/udev/rules.d/99-escpos.rules ]]; then
        rm -f /etc/udev/rules.d/99-escpos.rules
        if command -v udevadm &>/dev/null; then
            udevadm control --reload-rules 2>/dev/null || true
            udevadm trigger 2>/dev/null || true
        fi
        success "$(_L unins_udev_ok "ESC/POS udev kuralı kaldırıldı"): /etc/udev/rules.d/99-escpos.rules"
    else
        info "$(_L unins_udev_none "ESC/POS udev kuralı bulunamadı; atlandı.")"
    fi

    # install.sh tarafından kurulan logrotate yapılandırması
    if [[ -f /etc/logrotate.d/ramis ]]; then
        rm -f /etc/logrotate.d/ramis
        success "logrotate yapılandırması kaldırıldı: /etc/logrotate.d/ramis"
    else
        info "logrotate yapılandırması bulunamadı; atlandı."
    fi

    local desk_user="${SUDO_USER:-}"
    if [[ -n "$desk_user" && "$desk_user" != "root" ]]; then
        local desk_home
        desk_home=$(getent passwd "$desk_user" | cut -d: -f6) || true
        if [[ -n "$desk_home" && -d "$desk_home" ]]; then
            local removed_desktop=false
            local -a desktop_files=() autostart_files=()
            shopt -s nullglob
            desktop_files=("${desk_home}/.local/share/applications/ramis-"*.desktop)
            autostart_files=("${desk_home}/.config/autostart/ramis-"*.desktop)
            shopt -u nullglob
            if [[ ${#desktop_files[@]} -gt 0 ]]; then
                rm -f "${desktop_files[@]}"
                removed_desktop=true
            fi
            if [[ ${#autostart_files[@]} -gt 0 ]]; then
                rm -f "${autostart_files[@]}"
                removed_desktop=true
            fi
            if [[ "$removed_desktop" == "true" ]]; then
                success "$(_L unins_desktop_ok "Masaüstü girdileri kaldırıldı"): ${desk_user}"
            else
                info "$(_L unins_desktop_none "Masaüstü girdisi bulunamadı"): ${desk_user}"
            fi
        else
            info "$(_L unins_desktop_nohome "Kullanıcı ev dizini bulunamadı"): ${desk_user}"
        fi
    else
        info "$(_L unins_desktop_nosudo "SUDO_USER tanımlı değil; masaüstü girdileri atlandı.")"
    fi

    section "$(_L unins_sec7 "7 · Uygulama dosyaları")" "$(_L unins_sec7_sub "İsteğe bağlı")"
    if [[ "$KEEP_DATA" == "true" && "$PURGE_ALL" != "true" ]]; then
        info "$(_L unins_keepdata_dir "Kurulum dizini --keep-data nedeniyle korundu"): ${INSTALL_DIR}"
    elif [[ -d "$INSTALL_DIR" ]]; then
        if confirm_yn "$(_L unins_q_del_installdir "Kurulum dizinini tamamen silmek istiyor musunuz?") (${INSTALL_DIR})" "$(_scope_default)"; then
            rm -rf "$INSTALL_DIR"
            success "$(_L unins_installdir_ok "Kurulum dizini silindi"): ${INSTALL_DIR}"
        else
            info "$(_L unins_installdir_kept "Kurulum dizini korundu"): ${INSTALL_DIR}"
        fi
    else
        info "$(_L unins_installdir_none "Kurulum dizini zaten yok"): ${INSTALL_DIR}"
    fi

    section "$(_L unins_sec8 "8 · Günlük dosyaları")" "$(_L unins_sec8_sub "İsteğe bağlı")"
    if [[ "$KEEP_DATA" == "true" && "$PURGE_ALL" != "true" ]]; then
        info "$(_L unins_keepdata_logs "--keep-data: günlükler korundu (/var/log/ramis)")"
    elif [[ -d "/var/log/ramis" ]]; then
        if confirm_yn "$(_L unins_q_del_logs "/var/log/ramis altındaki günlükleri silmek istiyor musunuz?")" "$(_scope_default)"; then
            rm -rf /var/log/ramis
            success "$(_L unins_logs_ok "Ramis günlük dizini silindi")"
        else
            info "$(_L unins_logs_kept "Günlükler korundu (/var/log/ramis)")"
        fi
    fi

    section "$(_L unins_sec9 "9 · Sistem kullanıcısı")" "$(_L unins_sec9_sub "İsteğe bağlı")"
    if [[ "$KEEP_DATA" == "true" && "$PURGE_ALL" != "true" ]]; then
        info "$(_L unins_keepdata_user "--keep-data: kullanıcı '${SYS_USER}' korundu")"
    elif id "$SYS_USER" &>/dev/null; then
        if confirm_yn "$(_L unins_q_del_user "'${SYS_USER}' sistem kullanıcısını silmek istiyor musunuz?")" "$(_scope_default)"; then
            userdel -r "$SYS_USER" 2>/dev/null || userdel "$SYS_USER" 2>/dev/null || true
            success "$(_L unins_user_ok "Kullanıcı '${SYS_USER}' kaldırıldı")"
        else
            info "$(_L unins_user_kept "Kullanıcı '${SYS_USER}' korundu (dosya sahipliği için gerekebilir)")"
        fi
    fi

    section "$(_L unins_sec10 "10 · Güvenlik duvarı (UFW)")" "$(_L unins_sec10_sub "İsteğe bağlı")"
    if command -v ufw &>/dev/null && \
       LC_ALL=C ufw status 2>/dev/null | grep -qi active; then
        if confirm_yn "$(_L unins_q_ufw "Ramis ile eklenen UFW kurallarını (80, 9100, vb.) kaldırmayı deneyelim mi?")" "$(_scope_default)"; then
            ufw --force delete allow 80/tcp &>/dev/null || true
            ufw --force delete allow 'Nginx HTTP' &>/dev/null || true
            ufw --force delete allow 'Nginx Full' &>/dev/null || true
            ufw --force delete allow 3000/tcp &>/dev/null || true
            ufw --force delete allow 8000/tcp &>/dev/null || true
            ufw --force delete allow 8001/tcp &>/dev/null || true
            ufw --force delete allow 8002/tcp &>/dev/null || true
            ufw --force delete allow 8003/tcp &>/dev/null || true
            ufw --force delete allow 8081/tcp &>/dev/null || true
            ufw --force delete allow 9100/tcp &>/dev/null || true
            success "$(_L unins_ufw_ok "İlgili UFW kuralları silinmeye çalışıldı (tanımsız kural uyarısı normal olabilir)")"
        else
            info "$(_L unins_ufw_kept "UFW kuralları değiştirilmedi")"
        fi
    else
        info "$(_L unins_ufw_none "UFW etkin değil veya yüklü değil; atlandı")"
    fi

    log "=== Ramis kaldırma işlemi tamamlandı ==="
    echo ""
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo -e "  ${GREEN}${BOLD}$(_L unins_done "Kaldırma işlemi tamamlandı.")${NC}"
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${DIM}$(_L unins_footer1 "PostgreSQL, Redis, Nginx, Node.js gibi sistem paketleri otomatik kaldırılmaz.")${NC}"
    echo -e "  ${DIM}$(_L unins_footer2 "Yalnızca onayladığınız öğeler silindi; gerekiyorsa paketleri apt ile kaldırabilirsiniz.")${NC}"
    echo ""
}

main "$@"
