#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════╗
# ║  Ramis — Otomatik Üretim Kurulum Scripti                           ║
# ║  Kullanım: sudo bash install.sh                                    ║
# ║  Sihirbaz: önce IP (yerel/kapalı) veya alan adı; alan adında tek/   ║
# ║  çift hostname seçilir. IP modunda da Nginx 80 (yol tabanlı /api).   ║
# ║  Desteklenen OS: Ubuntu 22.04+, Debian 12+                         ║
# ╚══════════════════════════════════════════════════════════════════════╝
set -euo pipefail

# ── Renkler ve semboller ──────────────────────────────────────────────
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
CYAN=$'\033[0;36m'
BOLD=$'\033[1m'
DIM=$'\033[2m'
NC=$'\033[0m' # No Color

CHECK="${GREEN}✓${NC}"
CROSS="${RED}✗${NC}"
WARN="${YELLOW}‼${NC}"
INFO="${BLUE}·${NC}"

# ── Global değişkenler ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
if [[ ! -f "${SCRIPT_DIR}/install_i18n.sh" ]]; then
    echo "install_i18n.sh bulunamadı (install.sh ile aynı dizinde olmalı)." >&2
    echo "install_i18n.sh not found (expected next to install.sh)." >&2
    exit 1
fi
source "${SCRIPT_DIR}/install_i18n.sh"

LOG_DIR="/var/log/ramis"
LOG_FILE="${LOG_DIR}/install.log"
STEP_CURRENT=0

BACKEND_ONLY="false"
for arg in "$@"; do
    case "$arg" in
        --backend-only)
            BACKEND_ONLY="true"
            ;;
    esac
done

if [[ "${BACKEND_ONLY}" == "true" ]]; then
    STEP_TOTAL=12
else
    STEP_TOTAL=13
fi

# Wizard tarafından doldurulacak değişkenler
INSTALL_DIR="/srv/ramis_erp"
API_DOMAIN=""
APP_DOMAIN=""
SAME_DOMAIN="false"
IP_ONLY_MODE="false"   # true: domain yok; SSL yok; Nginx :80 → Daphne :8000 + Next :3000 (yerel ağ)
PG_DB="ramis"
PG_USER="ramis"
PG_PASSWORD=""
ADMIN_USER="admin"
ADMIN_EMAIL=""
ADMIN_PASS=""
SEED_DATA="true"
SEED_RBAC="true"
SEED_UNITS="true"
SEED_INFRA="true"
SEED_USERS="true"
SEED_MENU="true"
SEED_TABLES="true"
POS_OFFLINE_QUEUE="true"
DAPHNE_INSTANCES=2
UVICORN_INSTANCES=4
DJANGO_SECRET_KEY=""
SYS_USER="ramis"
INSTALL_LANG_NEEDS_PROMPT=""
if [[ -z "${INSTALL_LANG+x}" ]]; then
    INSTALL_LANG="tr"
    INSTALL_LANG_NEEDS_PROMPT="true"
else
    INSTALL_LANG="$(printf '%s' "${INSTALL_LANG}" | tr '[:upper:]' '[:lower:]')"
    case "$INSTALL_LANG" in
        en|bg|sq) ;;
        *) INSTALL_LANG="tr" ;;
    esac
fi

# ── Yardımcı fonksiyonlar ────────────────────────────────────────────

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

step_header() {
    STEP_CURRENT=$((STEP_CURRENT + 1))
    echo ""
    echo -e "${CYAN}  ──────────────────────────────────────────────────────────────────────${NC}"
    echo -e "  ${DIM}$(_L step_word) ${STEP_CURRENT} / ${STEP_TOTAL}${NC}  ·  ${BOLD}$1${NC}"
    echo -e "${CYAN}  ──────────────────────────────────────────────────────────────────────${NC}"
    echo ""
    log "STEP ${STEP_CURRENT}/${STEP_TOTAL}: $1"
}

select_install_language() {
    [[ "${INSTALL_LANG_NEEDS_PROMPT}" == "true" ]] || return 0

    echo ""
    echo -e "${CYAN}  ──────────────────────────────────────────────────────────────────────${NC}"
    echo -e "  ${BOLD}$(_L lang_title)${NC}"
    echo -e "${CYAN}  ──────────────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "  $(_L opt_lang_tr)"
    echo -e "  $(_L opt_lang_en)"
    echo -e "  $(_L opt_lang_bg)"
    echo -e "  $(_L opt_lang_sq)"
    echo ""
    local lc
    read -rp "  $(_L lang_pick) " lc
    lc="${lc:-1}"
    case "$lc" in
        2|en|EN|english|English)
            INSTALL_LANG="en"
            ;;
        3|bg|BG|bulgarian|Bulgarian)
            INSTALL_LANG="bg"
            ;;
        4|sq|SQ|albanian|Albanian)
            INSTALL_LANG="sq"
            ;;
        *)
            INSTALL_LANG="tr"
            ;;
    esac
    INSTALL_LANG_NEEDS_PROMPT=""
    echo ""
}

section_hint() {
    echo -e "  ${DIM}$1${NC}"
    echo ""
}

info()    { echo -e "  ${INFO}  $*"; log "INFO: $*"; }
success() { echo -e "  ${CHECK}  $*"; log "OK: $*"; }
warn()    { echo -e "  ${WARN}  $*"; log "WARN: $*"; }
fail()    { echo -e "  ${CROSS}  $*"; log "FAIL: $*"; }

die() {
    fail "$*"
    echo ""
    echo -e "  ${RED}$(_L die_footer)${NC} ${BOLD}${LOG_FILE}${NC}"
    echo -e "  ${DIM}$(_L die_log_hint)${NC}"
    echo ""
    exit 1
}

# .env / şifre: açık heredoc $(VAR) genişlerken değerde \n satır kırar; girişte yapıştırma kirliliği
trim_space() {
    local s="$1"
    s="${s#"${s%%[![:space:]]*}"}"
    s="${s%"${s##*[![:space:]]}"}"
    printf '%s' "$s"
}

env_single_line() {
    printf '%s' "$1" | tr -d '\r\n'
}

# PostgreSQL ALTER/CREATE USER — tek tırnak kaçışı (backend.env ile aynı ham parola)
postgres_sql_quote() {
    local s="$1"
    s="${s//\'/\'\'}"
    printf "'%s'" "$s"
}

# backend.env: bash source + systemd EnvironmentFile için çift tırnaklı değer
env_file_double_quote() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//\$/\\\$}"
    s="${s//\`/\\\`}"
    printf '"%s"' "$s"
}

# Tüm stderr/stdout'u sadece loga yönlendiren apt komutları hata verince set -e ile
# script sessizce biter. Bu yardımcı, hatayı ekrana özetler.
apt_troubleshoot_hint() {
    echo -e "  ${YELLOW}$(_L apt_hint1)${NC}"
    echo -e "  ${YELLOW}$(_L apt_hint2)${NC}"
    echo -e "  ${YELLOW}$(_L apt_hint3)${NC}"
    echo -e "  ${YELLOW}$(_L apt_hint4)${NC}"
    echo ""
}

# Komut çıktısını loga yazar; başarısız olursa sebep + log sonu terminale, sonra exit 1
run_apt_to_log() {
    local opk="$1"
    shift
    local desc
    desc="$(_L "$opk")"
    if ! "$@" >> "$LOG_FILE" 2>&1; then
        log "FAIL: $desc"
        fail "$desc $(_L suffix_failed)"
        apt_troubleshoot_hint
        echo -e "  ${CYAN}$(_L tail_log): ${LOG_FILE}${NC}"
        tail -n 35 "$LOG_FILE" 2>/dev/null | sed 's/^/  /' || true
        echo ""
        echo -e "  ${RED}$(_L stopped_log) ${LOG_FILE}${NC}"
        echo ""
        exit 1
    fi
}

# npm: TAR_ENTRY_ERROR, ENOENT, disk / cache — stdout logda kalır, set -e sessiz bırakıyordu
npm_troubleshoot_hint() {
    echo -e "  ${YELLOW}$(_L npm_hint1)${NC}"
    echo -e "  ${YELLOW}sudo -u ${SYS_USER} rm -rf ${INSTALL_DIR}/frontend/node_modules ${INSTALL_DIR}/frontend/.next && sudo -u ${SYS_USER} npm cache clean --force${NC}"
    echo -e "  ${YELLOW}cd ${INSTALL_DIR}/frontend && sudo -u ${SYS_USER} npm ci --no-audit --no-fund${NC}"
    echo -e "  ${YELLOW}$(_L npm_cmd_clean)${NC}"
    echo ""
}

run_npm_to_log() {
    local opk="$1"
    shift
    local desc
    desc="$(_L "$opk")"
    if ! "$@" >> "$LOG_FILE" 2>&1; then
        log "FAIL: $desc"
        fail "$desc $(_L suffix_failed)"
        npm_troubleshoot_hint
        echo -e "  ${CYAN}$(_L tail_log): ${LOG_FILE}${NC}"
        tail -n 50 "$LOG_FILE" 2>/dev/null | sed 's/^/  /' || true
        echo ""
        echo -e "  ${RED}$(_L stopped_log) ${LOG_FILE}${NC}"
        echo ""
        exit 1
    fi
}

# shellcheck source=system_utils/python_venv.sh
source "${SCRIPT_DIR}/system_utils/python_venv.sh"

pip_troubleshoot_hint() {
    ramis_pip_troubleshoot_hint "$(_L pip_hint1)" "$(_L pip_hint2)"
}

run_pip_to_log() {
    local opk="$1"
    shift
    ramis_run_pip_to_log "$(_L "$opk")" "$(_L suffix_failed)" "$(_L tail_log)" "$(_L stopped_log)" "$(_L pip_log_read_hint)" "$@"
}

_bootstrap_venv_pip() {
    ramis_bootstrap_venv_pip "$1" \
        "$(_L pip_bootstrap_dl)" \
        "$(_L pip_bootstrap_dl_fail)" \
        "$(_L pip_bootstrap_run)" \
        "$(_L pip_bootstrap_run_fail)" \
        "$(_L pip_bootstrap_missing)" \
        "$(_L pip_bootstrap_ok)"
}

confirm_yn() {
    local prompt="$1"
    local default="${2:-e}"
    local answer hint
    if [[ "$INSTALL_LANG" == "en" ]]; then
        if [[ "$default" == "e" ]]; then
            hint="[Y/n]"
            read -rp "  $prompt $hint " answer
            answer="${answer:-y}"
        else
            hint="[y/N]"
            read -rp "  $prompt $hint " answer
            answer="${answer:-n}"
        fi
        [[ "${answer,,}" == "y" || "${answer,,}" == "yes" ]]
    else
        if [[ "$default" == "e" ]]; then
            read -rp "  $prompt [E/h]: " answer
            answer="${answer:-e}"
        else
            read -rp "  $prompt [e/H]: " answer
            answer="${answer:-h}"
        fi
        [[ "${answer,,}" == "e" || "${answer,,}" == "evet" || "${answer,,}" == "y" || "${answer,,}" == "yes" ]]
    fi
}

prompt_value() {
    local prompt="$1"
    local default="${2:-}"
    local value
    if [[ -n "$default" ]]; then
        read -rp "  $prompt [$default]: " value
        echo "${value:-$default}"
    else
        while true; do
            read -rp "  $prompt: " value
            if [[ -n "$value" ]]; then
                echo "$value"
                return
            fi
            echo -e "  ${YELLOW}$(_L err_field_required)${NC}"
        done
    fi
}

prompt_secret() {
    local prompt="$1"
    local value confirm
    while true; do
        read -srp "  $prompt: " value
        echo ""
        if [[ -z "$value" ]]; then
            echo -e "  ${YELLOW}$(_L err_pw_required)${NC}"
            continue
        fi
        if [[ ${#value} -lt 8 ]]; then
            echo -e "  ${YELLOW}$(_L err_pw_len)${NC}"
            continue
        fi
        read -srp "  $(_L prm_pw_again) " confirm
        echo ""
        value=$(trim_space "$value")
        confirm=$(trim_space "$confirm")
        value=$(env_single_line "$value")
        confirm=$(env_single_line "$confirm")
        if [[ "$value" == "$confirm" ]]; then
            echo "$value"
            return
        fi
        echo -e "  ${YELLOW}$(_L err_pw_mismatch)${NC}"
    done
}

clamp_daphne_instances() {
    local n="${1:-2}"
    if [[ ! "$n" =~ ^[0-9]+$ ]] || (( n < 1 )); then
        n=1
    elif (( n > 4 )); then
        n=4
        warn "$(_L warn_daphne_max)"
    fi
    echo "$n"
}

daphne_ports_label() {
    local n="$1"
    local ports=()
    local i
    for ((i = 0; i < n; i++)); do
        ports+=(":$((8000 + i))")
    done
    local IFS=', '
    echo "${ports[*]}"
}

uvicorn_ports_label() {
    local n="$1"
    local ports=()
    local i
    for ((i = 0; i < n; i++)); do
        ports+=(":$((9000 + i))")
    done
    local IFS=', '
    echo "${ports[*]}"
}

generate_password() {
    openssl rand -base64 24 | tr -d '/+=' | head -c 32 | tr -d '\n\r'
}

generate_secret_key() {
    openssl rand -hex 48
}

command_exists() {
    command -v "$1" &>/dev/null
}

# makemessages (.po güncelleme) + django.po → django.mo derleme
_compile_backend_locale() {
    local backend_dir="$1"
    local python="$2"
    local pip="$3"
    local makemessages_args=(
        -l tr -l en -l ar -l de -l ru
        --ignore=venv --ignore=.venv --ignore=env
        --ignore=node_modules --ignore=.pytest_cache
    )

    info "Backend çeviri dizeleri çıkarılıyor (makemessages)..."
    if sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${backend_dir} && ${python} manage.py makemessages ${makemessages_args[*]}" >> "$LOG_FILE" 2>&1; then
        success "Backend django.po dosyaları güncellendi (makemessages)"
    else
        warn "makemessages başarısız — gettext kurulu değilse .po dosyaları rsync ile gelen sürümle kalır"
    fi

    info "Backend dil dosyaları derleniyor (django.po → django.mo)..."
    sudo -u "$SYS_USER" "$pip" install polib >> "$LOG_FILE" 2>&1 || true
    if sudo -u "$SYS_USER" bash -c "cd ${backend_dir} && ${python} scripts/compile_locale_mo.py" >> "$LOG_FILE" 2>&1; then
        success "Backend dil dosyaları derlendi"
        return 0
    fi

    if sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${backend_dir} && ${python} manage.py compilemessages" >> "$LOG_FILE" 2>&1; then
        success "Backend dil dosyaları derlendi (compilemessages)"
        return 0
    fi

    warn "Backend dil dosyaları derlenemedi — çeviri metinleri eksik olabilir"
}

service_active() {
    systemctl is-active --quiet "$1" 2>/dev/null
}

banner() {
    echo ""
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BOLD}RAMIS ERP${NC}  ${DIM}·${NC}  $(_L banner_sub)"
    echo -e "  ${DIM}$(_L banner_tag)${NC}"
    echo ""
    echo -e "  $(_L banner_b1)"
    echo -e "  $(_L banner_b2)"
    echo ""
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 1: Ön Kontroller
# ══════════════════════════════════════════════════════════════════════

preflight_checks() {
    step_header "$(_L step_preflight)"

    # Root kontrolü
    if [[ $EUID -ne 0 ]]; then
        die "$(_L root_required)"
    fi
    success "$(_L chk_root_ok)"

    # Log dizini oluştur
    mkdir -p "$LOG_DIR"
    touch "$LOG_FILE"
    chmod 640 "$LOG_FILE"

    # OS kontrolü
    if [[ ! -f /etc/os-release ]]; then
        die "$(_L chk_os_unknown)"
    fi

    # shellcheck disable=SC1091
    source /etc/os-release

    local os_ok=false
    case "${ID:-}" in
        ubuntu)
            local ver="${VERSION_ID%%.*}"
            if (( ver >= 22 )); then os_ok=true; fi
            ;;
        debian)
            local ver="${VERSION_ID%%.*}"
            if (( ver >= 12 )); then os_ok=true; fi
            ;;
    esac

    if $os_ok; then
        success "$(_L chk_os_ok) ${PRETTY_NAME:-$ID $VERSION_ID}"
    else
        warn "$(_L warn_os)"
        warn "$(_L warn_os_cur) ${PRETTY_NAME:-$ID $VERSION_ID}"
        if ! confirm_yn "$(_L q_continue)" "h"; then
            die "$(_L die_cancel)"
        fi
    fi

    # RAM kontrolü
    local total_ram_mb
    total_ram_mb=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)
    if (( total_ram_mb < 2048 )); then
        warn "$(_L chk_ram_line) ${total_ram_mb} $(_L lbl_mb) $(_L warn_ram_need)"
        if ! confirm_yn "$(_L q_low_ram)" "h"; then
            die "$(_L die_cancel)"
        fi
    else
        success "$(_L chk_ram_line) ${total_ram_mb} $(_L lbl_mb)"
    fi

    # Disk kontrolü
    local free_disk_gb
    free_disk_gb=$(df -BG / | awk 'NR==2 {gsub("G",""); print $4}')
    if (( free_disk_gb < 2 )); then
        die "$(_L die_disk_short): ${free_disk_gb} $(_L lbl_gb)."
    fi
    success "$(_L chk_disk_line) ${free_disk_gb} $(_L lbl_gb)"

    # Port kontrolü
    local ports_in_use=()
    local check_ports=(80 443 5432 6379)
    for port in "${check_ports[@]}"; do
        if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
            ports_in_use+=("$port")
        fi
    done
    if (( ${#ports_in_use[@]} > 0 )); then
        warn "$(_L warn_ports_use) ${ports_in_use[*]}"
        warn "$(_L warn_ports_svc)"
        if ! confirm_yn "$(_L q_continue)" "e"; then
            die "$(_L die_cancel)"
        fi
    else
        success "$(_L chk_ports_ok)"
    fi

    # Önceki kurulum kontrolü
    if [[ -f /etc/systemd/system/ramis-daphne.service ]]; then
        warn "$(_L warn_prev)"
        if ! confirm_yn "$(_L q_update_inplace)" "e"; then
            die "$(_L die_cancel)"
        fi
    fi

    success "$(_L chk_preflight_done)"
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 2: İnteraktif Wizard
# ══════════════════════════════════════════════════════════════════════

interactive_wizard() {
    step_header "$(_L step_wizard)"

    section_hint "$(_L hint_wizard1)"
    echo -e "  ${BOLD}$(_L hint_wizard2)${NC}"
    echo ""

    # ── Kurulum dizini ──
    echo -e "  ${BOLD}$(_L lbl_install_dir)${NC}"
    INSTALL_DIR=$(prompt_value "$(_L lbl_install_dir)" "$INSTALL_DIR")
    echo ""

    # ── Erişim ──
    if [[ "${BACKEND_ONLY}" == "true" ]]; then
        echo -e "  ${BOLD}$(_L lbl_access_type)${NC} (Backend Only)"
        echo ""
        echo -e "  $(_L access_a_title)"
        echo -e "      $(_L access_a_http)"
        echo ""
        echo -e "  $(_L access_b_title)"
        echo ""
        local tier
        read -rp "  $(_L pick_ab) " tier
        tier="${tier:-b}"
        case "${tier,,}" in
            a|A|1|ip|IP)
                SAME_DOMAIN="true"
                IP_ONLY_MODE="true"
                info "$(_L hint_ip_setup)"
                info "$(_L hint_http_only)"
                API_DOMAIN=$(prompt_value "$(_L prm_server_ip)" "")
                if [[ -z "${API_DOMAIN// }" ]]; then
                    die "$(_L err_ip_empty)"
                fi
                APP_DOMAIN=""
                echo ""
                ;;
            b|B|2|d|D|domain|"")
                IP_ONLY_MODE="false"
                SAME_DOMAIN="false"
                API_DOMAIN=$(prompt_value "$(_L prm_api_host)" "")
                APP_DOMAIN=""
                echo ""
                ;;
            *)
                die "$(_L err_pick_ab)"
                ;;
        esac
    else
        echo -e "  ${BOLD}$(_L lbl_access_type)${NC}"
        echo ""
        echo -e "  $(_L access_a_title)"
        echo -e "      $(_L access_a_http)"
        echo ""
        echo -e "  $(_L access_b_title)"
        echo ""
        local tier
        read -rp "  $(_L pick_ab) " tier
        tier="${tier:-b}"
        case "${tier,,}" in
            a|A|1|ip|IP)
                SAME_DOMAIN="true"
                IP_ONLY_MODE="true"
                info "$(_L hint_ip_setup)"
                info "$(_L hint_http_only)"
                APP_DOMAIN=$(prompt_value "$(_L prm_server_ip)" "")
                if [[ -z "${APP_DOMAIN// }" ]]; then
                    die "$(_L err_ip_empty)"
                fi
                API_DOMAIN="$APP_DOMAIN"
                echo ""
                ;;
            b|B|2|d|D|domain|"")
                IP_ONLY_MODE="false"
                echo -e "  ${BOLD}$(_L dom_arch_title)${NC}"
                echo -e "$(_L dom_single_desc)"
                echo -e "$(_L dom_dual_desc)"
                echo ""
                local access_choice
                read -rp "  $(_L pick_12_dom) " access_choice
                access_choice="${access_choice:-1}"
                case "${access_choice}" in
                    1)
                        SAME_DOMAIN="true"
                        APP_DOMAIN=$(prompt_value "$(_L prm_host_single)" "")
                        API_DOMAIN="$APP_DOMAIN"
                        ;;
                    2)
                        SAME_DOMAIN="false"
                        API_DOMAIN=$(prompt_value "$(_L prm_api_host)" "")
                        APP_DOMAIN=$(prompt_value "$(_L prm_app_host)" "")
                        ;;
                    *)
                        die "$(_L err_pick_12)"
                        ;;
                esac
                echo ""
                ;;
            *)
                die "$(_L err_pick_ab)"
                ;;
        esac
    fi
    echo ""

    # ── PostgreSQL ──
    echo -e "  ${BOLD}$(_L lbl_pg)${NC}"
    PG_DB=$(prompt_value "$(_L prm_db_name)" "$PG_DB")
    PG_USER=$(prompt_value "$(_L prm_db_user)" "$PG_USER")

    echo ""
    if confirm_yn "$(_L q_pg_auto_pw)" "e"; then
        PG_PASSWORD=$(generate_password)
        info "$(_L msg_pg_saved)"
        info "$(_L msg_pg_note) $PG_PASSWORD"
    else
        PG_PASSWORD=$(prompt_secret "$(_L prm_pg_pw)")
    fi
    PG_PASSWORD=$(env_single_line "$PG_PASSWORD")
    echo ""

    # ── Admin kullanıcı ──
    echo -e "  ${BOLD}$(_L lbl_admin)${NC}"
    ADMIN_USER=$(prompt_value "$(_L prm_admin_user)" "$ADMIN_USER")
    ADMIN_EMAIL=$(prompt_value "$(_L prm_admin_email)" "")
    ADMIN_PASS=$(prompt_secret "$(_L prm_admin_pw)")
    echo ""

    # ── Seed data ──
    echo -e "  ${BOLD}$(_L lbl_seed)${NC} ${DIM}($(_L lbl_seed_opt))${NC}"
    if confirm_yn "$(_L q_seed_all)" "e"; then
        SEED_DATA="true"
        if confirm_yn "$(_L q_seed_full)" "e"; then
            SEED_RBAC="true"
            SEED_UNITS="true"
            SEED_INFRA="true"
            SEED_USERS="true"
            SEED_MENU="true"
            SEED_TABLES="true"
        else
            SEED_RBAC=$(confirm_yn "$(_L q_seed_rbac)" "e" && echo "true" || echo "false")
            SEED_UNITS=$(confirm_yn "$(_L q_seed_units)" "e" && echo "true" || echo "false")
            SEED_INFRA=$(confirm_yn "$(_L q_seed_infra)" "e" && echo "true" || echo "false")
            SEED_USERS=$(confirm_yn "$(_L q_seed_users)" "e" && echo "true" || echo "false")
            SEED_MENU=$(confirm_yn "$(_L q_seed_menu)" "e" && echo "true" || echo "false")
            SEED_TABLES=$(confirm_yn "$(_L q_seed_tables)" "e" && echo "true" || echo "false")
        fi
    else
        SEED_DATA="false"
        SEED_RBAC="false"
        SEED_UNITS="false"
        SEED_INFRA="false"
        SEED_USERS="false"
        SEED_MENU="false"
        SEED_TABLES="false"
    fi
    echo ""

    # ── POS çevrimdışı kuyruk (EPIC-07) — üretimde varsayılan açık ──
    POS_OFFLINE_QUEUE="true"
    info "$(_L msg_pos_offline_default)"
    echo ""

    # ── Daphne ASGI süreç sayısı ──
    echo -e "  ${BOLD}$(_L lbl_daphne)${NC}"
    echo -e "  $(_L hint_daphne)"
    local daphne_raw
    daphne_raw=$(prompt_value "$(_L prm_daphne_instances)" "$DAPHNE_INSTANCES")
    DAPHNE_INSTANCES=$(clamp_daphne_instances "${daphne_raw:-2}")
    info "$(printf "$(_L msg_daphne_selected)" "$DAPHNE_INSTANCES" "$(daphne_ports_label "$DAPHNE_INSTANCES")")"
    echo ""

    DJANGO_SECRET_KEY=$(generate_secret_key)

    # ── Özet ──
    local lang_disp
    if [[ "$INSTALL_LANG" == "en" ]]; then
        lang_disp="$(_L lang_summ_en)"
    else
        lang_disp="$(_L lang_summ_tr)"
    fi

    echo -e "${CYAN}  ──────────────────────────────────────────────────────────────────────${NC}"
    echo -e "  ${BOLD}$(_L sum_title)${NC}  ${DIM}($(_L sum_review))${NC}"
    echo -e "${CYAN}  ──────────────────────────────────────────────────────────────────────${NC}"
    echo ""
    printf '  %-20s %s\n' "$(_L sum_dir)" "${BOLD}${INSTALL_DIR}${NC}"
    if [[ "$IP_ONLY_MODE" == "true" ]]; then
        printf '  %-20s %s\n' "$(_L sum_access_ip)" "${BOLD}$(_L sum_access_ip_val)${NC}"
        printf '  %-20s %s\n' "$(_L sum_ui)" "${BOLD}http://${APP_DOMAIN}/${NC}"
        printf '  %-20s %s\n' "$(_L sum_api)" "${BOLD}http://${APP_DOMAIN}/api/v1/${NC}"
    elif [[ "$SAME_DOMAIN" == "true" ]]; then
        printf '  %-20s %s\n' "$(_L sum_access_single)" "${BOLD}$(_L sum_access_single_val)${NC}"
        printf '  %-20s %s\n' "$(_L sum_host)" "${BOLD}${APP_DOMAIN}${NC}"
    else
        printf '  %-20s %s\n' "$(_L sum_access_dual)" "${BOLD}$(_L sum_access_dual_val)${NC}"
        printf '  %-20s %s\n' "$(_L sum_api_host)" "${BOLD}${API_DOMAIN}${NC}"
        printf '  %-20s %s\n' "$(_L sum_app_host)" "${BOLD}${APP_DOMAIN}${NC}"
    fi
    printf '  %-20s %s\n' "$(_L sum_pg_db)" "${BOLD}${PG_DB}${NC}"
    printf '  %-20s %s\n' "$(_L sum_pg_user)" "${BOLD}${PG_USER}${NC}"
    printf '  %-20s %s\n' "$(_L sum_admin_user)" "${BOLD}${ADMIN_USER}${NC}"
    printf '  %-20s %s\n' "$(_L sum_admin_email)" "${BOLD}${ADMIN_EMAIL}${NC}"
    printf '  %-20s %s\n' "$(_L lbl_lang_installed)" "${BOLD}${lang_disp}${NC}"
    printf '  %-20s %s\n' "$(_L sum_proto)" "${BOLD}$(_L sum_proto_http)${NC}"
    if [[ "$SEED_DATA" == "true" ]]; then
        local seed_tags=""
        [[ "$SEED_RBAC" == "true" ]] && seed_tags+="RBAC, "
        [[ "$SEED_UNITS" == "true" ]] && seed_tags+="units, "
        [[ "$SEED_INFRA" == "true" ]] && seed_tags+="infra, "
        [[ "$SEED_USERS" == "true" ]] && seed_tags+="users, "
        [[ "$SEED_MENU" == "true" ]] && seed_tags+="menu, "
        [[ "$SEED_TABLES" == "true" ]] && seed_tags+="tables, "
        seed_tags="${seed_tags%, }"
        echo -e "  $(_L lbl_seed):     ${BOLD}$(_L sum_seed_yes) ($(_L sum_seed_selected) ${seed_tags})${NC}"
    else
        printf '  %-20s %s\n' "$(_L lbl_seed)" "${BOLD}$(_L sum_seed_no)${NC}"
    fi
    if [[ "$POS_OFFLINE_QUEUE" == "true" ]]; then
        printf '  %-20s %s\n' "$(_L lbl_pos_offline)" "${BOLD}$(_L sum_pos_offline_yes)${NC}"
    else
        printf '  %-20s %s\n' "$(_L lbl_pos_offline)" "${BOLD}$(_L sum_pos_offline_no)${NC}"
    fi
    printf '  %-20s %s\n' "$(_L sum_daphne)" "${BOLD}${DAPHNE_INSTANCES}${NC} $(daphne_ports_label "$DAPHNE_INSTANCES")"
    printf '  %-20s %s\n' "$(_L sum_uvicorn)" "${BOLD}${UVICORN_INSTANCES:-4}${NC} $(uvicorn_ports_label "${UVICORN_INSTANCES:-4}")"
    echo ""

    if ! confirm_yn "$(_L q_confirm_start)" "e"; then
        die "$(_L die_cancel)"
    fi

    log "Sihirbaz tamam: INSTALL_DIR=$INSTALL_DIR API_DOMAIN=$API_DOMAIN APP_DOMAIN=$APP_DOMAIN SAME_DOMAIN=$SAME_DOMAIN IP_ONLY_MODE=$IP_ONLY_MODE PG_DB=$PG_DB PG_USER=$PG_USER SEED=$SEED_DATA POS_OFFLINE_QUEUE=$POS_OFFLINE_QUEUE DAPHNE_INSTANCES=$DAPHNE_INSTANCES INSTALL_LANG=$INSTALL_LANG"
}

# frontend build için /etc/ramis/frontend.env içindeki NEXT_PUBLIC_* satırlarını export ifadelerine çevirir
_frontend_next_public_build_exports() {
    local exports=""
    if [[ -f /etc/ramis/frontend.env ]]; then
        while IFS= read -r line || [[ -n "$line" ]]; do
            [[ "$line" =~ ^[[:space:]]*# ]] && continue
            [[ "$line" =~ ^NEXT_PUBLIC_[A-Za-z0-9_]+= ]] || continue
            exports+=" export ${line};"
        done < /etc/ramis/frontend.env
    fi
    printf '%s' "$exports"
}

# Sunucudaki /etc/ramis/runtime-config.json içeriğini yazar/günceller.
_write_runtime_config_json() {
    local api_url="$1"
    local pos_offline_json="${2:-true}"
    local api_toasts_json="${3:-false}"

    mkdir -p /etc/ramis
    cat > /etc/ramis/runtime-config.json << ENVEOF
{
  "apiBaseUrl": "${api_url}",
  "posOfflineQueue": ${pos_offline_json},
  "apiInterceptorToasts": ${api_toasts_json}
}
ENVEOF
    chown "${SYS_USER}:${SYS_USER}" /etc/ramis/runtime-config.json
    chmod 644 /etc/ramis/runtime-config.json
}

_write_frontend_env_files() {
    local frontend_dir="$1"
    local api_url="$2"
    local pos_offline_val="true"

    cat > /etc/ramis/frontend.env << ENVEOF
# Ramis — Frontend üretim ortam dosyası
# Otomatik oluşturuldu: $(date '+%Y-%m-%d %H:%M:%S')
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_API_URL=${api_url}
# EPIC-07 — POS çevrimdışı işlem kuyruğu (IndexedDB + idempotent senkron)
NEXT_PUBLIC_POS_OFFLINE_QUEUE=${pos_offline_val}
ENVEOF
    chown "${SYS_USER}:${SYS_USER}" /etc/ramis/frontend.env
    chmod 600 /etc/ramis/frontend.env

    cat > "${frontend_dir}/.env.local" << ENVEOF
NEXT_PUBLIC_API_URL=${api_url}
NEXT_PUBLIC_POS_OFFLINE_QUEUE=${pos_offline_val}
ENVEOF
    chown "${SYS_USER}:${SYS_USER}" "${frontend_dir}/.env.local"
    _write_runtime_config_json "${api_url}" "${pos_offline_val}" "false"
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 3: Sistem Bağımlılıkları
# ══════════════════════════════════════════════════════════════════════

install_system_deps() {
    step_header "$(_L step_deps)"

    info "$(_L pk_update)"
    run_apt_to_log op_apt_update apt-get update -qq
    success "$(_L pk_update_ok)"

    info "$(_L pk_base)"
    run_apt_to_log op_apt_base env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        build-essential \
        curl \
        wget \
        git \
        software-properties-common \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release \
        ufw
    success "$(_L pk_base_ok)"

    # ── Python ──
    # python3-pip \ sorun çıkartıyor. kaldırıldı.
    info "$(_L pk_py)"
    run_apt_to_log op_apt_python env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        python3 \
        python3-venv \
        python3-dev \
        celery \
        libpq-dev \
        libusb-1.0-0-dev \
        gettext
    local py_ver
    py_ver=$(python3 --version 2>&1 | awk '{print $2}')
    success "$(_L pk_py_ok) ${py_ver} $(_L pk_py_installed)"

    # ── PostgreSQL ──
    if command_exists psql; then
        success "PostgreSQL $(_L pk_pg_here) $(psql --version | awk '{print $3}')"
    else
        info "$(_L pk_pg)"
        run_apt_to_log op_apt_postgresql env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
            postgresql \
            postgresql-contrib
        success "$(_L pk_pg_inst)"
    fi
    systemctl enable --now postgresql >> "$LOG_FILE" 2>&1 || true
    success "$(_L svc_pg_ok)"

    # ── Redis ──
    if command_exists redis-cli; then
        success "Redis $(_L pk_rd_here) $(redis-cli --version | awk '{print $2}')"
    else
        info "$(_L pk_rd)"
        run_apt_to_log op_apt_redis env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
            redis-server
        success "$(_L pk_rd_inst)"
    fi
    systemctl enable --now redis-server >> "$LOG_FILE" 2>&1 || true
    success "$(_L svc_rd_ok)"

    # ── Nginx (ters vekil; IP modunda da 80 üzerinden yol tabanlı) ──
    if command_exists nginx; then
        success "Nginx $(_L pk_ngx_here) $(nginx -v 2>&1 | awk -F/ '{print $2}')"
    else
        info "$(_L pk_ngx)"
        run_apt_to_log op_apt_nginx env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx
        success "$(_L pk_ngx_inst)"
    fi
    systemctl enable --now nginx >> "$LOG_FILE" 2>&1 || true
    success "$(_L svc_ngx_ok)"

    # ── Node.js (NodeSource LTS) ──
    if [[ "${BACKEND_ONLY}" != "true" ]]; then
        if command_exists node; then
            local node_ver
            node_ver=$(node --version)
            local node_major="${node_ver#v}"
            node_major="${node_major%%.*}"
            if (( node_major >= 20 )); then
                success "$(_L pk_node_here) ${node_ver}"
            else
                warn "$(_L warn_node_old) (${node_ver})"
                _install_nodejs
            fi
        else
            _install_nodejs
        fi
    fi

    success "$(_L deps_ready)"
}

_install_nodejs() {
    info "$(_L pk_node)"
    run_apt_to_log op_nodesource bash -c "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
    run_apt_to_log op_apt_nodejs env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
    success "$(_L pk_node_ok) $(node --version) $(_L pk_py_installed)"
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 4: Kullanıcı ve Dizin Yapısı
# ══════════════════════════════════════════════════════════════════════

setup_user_and_dirs() {
    step_header "$(_L step_userdirs)"

    mkdir -p /etc/ramis
    echo "$INSTALL_LANG" > /etc/ramis/lang
    chmod 644 /etc/ramis/lang
    
    # Sistem kullanıcısı
    if id "$SYS_USER" &>/dev/null; then
        success "$(_L svc_user_exists): ${SYS_USER}"
    else
        useradd --system --create-home --shell /usr/sbin/nologin "$SYS_USER"
        success "$(_L svc_user_created): ${SYS_USER}"
    fi

    # Yazıcı erişimi için gruplar (USB/Serial)
    usermod -a -G lp,dialout "$SYS_USER"
    success "$(printf "$(_L grp_printer_fmt)" "${SYS_USER}")"

    # Dizinler
    mkdir -p "${INSTALL_DIR}/backend"
    mkdir -p "${INSTALL_DIR}/frontend"
    mkdir -p /etc/ramis
    mkdir -p "$LOG_DIR"

    # /etc/ramis root:root + chmod 750 olursa "others" giremez; backend.env
    # ramis:e ait olsa bile dizin yolu erişilemez → sudo -u ramis "source ..." hata verir.
    chown "${SYS_USER}:${SYS_USER}" /etc/ramis
    chmod 700 /etc/ramis

    chown -R "${SYS_USER}:${SYS_USER}" "$INSTALL_DIR"
    chown -R "${SYS_USER}:${SYS_USER}" "$LOG_DIR"

    success "$(_L dirs_ok) ${INSTALL_DIR}"
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 5: Proje Dosyalarını Kopyalama
# ══════════════════════════════════════════════════════════════════════

deploy_project_files() {
    step_header "$(_L step_deploy)"

    # Script'in proje kök dizininde olduğunu varsayarak kaynak tespiti
    local project_src="$SCRIPT_DIR"

    # backend ve frontend dizinlerinin varlık kontrolü
    if [[ "${BACKEND_ONLY}" == "true" ]]; then
        if [[ ! -d "${project_src}/backend" ]]; then
            die "Backend dizini bulunamadı (expected ${project_src}/backend)."
        fi
    else
        if [[ ! -d "${project_src}/backend" ]] || [[ ! -d "${project_src}/frontend" ]]; then
            die "$(printf '%s\n\n  %s\n\n  %s %s/backend %s %s/frontend' "$(_L err_d1)" "$(_L err_d2)" "$(_L err_d3)" "${project_src}" "$(_L err_conj)" "${project_src}")"
        fi
    fi

    info "$(_L deploy_be)"
    rsync -a --delete \
        --exclude='.venv' \
        --exclude='venv' \
        --exclude='env' \
        --exclude='__pycache__' \
        --exclude='*.pyc' \
        --exclude='db.sqlite3' \
        --exclude='.pytest_cache' \
        --exclude='media/*' \
        "${project_src}/backend/" "${INSTALL_DIR}/backend/"
    success "$(_L deploy_be_ok)"

    # media dizinini oluştur (içerik hariç)
    mkdir -p "${INSTALL_DIR}/backend/media"

    if [[ "${BACKEND_ONLY}" != "true" ]]; then
        info "$(_L deploy_fe)"
        rsync -a --delete \
            --exclude='node_modules' \
            --exclude='.next' \
            --exclude='.env.local' \
            "${project_src}/frontend/" "${INSTALL_DIR}/frontend/"
        success "$(_L deploy_fe_ok)"
    fi

    if [[ -d "${project_src}/system_utils" ]]; then
        info "$(_L deploy_utils)"
        rsync -a "${project_src}/system_utils/" "${INSTALL_DIR}/system_utils/"
        success "$(_L deploy_utils_ok)"
    else
        warn "$(_L utils_src_missing)"
    fi

    # İzinleri ayarla
    chown -R "${SYS_USER}:${SYS_USER}" "$INSTALL_DIR"
    success "$(_L perm_ok)"
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 6: PostgreSQL Yapılandırması
# ══════════════════════════════════════════════════════════════════════

_verify_postgres_app_credentials() {
    if [[ ! -f /etc/ramis/backend.env ]]; then
        fail "$(_L pg_app_conn_fail)"
        return 1
    fi
    if sudo -u "$SYS_USER" bash -c '
set -a && source /etc/ramis/backend.env && set +a
export PGPASSWORD="$POSTGRES_PASSWORD"
psql -h "${POSTGRES_HOST:-127.0.0.1}" -p "${POSTGRES_PORT:-5432}" \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;" -q -t
' >> "$LOG_FILE" 2>&1; then
        success "$(_L pg_app_conn_ok)"
        return 0
    fi
    fail "$(_L pg_app_conn_fail)"
    return 1
}

setup_postgresql() {
    step_header "$(_L step_pg)"

    # Bağlantı testi
    if ! sudo -u postgres pg_isready -q 2>/dev/null; then
        die "$(_L chk_pg_down)"
    fi
    success "$(_L l_pg_running)"

    local pg_sql_pw
    pg_sql_pw=$(postgres_sql_quote "$PG_PASSWORD")

    # Kullanıcı — backend.env ile aynı normalize parola; SQL tek tırnak kaçışlı
    if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'" 2>/dev/null | grep -q 1; then
        info "$(printf "$(_L pg_sql_user_up_fmt)" "${PG_USER}")"
        sudo -u postgres psql -c "ALTER USER ${PG_USER} WITH PASSWORD ${pg_sql_pw};" >> "$LOG_FILE" 2>&1
    else
        sudo -u postgres psql -c "CREATE USER ${PG_USER} WITH PASSWORD ${pg_sql_pw};" >> "$LOG_FILE" 2>&1
        success "$(printf "$(_L pg_sql_user_new_fmt)" "${PG_USER}")"
    fi

    # Veritabanı
    if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" 2>/dev/null | grep -q 1; then
        success "$(printf "$(_L pg_sql_db_ex_fmt)" "${PG_DB}")"
    else
        sudo -u postgres psql -c "CREATE DATABASE ${PG_DB} OWNER ${PG_USER};" >> "$LOG_FILE" 2>&1
        success "$(printf "$(_L pg_sql_db_new_fmt)" "${PG_DB}")"
    fi

    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${PG_DB} TO ${PG_USER};" >> "$LOG_FILE" 2>&1
    success "$(_L pg_done)"

    # shellcheck source=system_utils/postgresql_scaling.sh
    source "${SCRIPT_DIR}/system_utils/postgresql_scaling.sh"
    local pg_max_rec pg_max_new pg_rc=0
    pg_max_rec="$(ramis_postgres_recommended_max_connections "${DAPHNE_INSTANCES:-2}")"
    info "$(printf "$(_L pg_max_check_fmt)" "$pg_max_rec" "${DAPHNE_INSTANCES:-2}")"
    pg_max_new=$(ramis_configure_postgresql_scaling "${DAPHNE_INSTANCES:-2}" "$LOG_FILE") || pg_rc=$?
    case "$pg_rc" in
        0) success "$(printf "$(_L pg_max_applied_fmt)" "$pg_max_new")" ;;
        1) success "$(printf "$(_L pg_max_ok_fmt)" "$(ramis_postgres_current_max_connections)" "$pg_max_rec")" ;;
        *) warn "$(_L pg_max_failed)" ;;
    esac

    if ! _verify_postgres_app_credentials; then
        die "$(_L pg_app_conn_fail)"
    fi
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 7: Backend Kurulumu
# ══════════════════════════════════════════════════════════════════════

setup_backend() {
    step_header "$(_L step_backend)"

    local backend_dir="${INSTALL_DIR}/backend"
    local venv_dir="${backend_dir}/.venv"
    local pip="${venv_dir}/bin/pip"
    local python="${venv_dir}/bin/python"

    # ── Sanal ortam ──
    if [[ -d "$venv_dir" ]]; then
        info "$(_L venv_update)"
    else
        info "$(_L venv_new)"
        sudo -u "$SYS_USER" python3 -m venv "$venv_dir"
    fi
    success "$(_L venv_ok) ${venv_dir}"

    # ── Güncel pip (get-pip.py — sistem python3-pip kullanılmaz) ──
    _bootstrap_venv_pip "$venv_dir"

    # ── Pip bağımlılıkları ──
    info "$(_L pip_inst)"
    local req_file="${backend_dir}/requirements/production.txt"
    if [[ ! -f "$req_file" ]]; then
        req_file="${backend_dir}/requirements/development.txt"
        warn "$(_L warn_prod_req)"
    fi
    run_pip_to_log op_pip_requirements sudo -u "$SYS_USER" "$pip" install -r "$req_file"

    # channels-redis ve redis garanti kontrolü
    run_pip_to_log op_pip_channels sudo -u "$SYS_USER" "$pip" install channels-redis redis
    success "$(_L pip_ok)"

    # ── Migrate ──
    info "$(_L migrate)"
    if ! sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${backend_dir} && ${python} manage.py migrate --noinput" >> "$LOG_FILE" 2>&1; then
        log "FAIL: migrate"
        die "$(_L migrate_fail)"
    fi
    success "$(_L migrate_ok)"

    info "Varsayılan allerjen referans listesi yükleniyor (seed_allergens)..."
    sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${backend_dir} && ${python} manage.py seed_allergens" >> "$LOG_FILE" 2>&1 || {
        warn "seed_allergens başarısız — allerjen referans listesi eksik kalabilir"
    }
    success "Allerjen referans listesi güncellendi"

    info "Celery Beat görevleri senkronize ediliyor (sync_celery_beat_schedule; Redis temizliği dahil)..."
    sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${backend_dir} && ${python} manage.py sync_celery_beat_schedule" >> "$LOG_FILE" 2>&1 || warn "sync_celery_beat_schedule başarısız — Beat görevleri DB'de olmayabilir"
    success "Celery Beat görevleri senkronize edildi"

    _compile_backend_locale "${backend_dir}" "${python}" "${pip}"

    # ── Collectstatic ──
    info "$(_L collect)"
    sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${backend_dir} && ${python} manage.py collectstatic --noinput" >> "$LOG_FILE" 2>&1
    success "$(_L collect_ok)"

    # ── Superuser — parola tek tırnak içine gömülmez; özel karakter / satır sonu hatası olmaz
    info "$(_L createsu)"
    local su_pwfile admin_pass_clean
    admin_pass_clean=$(env_single_line "$ADMIN_PASS")
    su_pwfile=$(mktemp /tmp/ramis-superuser-pw.XXXXXX)
    chmod 600 "$su_pwfile"
    printf '%s' "$admin_pass_clean" > "$su_pwfile"
    chown "${SYS_USER}:${SYS_USER}" "$su_pwfile"
    sudo -u "$SYS_USER" \
        env \
        "DJANGO_SUPERUSER_USERNAME=$ADMIN_USER" \
        "DJANGO_SUPERUSER_EMAIL=$ADMIN_EMAIL" \
        "RAMIS_SU_PWFILE=$su_pwfile" \
        "BACKEND_DIR=$backend_dir" \
        "PY=$python" \
        bash -c '
set -a && source /etc/ramis/backend.env && set +a
cd "$BACKEND_DIR"
export DJANGO_SUPERUSER_PASSWORD="$(cat "$RAMIS_SU_PWFILE")"
"$PY" manage.py createsuperuser --noinput 2>/dev/null || true
rm -f "$RAMIS_SU_PWFILE"
' >> "$LOG_FILE" 2>&1
    rm -f "$su_pwfile" 2>/dev/null || true
    success "$(printf "$(_L createsu_ok_fmt)" "${ADMIN_USER}")"

    # ── Seed data ──
    if [[ "$SEED_DATA" == "true" ]]; then
        info "$(_L seed_run)"
        local seed_args=""
        [[ "$SEED_RBAC" == "true" ]] && seed_args="${seed_args} --rbac"
        [[ "$SEED_UNITS" == "true" ]] && seed_args="${seed_args} --units"
        [[ "$SEED_INFRA" == "true" ]] && seed_args="${seed_args} --infra"
        [[ "$SEED_USERS" == "true" ]] && seed_args="${seed_args} --users"
        [[ "$SEED_MENU" == "true" ]] && seed_args="${seed_args} --menu"
        [[ "$SEED_TABLES" == "true" ]] && seed_args="${seed_args} --tables"

        if [[ -n "$seed_args" ]]; then
            sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${backend_dir} && ${python} manage.py seed_full ${seed_args} --lang ${INSTALL_LANG}" >> "$LOG_FILE" 2>&1 || {
                warn "$(_L seed_warn)"
            }
            success "$(_L seed_ok_prefix) ${seed_args}"
        else
            info "$(_L seed_none)"
        fi
    fi

    success "$(_L backend_done)"
}

_setup_backend_env() {
    local backend_env="/etc/ramis/backend.env"

    if [[ -f "$backend_env" ]]; then
        local backup="${backend_env}.bak.$(date '+%Y%m%d-%H%M%S')"
        cp -a "$backend_env" "$backup"
        info "$(printf "$(_L be_env_backup_fmt)" "$backup")"
        if confirm_yn "$(_L q_be_env_preserve)" "e"; then
            success "$(_L be_env_preserved)"
            log "backend.env korundu (yedek: ${backup})"
            return 0
        fi
        warn "$(_L be_env_overwrite_warn)"
    fi

    _create_backend_env
    success "$(_L be_env_ok)"
}

_create_backend_env() {
    local proto="http"

    # IP + Nginx: tek origin (80); domain ile aynı yol tabanlı model.
    local app_origin
    local allowed_hosts
    if [[ "$IP_ONLY_MODE" == "true" ]]; then
        if [[ "${BACKEND_ONLY}" == "true" ]]; then
            app_origin="${proto}://127.0.0.1"
        else
            app_origin="${proto}://${APP_DOMAIN},${proto}://127.0.0.1"
        fi
        allowed_hosts="${API_DOMAIN},127.0.0.1,localhost"
    else
        if [[ "${BACKEND_ONLY}" == "true" ]]; then
            app_origin=""
        else
            app_origin="${proto}://${APP_DOMAIN}"
        fi
        allowed_hosts="${API_DOMAIN},127.0.0.1"
    fi

    local ssl_redirect="false"

    # PostgreSQL şifresi: tek satır + .env/source güvenli çift tırnak
    local pg_pw pg_pw_quoted
    pg_pw=$(env_single_line "$PG_PASSWORD")
    pg_pw_quoted=$(env_file_double_quote "$pg_pw")

    local daphne_instances
    daphne_instances=$(clamp_daphne_instances "${DAPHNE_INSTANCES:-2}")
    DAPHNE_INSTANCES="$daphne_instances"
    local daphne_ports_comment
    daphne_ports_comment=$(daphne_ports_label "$daphne_instances")

    # shellcheck source=system_utils/postgresql_scaling.sh
    source "${SCRIPT_DIR}/system_utils/postgresql_scaling.sh"
    local pg_conn_max_age
    pg_conn_max_age=$(ramis_postgres_recommended_conn_max_age "$daphne_instances")

    local fiscal_webhook_base="http://${API_DOMAIN}"

    cat > /etc/ramis/backend.env << ENVEOF
# Ramis ERP — Üretim ortam dosyası
# Otomatik oluşturuldu: $(date '+%Y-%m-%d %H:%M:%S')
# DİKKAT: Bu dosyayı repoya commit ETMEYİN.

# --- Zorunlu ---
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=${DJANGO_SECRET_KEY}
ALLOWED_HOSTS=${allowed_hosts}

# --- PostgreSQL ---
POSTGRES_DB=${PG_DB}
POSTGRES_USER=${PG_USER}
POSTGRES_PASSWORD=${pg_pw_quoted}
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_CONN_MAX_AGE=${pg_conn_max_age}

# --- Redis ---
REDIS_URL=redis://127.0.0.1:6379/0

# --- WebSocket / Daphne (yoğun KDS) ---
# Kurulum sihirbazı: ${daphne_instances} süreç — portlar ${daphne_ports_comment} (127.0.0.1)
DAPHNE_INSTANCES=${daphne_instances}
# --- HTTP API (Uvicorn) ---
UVICORN_INSTANCES=4
CHANNEL_LAYER_CAPACITY=8000
CHANNEL_LAYER_EXPIRY=120
WS_AUTH_CACHE_SECONDS=60
WS_KDS_STATS_THROTTLE_SECONDS=2
# WS bağlantı rate limit (dakikada maksimum bağlantı)
WS_CONN_MAX_PER_MINUTE=20
# WS throttle eşzamanlı timer limiti
WS_MAX_PENDING_TIMERS=1000
# Celery kuyruğunu atlayıp WS yayınını doğrudan Redis'e gönder (düşük gecikme)
WS_BYPASS_CELERY=false

# --- CSRF / CORS ---
CSRF_TRUSTED_ORIGINS=${app_origin}
CORS_EXTRA_ORIGINS=${app_origin}

# --- HTTPS / güvenlik ---
SECURE_SSL_REDIRECT=${ssl_redirect}
#PRINT_THERMAL_SYNC=True

# --- Akıllı Sipariş Sıralayıcısı Ayarları ---

ENABLE_SMART_FIRING_V2=true
SMART_FIRING_QUEUE_DEPTH_THRESHOLD=8
SMART_FIRING_BACKLOG_MINUTE_FACTOR=2
SMART_FIRING_QUEUE_BUFFER_CAP=30
SMART_FIRING_LEARNED_MIN_SAMPLES=5
# KDS geri çağır drawer: servise gönderilmiş kalemlerin listede kalma süresi (dk)
KDS_RECALL_WINDOW_MINUTES=15

# --- Celery Beat (Europe/Istanbul; migrate/update sonrası sync_celery_beat_schedule) ---
BEAT_CLEANUP_RESERVATIONS_HOUR=3
BEAT_CLEANUP_RESERVATIONS_MINUTE=0
BEAT_ROLLUP_PRODUCT_STATION_TIMING_HOUR=3
BEAT_ROLLUP_PRODUCT_STATION_TIMING_MINUTE=15
PRINTER_STATUS_SYNC_INTERVAL_MINUTES=5
BEAT_SCAN_KITCHEN_LOW_STOCK_HOUR=4
BEAT_SCAN_KITCHEN_LOW_STOCK_MINUTE=0
BEAT_SCAN_OVERDUE_PO_HOUR=5
BEAT_SCAN_OVERDUE_PO_MINUTE=0
BEAT_SCAN_EXPIRING_LOTS_HOUR=4
BEAT_SCAN_EXPIRING_LOTS_MINUTE=30
BEAT_SWEEP_STALE_CLEANING_TABLES_INTERVAL_MINUTES=1
BEAT_NOTIFY_DUE_RESERVATIONS_INTERVAL_MINUTES=1
BEAT_REDIS_CLEANUP_HOUR=2
BEAT_REDIS_CLEANUP_MINUTE=30
BEAT_AUTO_CLOSE_TABLES_HOUR=2
BEAT_AUTO_CLOSE_TABLES_MINUTE=0
BEAT_PURGE_EXPIRED_86_ENABLED=false
BEAT_PURGE_EXPIRED_86_HOUR=5
BEAT_PURGE_EXPIRED_86_MINUTE=0
DEFICIENCY_REPAIR_ENABLED=false
BEAT_DEFICIENCY_REPAIR_HOUR=4
BEAT_DEFICIENCY_REPAIR_MINUTE=45
DEFICIENCY_REPAIR_MIN_AGE_HOURS=24
DEFICIENCY_REPAIR_ORDERED_ACTION=revert_to_approved
DEFICIENCY_REPAIR_STALE_ENABLED=false
DEFICIENCY_REPAIR_STALE_ACTION=cancel


# --- Redis gece bakımı (cleanup-redis-stale-keys) ---
REDIS_MAINTENANCE_ENABLED=true
REDIS_CELERY_RESULT_MAX_IDLE_SECONDS=3600
CELERY_RESULT_EXPIRES_SECONDS=3600
REDIS_ORDER_COUNTER_RETENTION_DAYS=3
REDIS_RBAC_PERM_VERSIONS_TO_KEEP=2
REDIS_SALES_SUMMARY_GENERATIONS_TO_KEEP=3

# --- Yazdırma / PrintJob kuyruğu ---
CELERY_PRINTING_WORKER_CONCURRENCY=4
PRINT_JOB_REQUEUE_PENDING_SECONDS=45
PRINT_JOB_STALE_PROCESSING_SECONDS=180
PRINT_JOB_MAINTENANCE_INTERVAL_SECONDS=30
PRINT_JOB_MAINTENANCE_BATCH_SIZE=100

# --- PDF Export (async) ---
PDF_EXPORT_ASYNC_ENABLED=true
PDF_EXPORT_CACHE_TTL=600
PDF_EXPORT_CACHE_MAX_BYTES=20971520
CELERY_PDF_EXPORT_WORKER_CONCURRENCY=2
# --- WebSocket: menü kataloğu broadcast throttle (saniye) ---
WS_MENU_CATALOG_THROTTLE_SECONDS=5

# --- Stok Rezervasyon (Üretim) ---
PRODUCTION_STOCK_RESERVATION_ENABLED=true

# --- Mali entegrasyon (Token X-Connect Cloud webhook) ---
# Public API taban URL (path olmadan). POS terminal webhook adresi: {base}/api/v1/sales/fiscal/webhook/{terminal_id}/
FISCAL_WEBHOOK_BASE_URL=${fiscal_webhook_base}

ENVEOF

    chown "${SYS_USER}:${SYS_USER}" /etc/ramis/backend.env
    chmod 600 /etc/ramis/backend.env

    if grep -qE "^DAPHNE_INSTANCES=${daphne_instances}$" /etc/ramis/backend.env; then
        info "$(printf "$(_L be_env_daphne_ok)" "$daphne_instances" "$daphne_ports_comment")"
    else
        warn "$(_L be_env_daphne_warn)"
    fi
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 8: Frontend Kurulumu
# ══════════════════════════════════════════════════════════════════════

setup_frontend() {
    step_header "$(_L step_frontend)"

    local frontend_dir="${INSTALL_DIR}/frontend"
    local npm_bin
    npm_bin=$(which npm)
    local node_bin
    node_bin=$(which node)

    local api_url="http://${API_DOMAIN}/api/v1"

    # ── Ortam dosyası oluştur ──
    info "$(_L fe_env)"
    _write_frontend_env_files "${frontend_dir}" "${api_url}"
    success "$(_L fe_env_ok)"

    # ── npm ci ──
    # Yarım kalan node_modules TAR_ENTRY_ERROR / ENOENT üretir; temiz kurulum güvenlidir.
    info "$(_L npm_ci)"
    run_npm_to_log op_npm_ci sudo -u "$SYS_USER" bash -c "set -e; cd ${frontend_dir}; rm -rf node_modules .next 2>/dev/null || true; export CI=1; ${npm_bin} ci --no-audit --no-fund"
    success "$(_L npm_ci_ok)"

    # ── Build ──
    info "$(_L npm_build)"
    local fe_build_exports
    fe_build_exports=$(_frontend_next_public_build_exports)
    run_npm_to_log op_npm_build sudo -u "$SYS_USER" bash -c "set -e; cd ${frontend_dir}; ${fe_build_exports} ${npm_bin} run build"
    success "$(_L npm_build_ok)"

    success "$(_L frontend_done)"
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 9: Systemd Servis Dosyaları
# ══════════════════════════════════════════════════════════════════════

setup_systemd() {
    step_header "$(_L step_systemd)"

    local daphne_bin="${INSTALL_DIR}/backend/.venv/bin/daphne"
    local celery_bin="${INSTALL_DIR}/backend/.venv/bin/celery"
    local node_bin
    node_bin=$(which node)
    local standalone_dir="${INSTALL_DIR}/frontend/.next/standalone"

    # Daphne / Next yalnızca localhost; dışarı Nginx (80) üzerinden (IP veya domain).
    local daphne_bind="127.0.0.1"
    local next_bind="127.0.0.1"

    # ── Daphne (1–4 süreç; DAPHNE_INSTANCES) ──
    info "$(_L svc_w_daphne)"
    # shellcheck source=system_utils/daphne_units.sh
    source "${SCRIPT_DIR}/system_utils/daphne_units.sh"
    ramis_write_daphne_systemd_units "${INSTALL_DIR}" "${SYS_USER}" "${daphne_bin}" "${daphne_bind}"
    success "$(_L svc_d_ok)"

    # ── Uvicorn (1–8 süreç; UVICORN_INSTANCES) ──
    info "$(_L svc_w_uvicorn)"
    # shellcheck source=system_utils/uvicorn_units.sh
    source "${SCRIPT_DIR}/system_utils/uvicorn_units.sh"
    ramis_write_uvicorn_systemd_units "${INSTALL_DIR}" "${SYS_USER}" "127.0.0.1"
    success "$(_L svc_u_ok)"

    # ── ramis-frontend.service ──
    if [[ "${BACKEND_ONLY}" != "true" ]]; then
        info "$(_L svc_w_fe)"
        if [[ ! -f "${standalone_dir}/server.js" ]]; then
            die "Standalone sunucu bulunamadı: ${standalone_dir}/server.js (önce npm run build çalıştırılmalı)"
        fi

        cat > /etc/systemd/system/ramis-frontend.service << SVCEOF
# Ramis ERP — Next.js (output: standalone)
# Otomatik oluşturuldu: $(date '+%Y-%m-%d %H:%M:%S')
[Unit]
Description=Ramis ERP — Next.js (standalone)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SYS_USER}
Group=${SYS_USER}
WorkingDirectory=${standalone_dir}
Environment=NODE_ENV=production
Environment=HOSTNAME=${next_bind}
EnvironmentFile=-/etc/ramis/frontend.env
ExecStart=${node_bin} server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SVCEOF
        success "$(_L svc_fe_ok)"
    fi

    # ── ramis-worker.service (Celery — termal baskı kuyruğu) ──
    info "$(_L svc_w_wrk)"
    # shellcheck source=system_utils/celery_worker_units.sh
    source "${SCRIPT_DIR}/system_utils/celery_worker_units.sh"
    if ramis_write_celery_systemd_units "${INSTALL_DIR}" "${SYS_USER}"; then
        success "$(_L svc_wrk_ok) (concurrency=$(ramis_printing_worker_concurrency))"
    else
        die "ramis-worker.service oluşturulamadı: celery bulunamadı"
    fi

    # ── ramis-beat.service (Celery Beat) ──
    info "$(_L svc_w_beat)"
    cat > /etc/systemd/system/ramis-beat.service << SVCEOF
# Ramis ERP — Celery Beat (Zamanlanmış İşler)
# Otomatik oluşturuldu: $(date '+%Y-%m-%d %H:%M:%S')
[Unit]
Description=Ramis ERP — Celery Beat
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target
Requires=postgresql.service redis-server.service

[Service]
Type=simple
User=${SYS_USER}
Group=${SYS_USER}
WorkingDirectory=${INSTALL_DIR}/backend
Environment=PYTHONUNBUFFERED=1
Environment=RAMIS_DB_APPLICATION_NAME=ramis-celery-beat
EnvironmentFile=-/etc/ramis/backend.env
ExecStart=${celery_bin} -A config beat -l INFO --scheduler django_celery_beat.schedulers:DatabaseScheduler
Restart=on-failure
RestartSec=5
PrivateDevices=false
NoNewPrivileges=false

[Install]
WantedBy=multi-user.target
SVCEOF
    success "$(_L svc_beat_ok)"

    # ── Etkinleştir ve başlat ──
    systemctl daemon-reload
    systemctl enable ramis-daphne.service >> "$LOG_FILE" 2>&1
    for _daphne_port in 8001 8002 8003; do
        systemctl enable "ramis-daphne-${_daphne_port}.service" >> "$LOG_FILE" 2>&1 || true
    done
    if [[ "${BACKEND_ONLY}" != "true" ]]; then
        systemctl enable ramis-frontend.service >> "$LOG_FILE" 2>&1
    fi
    systemctl enable ramis-worker.service >> "$LOG_FILE" 2>&1
    systemctl enable ramis-worker-maintenance.service >> "$LOG_FILE" 2>&1
    systemctl enable ramis-worker-broadcast.service >> "$LOG_FILE" 2>&1
    systemctl enable ramis-worker-pdf.service >> "$LOG_FILE" 2>&1
    systemctl enable ramis-beat.service >> "$LOG_FILE" 2>&1
    # Uvicorn HTTP API (1-8 instance)
    systemctl enable ramis-uvicorn.service >> "$LOG_FILE" 2>&1
    for _uvicorn_port in 9001 9002 9003 9004 9005 9006 9007; do
        systemctl enable "ramis-uvicorn-${_uvicorn_port}.service" >> "$LOG_FILE" 2>&1 || true
    done

    info "$(_L svc_starting)"
    ramis_start_daphne_services >> "$LOG_FILE" 2>&1 || warn "$(printf "$(_L svc_unit_start_fail)" "ramis-daphne")"
    ramis_start_uvicorn_services >> "$LOG_FILE" 2>&1 || warn "$(printf "$(_L svc_unit_start_fail)" "ramis-uvicorn")"
    sleep 2
    if [[ "${BACKEND_ONLY}" != "true" ]]; then
        systemctl start ramis-frontend.service >> "$LOG_FILE" 2>&1 || warn "$(printf "$(_L svc_unit_start_fail)" "ramis-frontend")"
        sleep 2
    fi
    systemctl start ramis-worker.service >> "$LOG_FILE" 2>&1 || warn "$(printf "$(_L svc_unit_start_fail)" "ramis-worker")"
    sleep 2
    systemctl start ramis-worker-maintenance.service >> "$LOG_FILE" 2>&1 || warn "ramis-worker-maintenance başlatılamadı"
    sleep 2
    systemctl start ramis-worker-broadcast.service >> "$LOG_FILE" 2>&1 || warn "ramis-worker-broadcast başlatılamadı"
    sleep 2
    systemctl start ramis-worker-pdf.service >> "$LOG_FILE" 2>&1 || warn "ramis-worker-pdf başlatılamadı"
    sleep 2
    systemctl start ramis-beat.service >> "$LOG_FILE" 2>&1 || warn "$(printf "$(_L svc_unit_start_fail)" "ramis-beat")"
    sleep 2

    if service_active ramis-daphne; then
        success "$(_L svc_d_up)"
    else
        warn "$(_L svc_d_warn)"
    fi

    if service_active ramis-uvicorn; then
        success "$(_L svc_u_up)"
    else
        warn "$(_L svc_u_warn)"
    fi

    if [[ "${BACKEND_ONLY}" != "true" ]]; then
        if service_active ramis-frontend; then
            success "$(_L svc_fe_up)"
        else
            warn "$(_L svc_fe_warn)"
        fi
    fi
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 10: Nginx Konfigürasyon
# ══════════════════════════════════════════════════════════════════════

setup_nginx() {
    step_header "$(_L step_nginx)"

    # Varsayılan site'ı devre dışı bırak
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

    if [[ "${BACKEND_ONLY}" == "true" ]]; then
        _nginx_backend_only
    else
        if [[ "$SAME_DOMAIN" == "true" ]]; then
            _nginx_single_domain
        else
            _nginx_dual_domain
        fi
    fi

    # Syntax kontrolü
    # shellcheck source=system_utils/daphne_units.sh
    source "${SCRIPT_DIR}/system_utils/daphne_units.sh"
    # shellcheck source=system_utils/uvicorn_units.sh
    source "${SCRIPT_DIR}/system_utils/uvicorn_units.sh"
    ramis_apply_split_upstream_to_nginx
    info "$(_L ngx_test)"
    if nginx -t >> "$LOG_FILE" 2>&1; then
        success "$(_L ngx_syntax_ok)"
        systemctl reload nginx >> "$LOG_FILE" 2>&1
        success "$(_L ngx_reload_ok)"
    else
        die "$(_L nginx_die)"
    fi
}

_nginx_single_domain() {
    info "$(_L ngx_single_info)"

    cat > /etc/nginx/sites-available/ramis.conf << 'NGXEOF'
# Ramis ERP — Tek domain (yol tabanlı) konfigürasyon
# Split mimari: /ws/ → Daphne, /api/ + /admin/ → Uvicorn
# __GENERATED_TIMESTAMP__

upstream ramis_daphne {
    least_conn;
__DAPHNE_UPSTREAM_SERVERS__
    keepalive 32;
}

upstream ramis_uvicorn {
    least_conn;
__UVICORN_UPSTREAM_SERVERS__
    keepalive 32;
}

upstream ramis_next {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name __APP_DOMAIN__;

    client_max_body_size 25m;

    # --- Compression ---
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml
        application/rss+xml
        image/svg+xml
        font/woff2;

    # --- Brotli (if module installed) ---
    # brotli on;
    # brotli_comp_level 6;
    # brotli_types text/plain text/css application/json application/javascript text/xml image/svg+xml;

    # API — Uvicorn (HTTP)
    location /api/ {
        proxy_pass http://ramis_uvicorn;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffer_size 16k;
        proxy_buffers 8 16k;
    }

    # Django Admin — Uvicorn (HTTP)
    location /admin/ {
        proxy_pass http://ramis_uvicorn;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Django static (admin statiğleri)
    location /static/ {
        alias __INSTALL_DIR__/backend/staticfiles/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # WebSocket — Daphne (Channels)
    location /ws/ {
        proxy_pass http://ramis_daphne;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
        proxy_buffering off;
        proxy_socket_keepalive on;
        proxy_buffer_size 4k;
        proxy_buffers 2 4k;
    }

    # Medya dosyaları
    location /media/ {
        alias __INSTALL_DIR__/backend/media/;
        expires 7d;
    }

    # Frontend — Next.js (diğer tüm istekler)
    location / {
        proxy_pass http://ramis_next;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
NGXEOF

    # Yer tutucuları değiştir
    sed -i "s|__APP_DOMAIN__|${APP_DOMAIN}|g" /etc/nginx/sites-available/ramis.conf
    sed -i "s|__INSTALL_DIR__|${INSTALL_DIR}|g" /etc/nginx/sites-available/ramis.conf
    sed -i "s|__GENERATED_TIMESTAMP__|$(date '+%Y-%m-%d %H:%M:%S')|g" /etc/nginx/sites-available/ramis.conf

    ln -sf /etc/nginx/sites-available/ramis.conf /etc/nginx/sites-enabled/ramis.conf
    success "$(_L ngx_single_ok)"
}

_nginx_dual_domain() {
    info "$(_L ngx_dual_info)"

    # ── API konfigürasyonu ──
    cat > /etc/nginx/sites-available/ramis-api.conf << 'NGXEOF'
# Ramis ERP — API (Split: /ws/ → Daphne, /api/ + /admin/ → Uvicorn)
# __GENERATED_TIMESTAMP__

upstream ramis_daphne {
    least_conn;
__DAPHNE_UPSTREAM_SERVERS__
    keepalive 32;
}

upstream ramis_uvicorn {
    least_conn;
__UVICORN_UPSTREAM_SERVERS__
    keepalive 32;
}

server {
    listen 80;
    server_name __API_DOMAIN__;

    client_max_body_size 25m;

    # --- Compression ---
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml
        application/rss+xml
        image/svg+xml
        font/woff2;

    # --- Brotli (if module installed) ---
    # brotli on;
    # brotli_comp_level 6;
    # brotli_types text/plain text/css application/json application/javascript text/xml image/svg+xml;

    add_header X-Frame-Options "DENY" always;

    # API — Uvicorn (HTTP)
    location /api/ {
        proxy_pass http://ramis_uvicorn;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffer_size 16k;
        proxy_buffers 8 16k;
    }

    # Django Admin — Uvicorn (HTTP)
    location /admin/ {
        proxy_pass http://ramis_uvicorn;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Genel API girişi (health, root, vs.) — Uvicorn
    location / {
        proxy_pass http://ramis_uvicorn;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket — Daphne (Channels)
    location /ws/ {
        proxy_pass http://ramis_daphne;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
        proxy_buffering off;
        proxy_socket_keepalive on;
        proxy_buffer_size 4k;
        proxy_buffers 2 4k;
    }

    # Django static (admin statiğleri)
    location /static/ {
        alias __INSTALL_DIR__/backend/staticfiles/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Medya dosyaları
    location /media/ {
        alias __INSTALL_DIR__/backend/media/;
        expires 7d;
    }
}
NGXEOF

    # ── Frontend konfigürasyonu ──
    cat > /etc/nginx/sites-available/ramis-app.conf << 'NGXEOF'
# Ramis ERP — Frontend (Next.js)
# __GENERATED_TIMESTAMP__

upstream ramis_next {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name __APP_DOMAIN__;

    client_max_body_size 25m;

    # --- Compression ---
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml
        application/rss+xml
        image/svg+xml
        font/woff2;

    # --- Brotli (if module installed) ---
    # brotli on;
    # brotli_comp_level 6;
    # brotli_types text/plain text/css application/json application/javascript text/xml image/svg+xml;

    location / {
        proxy_pass http://ramis_next;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
NGXEOF

    # Yer tutucuları değiştir
    sed -i "s|__API_DOMAIN__|${API_DOMAIN}|g" /etc/nginx/sites-available/ramis-api.conf
    sed -i "s|__APP_DOMAIN__|${APP_DOMAIN}|g" /etc/nginx/sites-available/ramis-app.conf
    sed -i "s|__INSTALL_DIR__|${INSTALL_DIR}|g" /etc/nginx/sites-available/ramis-api.conf
    sed -i "s|__GENERATED_TIMESTAMP__|$(date '+%Y-%m-%d %H:%M:%S')|g" /etc/nginx/sites-available/ramis-api.conf
    sed -i "s|__GENERATED_TIMESTAMP__|$(date '+%Y-%m-%d %H:%M:%S')|g" /etc/nginx/sites-available/ramis-app.conf

    ln -sf /etc/nginx/sites-available/ramis-api.conf /etc/nginx/sites-enabled/ramis-api.conf
    ln -sf /etc/nginx/sites-available/ramis-app.conf /etc/nginx/sites-enabled/ramis-app.conf
    success "$(_L ngx_dual_ok)"
}

_nginx_backend_only() {
    info "Sadece API (Backend) Nginx konfigürasyonu oluşturuluyor..."

    cat > /etc/nginx/sites-available/ramis-api.conf << 'NGXEOF'
# Ramis ERP — API (Split: /ws/ → Daphne, /api/ + /admin/ → Uvicorn)
# __GENERATED_TIMESTAMP__

upstream ramis_daphne {
    least_conn;
__DAPHNE_UPSTREAM_SERVERS__
    keepalive 32;
}

upstream ramis_uvicorn {
    least_conn;
__UVICORN_UPSTREAM_SERVERS__
    keepalive 32;
}

server {
    listen 80;
    server_name __API_DOMAIN__;

    client_max_body_size 25m;

    # --- Compression ---
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml
        application/rss+xml
        image/svg+xml
        font/woff2;

    # --- Brotli (if module installed) ---
    # brotli on;
    # brotli_comp_level 6;
    # brotli_types text/plain text/css application/json application/javascript text/xml image/svg+xml;

    add_header X-Frame-Options "DENY" always;

    # API — Uvicorn (HTTP)
    location /api/ {
        proxy_pass http://ramis_uvicorn;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffer_size 16k;
        proxy_buffers 8 16k;
    }

    # Django Admin — Uvicorn (HTTP)
    location /admin/ {
        proxy_pass http://ramis_uvicorn;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Genel API girişi (health, root, vs.) — Uvicorn
    location / {
        proxy_pass http://ramis_uvicorn;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket — Daphne (Channels)
    location /ws/ {
        proxy_pass http://ramis_daphne;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
        proxy_buffering off;
        proxy_socket_keepalive on;
        proxy_buffer_size 4k;
        proxy_buffers 2 4k;
    }

    # Django static (admin statiğleri)
    location /static/ {
        alias __INSTALL_DIR__/backend/staticfiles/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Medya dosyaları
    location /media/ {
        alias __INSTALL_DIR__/backend/media/;
        expires 7d;
    }
}
NGXEOF

    # Yer tutucuları değiştir
    sed -i "s|__API_DOMAIN__|${API_DOMAIN}|g" /etc/nginx/sites-available/ramis-api.conf
    sed -i "s|__INSTALL_DIR__|${INSTALL_DIR}|g" /etc/nginx/sites-available/ramis-api.conf
    sed -i "s|__GENERATED_TIMESTAMP__|$(date '+%Y-%m-%d %H:%M:%S')|g" /etc/nginx/sites-available/ramis-api.conf

    ln -sf /etc/nginx/sites-available/ramis-api.conf /etc/nginx/sites-enabled/ramis-api.conf
    success "Sadece API (Backend) Nginx konfigürasyonu tamamlandı"
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 11: Firewall
# ══════════════════════════════════════════════════════════════════════

setup_firewall() {
    step_header "$(_L step_firewall)"

    if ! command_exists ufw; then
        warn "$(_L fw_nf)"
        info "$(_L fw_nf_hint)"
        return 0
    fi

    info "$(_L fw_rules_apply)"

    # Hata durumunda scriptin durmasını engellemek için yerel hata yönetimi
    local fw_error=false

    # SSH erişimi korunmalı
    if ! ufw allow OpenSSH >> "$LOG_FILE" 2>&1; then
        warn "$(_L fw_ssh_bad)"
        fw_error=true
    else
        success "$(_L fw_ssh_ok)"
    fi

    if [[ "$IP_ONLY_MODE" == "true" ]]; then
        # IP modu: yalnızca HTTP (SSL kurulumu yok)
        if ! ufw allow 'Nginx HTTP' >> "$LOG_FILE" 2>&1 || ! ufw allow 9100/tcp >> "$LOG_FILE" 2>&1; then
            warn "$(_L fw_nf_rule)"
            fw_error=true
        else
            success "$(_L fw_ip_ok)"
        fi
    else
        # Domain modu: HTTP + HTTPS (Nginx Full = 80 + 443)
        if ! ufw allow 'Nginx Full' >> "$LOG_FILE" 2>&1 || ! ufw allow 9100/tcp >> "$LOG_FILE" 2>&1; then
            warn "$(_L fw_nf_rule_alt)"
            fw_error=true
        else
            success "$(_L fw_dom_ok)"
        fi
    fi

    # Firewall'ı etkinleştir
    info "$(_L fw_enable)"
    if ! echo "y" | ufw enable >> "$LOG_FILE" 2>&1; then
        warn "$(_L fw_enable_bad)"
        fw_error=true
    else
        success "$(_L fw_enabled_ok)"
    fi

    if [ "$fw_error" = true ]; then
        warn "$(_L fw_err_summary)"
        info "$(_L fw_manual_hint)"
    else
        info "$(_L fw_ok_summary)"
        success "$(_L fw_ok_title)"
    fi
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 12: system_utils (masaüstü yönetim araçları)
# ══════════════════════════════════════════════════════════════════════

desktop_session_user() {
    if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
        echo "$SUDO_USER"
        return 0
    fi
    return 1
}

_install_util_desktop_entry() {
    local user="$1"
    local file_id="$2"
    local name="$3"
    local exec_path="$4"
    local icon="$5"
    local categories="$6"

    local home
    home=$(getent passwd "$user" | cut -d: -f6) || return 1
    [[ -n "$home" && -d "$home" ]] || return 1

    local apps_dir="${home}/.local/share/applications"
    mkdir -p "$apps_dir"
    cat > "${apps_dir}/${file_id}" <<EOF
[Desktop Entry]
Version=1.0
Name=${name}
Exec=${exec_path}
Icon=${icon}
Terminal=false
Type=Application
Categories=${categories};
EOF
    chown "${user}:${user}" "${apps_dir}/${file_id}"
    chmod 644 "${apps_dir}/${file_id}"
}

_install_util_autostart_entry() {
    local user="$1"
    local file_id="$2"
    local name="$3"
    local exec_path="$4"
    local icon="$5"

    local home
    home=$(getent passwd "$user" | cut -d: -f6) || return 1
    [[ -n "$home" && -d "$home" ]] || return 1

    local autostart_dir="${home}/.config/autostart"
    mkdir -p "$autostart_dir"
    cat > "${autostart_dir}/${file_id}" <<EOF
[Desktop Entry]
Version=1.0
Name=${name}
Exec=${exec_path}
Icon=${icon}
Terminal=false
Type=Application
X-GNOME-Autostart-enabled=true
EOF
    chown "${user}:${user}" "${autostart_dir}/${file_id}"
    chmod 644 "${autostart_dir}/${file_id}"
}

setup_system_utils() {
    step_header "$(_L step_system_utils)"

    local utils_dir="${INSTALL_DIR}/system_utils"
    if [[ ! -d "$utils_dir" ]]; then
        warn "$(_L utils_dir_missing)"
        return 0
    fi

    section_hint "$(_L utils_hint)"

    info "$(_L utils_deps)"
    run_apt_to_log op_apt_gtk env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        python3-gi \
        gir1.2-gtk-4.0 \
        gir1.2-adw-1 \
        policykit-1
    success "$(_L utils_deps_ok)"

    info "$(_L utils_chmod)"
    local tool_dir tool_dirs=(ramis_monitor user_emergency db_maintenance backup_restore)
    for tool_dir in "${tool_dirs[@]}"; do
        if [[ -d "${utils_dir}/${tool_dir}" ]]; then
            find "${utils_dir}/${tool_dir}" -maxdepth 1 -type f \( -name 'run_*.sh' -o -name '*.py' \) -exec chmod +x {} +
        fi
    done
    success "$(_L utils_chmod_ok)"

    local desk_user
    if desk_user=$(desktop_session_user); then
        info "$(printf "$(_L utils_menu_user_fmt)" "$desk_user")"
        _install_util_desktop_entry "$desk_user" "ramis-monitor.desktop" \
            "$(_L utils_app_monitor)" \
            "${utils_dir}/ramis_monitor/run_monitor.sh" \
            "utilities-system-monitor" "System;Monitor"
        info "$(_L utils_monitor_autostart)"
        _install_util_autostart_entry "$desk_user" "ramis-monitor.desktop" \
            "$(_L utils_app_monitor)" \
            "${utils_dir}/ramis_monitor/run_monitor.sh" \
            "utilities-system-monitor"
        success "$(_L utils_monitor_autostart_ok)"
        _install_util_desktop_entry "$desk_user" "ramis-user-emergency.desktop" \
            "$(_L utils_app_users)" \
            "${utils_dir}/user_emergency/run_users.sh" \
            "system-users" "System;Settings"
        _install_util_desktop_entry "$desk_user" "ramis-db-maintenance.desktop" \
            "$(_L utils_app_db)" \
            "${utils_dir}/db_maintenance/run_maintenance.sh" \
            "view-refresh" "System;Settings"
        _install_util_desktop_entry "$desk_user" "ramis-backup.desktop" \
            "$(_L utils_app_backup)" \
            "${utils_dir}/backup_restore/run_backup.sh" \
            "document-save-as" "System;Settings"
        success "$(_L utils_menu_ok)"
    else
        info "$(_L utils_no_desktop_user)"
    fi

    success "$(_L utils_done)"
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 13: Frontend Kaynak Temizliği
# ══════════════════════════════════════════════════════════════════════

# next build (output: standalone) + postbuild tamamlandıktan sonra
# üretim sunucusunda artık ihtiyaç duyulmayan kaynak dosyaları temizler.
# Korunanlar: .next/  (çalışan standalone build)
#              .env.local  (rsync hariç tutulur, install.sh oluşturur)
#              scripts/    (prepare-standalone.sh — _prepare_next_standalone tarafından kullanılır)
_cleanup_frontend_sources() {
    local frontend_dir="${1:-${INSTALL_DIR}/frontend}"

    if [[ ! -f "${frontend_dir}/.next/standalone/server.js" ]]; then
        warn "Frontend kaynak temizliği atlandı: standalone build bulunamadı"
        return 1
    fi

    if ! service_active ramis-frontend; then
        warn "Frontend kaynak temizliği atlandı: ramis-frontend servisi çalışmıyor"
        return 1
    fi

    info "Frontend kaynak dosyaları temizleniyor (üretimde gerekli değil)..."

    local cleaned=0
    while IFS= read -r -d '' entry; do
        local base
        base=$(basename "$entry")
        case "$base" in
            .next|.env.local|scripts) : ;;
            *)
                rm -rf "$entry"
                cleaned=1
                ;;
        esac
    done < <(find "${frontend_dir}" -maxdepth 1 -mindepth 1 -print0 2>/dev/null)

    if [[ "$cleaned" -eq 1 ]]; then
        success "Frontend kaynak dosyaları temizlendi (.next/ ve scripts/ korundu)"
        log "Frontend source cleanup tamamlandı: ${frontend_dir}"
    else
        info "Frontend kaynak dizini zaten temiz"
    fi
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 14: Doğrulama ve Özet
# ══════════════════════════════════════════════════════════════════════

verify_installation() {
    step_header "$(_L step_verify)"

    section_hint "$(_L vrf_hint)"

    local all_ok=true

    # PostgreSQL
    if sudo -u postgres pg_isready -q 2>/dev/null; then
        success "$(printf '%-22s %s' "$(_L vrf_pg_lbl)" "$(_L st_pg_run)")"
    else
        fail "$(printf '%-22s %s' "$(_L vrf_pg_lbl)" "$(_L st_pg_down)")"
        all_ok=false
    fi

    if ! _verify_postgres_app_credentials; then
        all_ok=false
    fi

    # Redis
    if redis-cli ping 2>/dev/null | grep -q PONG; then
        success "$(printf '%-22s %s' "$(_L vrf_rd_lbl)" "$(_L st_pg_run)")"
    else
        fail "$(printf '%-22s %s' "$(_L vrf_rd_lbl)" "$(_L st_pg_down)")"
        all_ok=false
    fi

    # Daphne servisi
    if service_active ramis-daphne; then
        success "$(printf '%-22s %s' "$(_L vrf_daphne_lbl)" "$(_L st_pg_run)")"
    else
        fail "$(printf '%-22s %s' "$(_L vrf_daphne_lbl)" "$(_L st_pg_down)")"
        all_ok=false
    fi

    # Uvicorn servisi
    if service_active ramis-uvicorn; then
        success "$(printf '%-22s %s' "$(_L vrf_uvicorn_lbl)" "$(_L st_pg_run)")"
    else
        fail "$(printf '%-22s %s' "$(_L vrf_uvicorn_lbl)" "$(_L st_pg_down)")"
        all_ok=false
    fi

    # Frontend servisi
    if [[ "${BACKEND_ONLY}" != "true" ]]; then
        if service_active ramis-frontend; then
            success "$(printf '%-22s %s' "$(_L vrf_fe_lbl)" "$(_L st_pg_run)")"
        else
            fail "$(printf '%-22s %s' "$(_L vrf_fe_lbl)" "$(_L st_pg_down)")"
            all_ok=false
        fi
    fi

    # Celery Worker servisi
    if service_active ramis-worker; then
        success "$(printf '%-22s %s' "$(_L vrf_wrk_lbl)" "$(_L st_pg_run)")"
    else
        fail "$(printf '%-22s %s' "$(_L vrf_wrk_lbl)" "$(_L st_pg_down)")"
        all_ok=false
    fi

    if service_active ramis-worker-maintenance; then
        success "$(printf '%-22s %s' 'ramis-worker-maintenance' "$(_L st_pg_run)")"
    else
        fail "$(printf '%-22s %s' 'ramis-worker-maintenance' "$(_L st_pg_down)")"
        all_ok=false
    fi

    if service_active ramis-worker-broadcast; then
        success "$(printf '%-22s %s' 'ramis-worker-broadcast' "$(_L st_pg_run)")"
    else
        fail "$(printf '%-22s %s' 'ramis-worker-broadcast' "$(_L st_pg_down)")"
        all_ok=false
    fi

    if service_active ramis-worker-pdf; then
        success "$(printf '%-22s %s' 'ramis-worker-pdf' "$(_L st_pg_run)")"
    else
        fail "$(printf '%-22s %s' 'ramis-worker-pdf' "$(_L st_pg_down)")"
        all_ok=false
    fi

    # Celery Beat servisi
    if service_active ramis-beat; then
        success "$(printf '%-22s %s' "$(_L vrf_beat_lbl)" "$(_L st_pg_run)")"
    else
        fail "$(printf '%-22s %s' "$(_L vrf_beat_lbl)" "$(_L st_pg_down)")"
        all_ok=false
    fi

    if service_active nginx; then
        success "$(printf '%-22s %s' "$(_L vrf_ngx_lbl)" "$(_L st_pg_run)")"
    else
        fail "$(printf '%-22s %s' "$(_L vrf_ngx_lbl)" "$(_L st_pg_down)")"
        all_ok=false
    fi

    # API health check
    sleep 3
    if curl -sfo /dev/null --max-time 10 http://127.0.0.1:9000/ 2>/dev/null; then
        success "$(printf '%-22s %s' "$(_L vrf_api_if)" "$(_L st_ok)")"
    else
        warn "$(printf '%-22s %s' "$(_L vrf_api_if)" "$(_L st_wait)")"
    fi

    # Frontend health check
    if [[ "${BACKEND_ONLY}" != "true" ]]; then
        if curl -sfo /dev/null --max-time 10 http://127.0.0.1:3000/ 2>/dev/null; then
            success "$(printf '%-22s %s' "$(_L vrf_fe_if)" "$(_L st_ok)")"
        else
            warn "$(printf '%-22s %s' "$(_L vrf_fe_if)" "$(_L st_wait)")"
        fi
    fi

    echo ""

    local proto="http"

    echo ""
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    if $all_ok; then
        echo -e "  ${GREEN}${BOLD}$(_L fin_complete)${NC}  ${DIM}·  ${STEP_TOTAL} $(_L fin_steps_applied)${NC}"
    else
        echo -e "  ${YELLOW}${BOLD}$(_L fin_partial)${NC}  ${DIM}·  $(_L fin_warnings)${NC}"
    fi
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BOLD}$(_L lbl_web_access)${NC}"
    echo ""

    if [[ "${BACKEND_ONLY}" == "true" ]]; then
        if [[ "$IP_ONLY_MODE" == "true" ]]; then
            printf '    %-20s %s\n' "$(_L l_rest)" "${BOLD}http://${API_DOMAIN}/api/v1/${NC}"
            printf '    %-20s %s\n' "$(_L l_ws)" "${BOLD}http://${API_DOMAIN}/ws/${NC}"
            printf '    %-20s %s\n' "$(_L l_dj_adm)" "${BOLD}http://${API_DOMAIN}/admin/${NC}"
        else
            printf '    %-20s %s\n' "$(_L l_apibase)" "${BOLD}${proto}://${API_DOMAIN}/api/v1/${NC}"
            printf '    %-20s %s\n' "$(_L l_dj_adm)" "${BOLD}${proto}://${API_DOMAIN}/admin/${NC}"
        fi
    else
        if [[ "$SAME_DOMAIN" == "true" ]]; then
            if [[ "$IP_ONLY_MODE" == "true" ]]; then
                printf '    %-20s %s\n' "$(_L l_panel)" "${BOLD}http://${APP_DOMAIN}/panel${NC}"
                printf '    %-20s %s\n' "$(_L l_home)" "${BOLD}http://${APP_DOMAIN}/${NC}"
                printf '    %-20s %s\n' "$(_L l_rest)" "${BOLD}http://${APP_DOMAIN}/api/v1/${NC}"
                printf '    %-20s %s\n' "$(_L l_ws)" "${BOLD}http://${APP_DOMAIN}/ws/${NC}"
                printf '    %-20s %s\n' "$(_L l_dj_adm)" "${BOLD}http://${APP_DOMAIN}/admin/${NC}"
            else
                printf '    %-20s %s\n' "$(_L l_panel2)" "${BOLD}${proto}://${APP_DOMAIN}/panel${NC}"
                printf '    %-20s %s\n' "$(_L l_apibase)" "${BOLD}${proto}://${APP_DOMAIN}/api/v1/${NC}"
                printf '    %-20s %s\n' "$(_L l_dj_adm)" "${BOLD}${proto}://${APP_DOMAIN}/admin/${NC}"
            fi
        else
            printf '    %-20s %s\n' "$(_L l_fe_host)" "${BOLD}${proto}://${APP_DOMAIN}/panel${NC}"
            printf '    %-20s %s\n' "$(_L l_apidom)" "${BOLD}${proto}://${API_DOMAIN}/api/v1/${NC}"
            printf '    %-20s %s\n' "$(_L l_dj_adm)" "${BOLD}${proto}://${API_DOMAIN}/admin/${NC}"
        fi
    fi

    echo ""
    echo -e "  ${BOLD}$(_L lbl_admin_acct)${NC}"
    echo ""
    printf '    %-20s %s\n' "$(_L l_uname)" "${BOLD}${ADMIN_USER}${NC}"
    printf '    %-20s %s\n' "$(_L l_mail)" "${BOLD}${ADMIN_EMAIL}${NC}"
    echo ""
    echo -e "  ${BOLD}$(_L l_cfgs)${NC}"
    echo ""
    printf '    %-20s %s\n' "$(_L l_inst_log)" "${BOLD}/var/log/ramis/install.log${NC}"
    printf '    %-20s %s\n' "$(_L l_run_logs)" "${BOLD}/var/log/ramis/${NC}"
    printf '    %-20s %s\n' "$(_L l_be_env)" "${BOLD}/etc/ramis/backend.env${NC}"
    if [[ "${BACKEND_ONLY}" != "true" ]]; then
        printf '    %-20s %s\n' "$(_L l_fe_env)" "${BOLD}/etc/ramis/frontend.env${NC}"
    fi
    if [[ -d "${INSTALL_DIR}/system_utils" ]]; then
        printf '    %-20s %s\n' "$(_L l_utils_dir)" "${BOLD}${INSTALL_DIR}/system_utils/${NC}"
    fi
    echo ""
    echo -e "  ${BOLD}$(_L l_cfgs_cmds)${NC}"
    echo ""
    echo -e "    ${DIM}#${NC} $(_L l_cmds_status)"
    if [[ "${BACKEND_ONLY}" == "true" ]]; then
        echo -e "    ${BOLD}sudo systemctl status ramis-daphne ramis-uvicorn ramis-worker ramis-worker-maintenance ramis-worker-broadcast ramis-beat${NC}"
    else
        echo -e "    ${BOLD}sudo systemctl status ramis-daphne ramis-uvicorn ramis-frontend ramis-worker ramis-worker-maintenance ramis-worker-broadcast ramis-beat${NC}"
    fi
    echo ""
    echo -e "    ${DIM}#${NC} $(_L l_cmds_journal)"
    echo -e "    ${BOLD}sudo journalctl -u ramis-daphne -f${NC}"
    echo ""
    echo -e "    ${DIM}#${NC} $(_L l_cmds_update)"
    echo -e "    ${BOLD}sudo bash update.sh${NC}"
    echo ""
    echo -e "${CYAN}  ──────────────────────────────────────────────────────────────────────${NC}"
    echo -e "  ${DIM}$(_L l_udev_hint)${NC}"
    echo -e "SUBSYSTEM==\"usb\", ATTR{bInterfaceClass}==\"07\", MODE=\"0666\", GROUP=\"dialout\"" | sudo tee /etc/udev/rules.d/99-escpos.rules > /dev/null
    sudo udevadm control --reload-rules && sudo udevadm trigger
    success "$(_L l_udev_ok)"
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# ══════════════════════════════════════════════════════════════════════
# ANA AKIŞ
# ══════════════════════════════════════════════════════════════════════

main() {
    select_install_language
    banner
    preflight_checks
    interactive_wizard
    install_system_deps
    setup_user_and_dirs
    deploy_project_files
    info "$(_L be_env_wr)"
    _setup_backend_env
    setup_postgresql
    setup_backend
    if [[ "${BACKEND_ONLY}" != "true" ]]; then
        setup_frontend
    fi
    setup_systemd
    setup_nginx
    setup_firewall
    setup_system_utils
    verify_installation
    if [[ "${BACKEND_ONLY}" != "true" ]]; then
        _cleanup_frontend_sources "${INSTALL_DIR}/frontend"
    fi
}

main "$@"
