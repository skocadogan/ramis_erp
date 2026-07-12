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

# ── Global değişkenler ────────────────────────────────────────────────
INSTALL_DIR="/srv/ramis_erp"
SYS_USER="ramis"
PG_DB="ramis"
PG_USER="ramis"

# ── Yardımcı fonksiyonlar ────────────────────────────────────────────

info()    { echo -e "  ${INFO}  $*"; }
success() { echo -e "  ${CHECK}  $*"; }
warn()    { echo -e "  ${WARN}  $*"; }
die()     { echo ""; echo -e "  ${RED}✗  $*${NC}"; echo ""; exit 1; }

section() {
    echo ""
    echo -e "${CYAN}  ──────────────────────────────────────────────────────────────────────${NC}"
    echo -e "  ${DIM}$1${NC}  ${BOLD}$2${NC}"
    echo -e "${CYAN}  ──────────────────────────────────────────────────────────────────────${NC}"
    echo ""
}

confirm_yn() {
    local prompt="$1"
    local default="${2:-h}"
    local answer
    if [[ "$default" == "e" ]]; then
        read -rp "  $prompt [E/h]: " answer
        answer="${answer:-e}"
    else
        read -rp "  $prompt [e/H]: " answer
        answer="${answer:-h}"
    fi
    [[ "${answer,,}" == "e" || "${answer,,}" == "evet" || "${answer,,}" == "y" || "${answer,,}" == "yes" ]]
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

# ══════════════════════════════════════════════════════════════════════
# ANA AKIŞ
# ══════════════════════════════════════════════════════════════════════

main() {
    echo ""
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo -e "  ${BOLD}RAMIS ERP · Kurulumu kaldır${NC}"
    echo -e "  ${DIM}Uygulama servisleri, Nginx site dosyaları ve ortam yapılandırması kaldırılır.${NC}"
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo ""

    if [[ $EUID -ne 0 ]]; then
        die "Bu betik yönetici yetkisiyle çalıştırılmalıdır: sudo bash uninstall.sh"
    fi

    warn "Bu işlem sunucudan Ramis uygulamasını kaldırır; veritabanı ve proje dosyaları isteğinize bağlı silinir."
    echo ""
    if ! confirm_yn "Kaldırmaya devam edilsin mi?" "h"; then
        echo -e "  ${DIM}İşlem iptal edildi.${NC}"
        echo ""
        exit 0
    fi
    echo ""

    load_postgres_config

    section "1 · Servisler" "Duraklatılıyor"
    info "ramis-daphne, uvicorn, frontend, worker, beat durduruluyor ve devre dışı bırakılıyor…"
    systemctl stop ramis-frontend.service 2>/dev/null || true
    systemctl stop ramis-daphne.service 2>/dev/null || true
    systemctl stop ramis-uvicorn.service 2>/dev/null || true
    systemctl stop ramis-worker.service 2>/dev/null || true
    systemctl stop ramis-worker-maintenance.service 2>/dev/null || true
    systemctl stop ramis-worker-broadcast.service 2>/dev/null || true
    systemctl stop ramis-beat.service 2>/dev/null || true
    systemctl disable ramis-frontend.service 2>/dev/null || true
    systemctl disable ramis-daphne.service 2>/dev/null || true
    systemctl disable ramis-uvicorn.service 2>/dev/null || true
    systemctl disable ramis-worker.service 2>/dev/null || true
    systemctl disable ramis-worker-maintenance.service 2>/dev/null || true
    systemctl disable ramis-worker-broadcast.service 2>/dev/null || true
    systemctl disable ramis-beat.service 2>/dev/null || true
    # Daphne ek port birimleri
    for port in 8001 8002 8003; do
        systemctl stop "ramis-daphne-${port}.service" 2>/dev/null || true
        systemctl disable "ramis-daphne-${port}.service" 2>/dev/null || true
    done
    # Uvicorn ek port birimleri
    for port in 9001 9002 9003 9004 9005 9006 9007; do
        systemctl stop "ramis-uvicorn-${port}.service" 2>/dev/null || true
        systemctl disable "ramis-uvicorn-${port}.service" 2>/dev/null || true
    done
    success "Ramis systemd birimleri durduruldu"

    section "2 · Systemd" "Birim dosyaları siliniyor"
    rm -f /etc/systemd/system/ramis-daphne.service
    rm -f /etc/systemd/system/ramis-uvicorn.service
    rm -f /etc/systemd/system/ramis-frontend.service
    rm -f /etc/systemd/system/ramis-worker.service
    rm -f /etc/systemd/system/ramis-worker-maintenance.service
    rm -f /etc/systemd/system/ramis-worker-broadcast.service
    rm -f /etc/systemd/system/ramis-beat.service
    rm -f /etc/systemd/system/ramis-daphne-8001.service
    rm -f /etc/systemd/system/ramis-daphne-8002.service
    rm -f /etc/systemd/system/ramis-daphne-8003.service
    # Uvicorn ek port birimleri
    for port in 9001 9002 9003 9004 9005 9006 9007; do
        rm -f "/etc/systemd/system/ramis-uvicorn-${port}.service"
    done
    systemctl daemon-reload
    success "/etc/systemd/system içindeki Ramis birim tanımları kaldırıldı"

    section "3 · Nginx" "Site yapılandırması"
    rm -f /etc/nginx/sites-enabled/ramis.conf
    rm -f /etc/nginx/sites-enabled/ramis-api.conf
    rm -f /etc/nginx/sites-enabled/ramis-app.conf
    rm -f /etc/nginx/sites-available/ramis.conf
    rm -f /etc/nginx/sites-available/ramis-api.conf
    rm -f /etc/nginx/sites-available/ramis-app.conf

    if nginx -t 2>/dev/null; then
        systemctl reload nginx 2>/dev/null || true
    fi
    success "Ramis Nginx site dosyaları kaldırıldı (nginx paketi kurulu kalır)"

    section "4 · PostgreSQL" "Veritabanı ve uygulama rolü"
    warn "Sıfır kurulum için Ramis veritabanı ve DB kullanıcısının tamamen kaldırılması önerilir."
    echo ""
    info "backend.env kaynaklı hedef: veritabanı='${PG_DB}', kullanıcı='${PG_USER}'"
    echo ""

    if confirm_yn "PostgreSQL veritabanını ve kullanıcı rolünü tamamen silmek istiyor musunuz?" "e"; then
        local pg_db pg_user input_db input_user
        pg_db=$(normalize_pg_name "$PG_DB")
        pg_user=$(normalize_pg_name "$PG_USER")

        if confirm_yn "Farklı veritabanı/kullanıcı adı girmek ister misiniz? (varsayılan: ${pg_db} / ${pg_user})" "h"; then
            read -rp "  Veritabanı adı [${pg_db}]: " input_db
            read -rp "  Kullanıcı adı [${pg_user}]: " input_user
            [[ -n "$input_db" ]] && pg_db=$(normalize_pg_name "$input_db")
            [[ -n "$input_user" ]] && pg_user=$(normalize_pg_name "$input_user")
        fi

        remove_postgresql_ramis "$pg_db" "$pg_user" || true
    else
        info "PostgreSQL veritabanı ve kullanıcı korundu."
    fi

    section "5 · Ortam" "/etc/ramis"
    rm -f /etc/ramis/backend.env
    rm -f /etc/ramis/frontend.env
    rm -f /etc/ramis/runtime-config.json
    rm -rf /etc/ramis/lang
    rmdir /etc/ramis 2>/dev/null || true
    success "Ortam dosyaları silindi"

    section "6 · Uygulama dosyaları" "İsteğe bağlı"
    if [[ -d "$INSTALL_DIR" ]]; then
        if confirm_yn "Kurulum dizinini tamamen silmek istiyor musunuz? (${INSTALL_DIR})" "h"; then
            rm -rf "$INSTALL_DIR"
            success "Kurulum dizini silindi: ${INSTALL_DIR}"
        else
            info "Kurulum dizini korundu: ${INSTALL_DIR}"
        fi
    else
        info "Kurulum dizini zaten yok: ${INSTALL_DIR}"
    fi

    section "7 · Günlük dosyaları" "İsteğe bağlı"
    if [[ -d "/var/log/ramis" ]]; then
        if confirm_yn "/var/log/ramis altındaki günlükleri silmek istiyor musunuz?" "h"; then
            rm -rf /var/log/ramis
            success "Ramis günlük dizini silindi"
        else
            info "Günlükler korundu (/var/log/ramis)"
        fi
    fi

    section "8 · Sistem kullanıcısı" "İsteğe bağlı"
    if id "$SYS_USER" &>/dev/null; then
        if confirm_yn "'${SYS_USER}' sistem kullanıcısını silmek istiyor musunuz?" "h"; then
            userdel -r "$SYS_USER" 2>/dev/null || userdel "$SYS_USER" 2>/dev/null || true
            success "Kullanıcı '${SYS_USER}' kaldırıldı"
        else
            info "Kullanıcı '${SYS_USER}' korundu (dosya sahipliği için gerekebilir)"
        fi
    fi

    section "9 · Güvenlik duvarı (UFW)" "İsteğe bağlı"
    if command -v ufw &>/dev/null && \
       ufw status | grep -q "Durum: etkin"; then
        if confirm_yn "Ramis ile eklenen UFW kurallarını (80, 9100, vb.) kaldırmayı deneyelim mi?" "h"; then
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
            success "İlgili UFW kuralları silinmeye çalışıldı (tanımsız kural uyarısı normal olabilir)"
        else
            info "UFW kuralları değiştirilmedi"
        fi
    else
        info "UFW etkin değil veya yüklü değil; atlandı"
    fi

    echo ""
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo -e "  ${GREEN}${BOLD}Kaldırma işlemi tamamlandı.${NC}"
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${DIM}PostgreSQL, Redis, Nginx, Node.js gibi sistem paketleri otomatik kaldırılmaz.${NC}"
    echo -e "  ${DIM}Yalnızca onayladığınız öğeler silindi; gerekiyorsa paketleri apt ile kaldırabilirsiniz.${NC}"
    echo ""
}

main "$@"
