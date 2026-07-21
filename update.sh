#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════╗
# ║  Ramis  — Güncelleme Scripti                                    ║
# ║  Kullanım: sudo bash update.sh [SEÇENEK]                           ║
# ║  Mevcut kurulumu günceller, servisleri yeniden başlatır.            ║
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
CROSS="${RED}✗${NC}"
WARN="${YELLOW}‼${NC}"
INFO="${BLUE}·${NC}"

# ── Global değişkenler ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/ramis/update.log"
INSTALL_DIR="/srv/ramis_erp"
SYS_USER="ramis"
REBUILD_FRONTEND="false"
# all | db | backend | frontend | change-ip | sync-runtime-config | sync-celery-workers
UPDATE_MODE="all"
RELOAD_ROLES="false"
RESET_USERS="false"
SEED_ALLERGENS="false"
INSTALL_LANG="tr"
CHANGE_IP_MANUAL=""

# ── Yardımcı fonksiyonlar ────────────────────────────────────────────

log()     { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE" 2>/dev/null || true; }
info()    { echo -e "  ${INFO}  $*"; log "INFO: $*"; }
success() { echo -e "  ${CHECK}  $*"; log "OK: $*"; }
warn()    { echo -e "  ${WARN}  $*"; log "WARN: $*"; }
fail()    { echo -e "  ${CROSS}  $*"; log "FAIL: $*"; }
die()     { echo ""; echo -e "  ${RED}${BOLD}İşlem durdu.${NC} $*"; echo ""; exit 1; }

# shellcheck source=system_utils/python_venv.sh
source "${SCRIPT_DIR}/system_utils/python_venv.sh"

confirm_yn() {
    local prompt="$1"
    local default="${2:-e}"
    local answer
    if [[ "$default" == "e" ]]; then
        read -rp "  $prompt [E/h]: " answer
        answer="${answer:-e}"
    else
        read -rp "  $prompt [e/H]: " answer
        answer="${answer:-h}"
    fi
    [[ "${answer,,}" == "e" ]] || [[ "${answer,,}" == "evet" ]] || [[ "${answer,,}" == "y" ]] || [[ "${answer,,}" == "yes" ]]
}

# /etc/ramis/frontend.env içindeki NEXT_PUBLIC_* satırlarını npm build export ifadelerine çevirir
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

# frontend.env içindeki NEXT_PUBLIC_* değerlerini .env.local ile hizalar (rsync .env.local hariç tutar)
_sync_frontend_env_local() {
    local frontend_dir="$1"
    local tmp
    tmp=$(mktemp)
    if [[ -f /etc/ramis/frontend.env ]]; then
        grep -E '^NEXT_PUBLIC_[A-Za-z0-9_]+=' /etc/ramis/frontend.env > "$tmp" || true
    fi
    if [[ -s "$tmp" ]]; then
        install -o "$SYS_USER" -g "$SYS_USER" -m 600 "$tmp" "${frontend_dir}/.env.local"
    fi
    rm -f "$tmp"
}

# Mevcut standalone build'e public/static kopyalar (output: standalone).
_prepare_next_standalone() {
    local frontend_dir="$1"
    local server_js="${frontend_dir}/.next/standalone/server.js"

    if [[ ! -f "$server_js" ]]; then
        warn "Standalone sunucu yok: ${server_js} (frontend build gerekli)"
        return 1
    fi

    sudo -u "$SYS_USER" bash -c "cd ${frontend_dir} && bash scripts/prepare-standalone.sh"
    return 0
}

# next build (output: standalone) + postbuild tamamlandıktan sonra
# üretim sunucusunda artık ihtiyaç duyulmayan kaynak dosyaları temizler.
# Korunanlar: .next/  (çalışan standalone build)
#              .env.local  (rsync hariç tutulur, yeniden oluşturulur)
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

# ramis-frontend.service — Next.js standalone (node server.js)
_write_ramis_frontend_systemd_unit() {
    local node_bin next_bind standalone_dir
    node_bin=$(command -v node) || die "node bulunamadı"
    next_bind="127.0.0.1"
    standalone_dir="${INSTALL_DIR}/frontend/.next/standalone"

    if [[ ! -f "${standalone_dir}/server.js" ]]; then
        warn "ramis-frontend.service güncellenmedi: ${standalone_dir}/server.js yok"
        return 1
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
    systemctl daemon-reload
    success "ramis-frontend.service standalone moduna güncellendi"
}

# shellcheck source=system_utils/celery_worker_units.sh
source "${SCRIPT_DIR}/system_utils/celery_worker_units.sh"

_write_celery_systemd_units() {
    if ramis_write_celery_systemd_units "$INSTALL_DIR" "$SYS_USER"; then
        success "Celery worker systemd birimleri güncellendi (printing concurrency=$(ramis_printing_worker_concurrency))"
    else
        warn "Celery worker birimleri güncellenmedi: celery bulunamadı"
        return 1
    fi
}

_write_daphne_systemd_units_only() {
    local daphne_bin="${INSTALL_DIR}/backend/.venv/bin/daphne"
    if [[ ! -x "$daphne_bin" ]]; then
        daphne_bin="${INSTALL_DIR}/backend/env/bin/daphne"
    fi
    if [[ ! -x "$daphne_bin" ]]; then
        warn "Daphne birimleri güncellenmedi: daphne bulunamadı"
        return 1
    fi
    # shellcheck source=system_utils/daphne_units.sh
    source "${SCRIPT_DIR}/system_utils/daphne_units.sh"
    ramis_write_daphne_systemd_units "${INSTALL_DIR}" "${SYS_USER:-ramis}" "$daphne_bin" "127.0.0.1"
    success "Daphne systemd birimleri güncellendi (DAPHNE_INSTANCES)"
}

_sync_split_asgi_stack() {
    # shellcheck source=system_utils/daphne_units.sh
    source "${SCRIPT_DIR}/system_utils/daphne_units.sh"
    # shellcheck source=system_utils/uvicorn_units.sh
    source "${SCRIPT_DIR}/system_utils/uvicorn_units.sh"
    ramis_write_uvicorn_systemd_units "${INSTALL_DIR}" "${SYS_USER:-ramis}" "127.0.0.1" || true

    # ── Nginx upstream yaması (Daphne WS + Uvicorn HTTP) ──
    ramis_apply_split_upstream_to_nginx
    if nginx -t >> "$LOG_FILE" 2>&1; then
        systemctl reload nginx >> "$LOG_FILE" 2>&1 || true
        info "Uvicorn HTTP servisleri başlatılıyor..."
        ramis_start_uvicorn_services || true
    else
        warn "Nginx syntax hatası — Split upstream güncellemesi sonrası reload atlandı"
        tail -n 5 "$LOG_FILE" >&2 || true
        info "Uvicorn HTTP servisleri başlatılıyor (nginx reload atlandı)..."
        ramis_start_uvicorn_services || true
    fi
    # shellcheck source=system_utils/postgresql_scaling.sh
    source "${SCRIPT_DIR}/system_utils/postgresql_scaling.sh"
    local pg_instances pg_max_rec pg_max_new pg_rc=0
    pg_instances="$(ramis_read_daphne_instances_from_env)"
    pg_max_rec="$(ramis_postgres_recommended_max_connections "$pg_instances")"
    info "PostgreSQL max_connections hedefi: ${pg_max_rec} (DAPHNE_INSTANCES=${pg_instances}, UVICORN_INSTANCES=$(ramis_read_uvicorn_instances_from_env))"
    pg_max_new=$(ramis_configure_postgresql_scaling "$pg_instances" "$LOG_FILE") || pg_rc=$?
    case "$pg_rc" in
        0) success "PostgreSQL max_connections ${pg_max_new} olarak ayarlandı" ;;
        1) info "PostgreSQL max_connections yeterli ($(ramis_postgres_current_max_connections) ≥ ${pg_max_rec})" ;;
        *) warn "PostgreSQL max_connections güncellenemedi — manuel kontrol gerekebilir" ;;
    esac
    ramis_sync_backend_env_conn_max_age "/etc/ramis/backend.env" "${SYS_USER:-ramis}" || true
}

_write_daphne_systemd_units() {
    _write_daphne_systemd_units_only || return 1
    _sync_split_asgi_stack
}

service_active() {
    systemctl is-active --quiet "$1" 2>/dev/null
}

ramis_health_check() {
    local port=$1
    local service_name=$2
    local health_url="http://127.0.0.1:${port}/api/v1/health/"
    local max_attempts=15
    local attempt=1

    echo "  Checking ${service_name} health on port ${port}..."
    while [ $attempt -le $max_attempts ]; do
        if curl -sf --max-time 3 "$health_url" > /dev/null 2>&1; then
            echo "  ✓ ${service_name} is healthy"
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
    done

    echo "  ✗ ${service_name} failed health check after ${max_attempts}s"
    curl -sS --max-time 3 -o /dev/null -w "  Last HTTP status: %{http_code}\n" "$health_url" || true
    return 1
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

_is_ipv4() {
    local ip="$1"
    local o1 o2 o3 o4

    [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
    IFS='.' read -r o1 o2 o3 o4 <<< "$ip"
    for o in "$o1" "$o2" "$o3" "$o4"; do
        [[ "$o" =~ ^[0-9]+$ ]] || return 1
        (( o >= 0 && o <= 255 )) || return 1
    done
}

_detect_primary_ip() {
    local ip=""
    ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}')
    if [[ -z "$ip" ]]; then
        ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi
    printf '%s' "$ip"
}

_env_get() {
    local file="$1"
    local key="$2"
    grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- || true
}

_env_set() {
    local file="$1"
    local key="$2"
    local value="$3"
    if [[ ! -f "$file" ]]; then
        die "Ortam dosyası bulunamadı: ${file}"
    fi
    if grep -q "^${key}=" "$file"; then
        sed -i "s|^${key}=.*|${key}=${value}|" "$file"
    else
        echo "${key}=${value}" >> "$file"
    fi
}

# Eksik anahtarları ekler; mevcut aktif satırları değiştirmez. Yorum satırı varsa açar.
# Değişiklik yapıldıysa 0, anahtar zaten aktifse 1 döner.
_env_ensure_default() {
    local file="$1"
    local key="$2"
    local value="$3"
    if grep -qE "^${key}=" "$file" 2>/dev/null; then
        return 1
    fi
    if grep -qE "^#[[:space:]]*${key}=" "$file" 2>/dev/null; then
        sed -i "s|^#[[:space:]]*${key}=.*|${key}=${value}|" "$file"
        return 0
    fi
    echo "${key}=${value}" >> "$file"
    return 0
}

_merge_backend_env_beat_defaults() {
    local backend_env="/etc/ramis/backend.env"
    local added=0

    if [[ ! -f "$backend_env" ]]; then
        warn "backend.env bulunamadı — Celery Beat varsayılanları atlandı"
        return 1
    fi

    _env_ensure_default "$backend_env" "BEAT_CLEANUP_RESERVATIONS_HOUR" "3" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_CLEANUP_RESERVATIONS_MINUTE" "0" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_ROLLUP_PRODUCT_STATION_TIMING_HOUR" "3" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_ROLLUP_PRODUCT_STATION_TIMING_MINUTE" "15" && added=$((added + 1))
    _env_ensure_default "$backend_env" "PRINTER_STATUS_SYNC_INTERVAL_MINUTES" "5" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_SCAN_KITCHEN_LOW_STOCK_HOUR" "4" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_SCAN_KITCHEN_LOW_STOCK_MINUTE" "0" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_SCAN_OVERDUE_PO_HOUR" "5" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_SCAN_OVERDUE_PO_MINUTE" "0" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_SCAN_EXPIRING_LOTS_HOUR" "4" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_SCAN_EXPIRING_LOTS_MINUTE" "30" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_SWEEP_STALE_CLEANING_TABLES_INTERVAL_MINUTES" "1" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_NOTIFY_DUE_RESERVATIONS_INTERVAL_MINUTES" "1" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_REDIS_CLEANUP_HOUR" "2" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_REDIS_CLEANUP_MINUTE" "30" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_AUTO_CLOSE_TABLES_HOUR" "2" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_AUTO_CLOSE_TABLES_MINUTE" "0" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_PURGE_EXPIRED_86_ENABLED" "false" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_PURGE_EXPIRED_86_HOUR" "5" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_PURGE_EXPIRED_86_MINUTE" "0" && added=$((added + 1))
    _env_ensure_default "$backend_env" "DEFICIENCY_REPAIR_ENABLED" "false" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_DEFICIENCY_REPAIR_HOUR" "4" && added=$((added + 1))
    _env_ensure_default "$backend_env" "BEAT_DEFICIENCY_REPAIR_MINUTE" "45" && added=$((added + 1))
    _env_ensure_default "$backend_env" "DEFICIENCY_REPAIR_MIN_AGE_HOURS" "24" && added=$((added + 1))
    _env_ensure_default "$backend_env" "DEFICIENCY_REPAIR_ORDERED_ACTION" "revert_to_approved" && added=$((added + 1))
    _env_ensure_default "$backend_env" "DEFICIENCY_REPAIR_STALE_ENABLED" "false" && added=$((added + 1))
    _env_ensure_default "$backend_env" "DEFICIENCY_REPAIR_STALE_ACTION" "cancel" && added=$((added + 1))
    _env_ensure_default "$backend_env" "PRINT_JOB_MAINTENANCE_INTERVAL_SECONDS" "30" && added=$((added + 1))

    chown "${SYS_USER}:${SYS_USER}" "$backend_env"
    chmod 600 "$backend_env"

    if [[ "$added" -gt 0 ]]; then
        success "backend.env — ${added} Celery Beat anahtarı eklendi veya yorumdan açıldı"
    else
        info "backend.env — Celery Beat anahtarları zaten tanımlı"
    fi
}

_merge_backend_env_redis_defaults() {
    local backend_env="/etc/ramis/backend.env"
    local added=0

    if [[ ! -f "$backend_env" ]]; then
        warn "backend.env bulunamadı — Redis bakım varsayılanları atlandı"
        return 1
    fi

    _env_ensure_default "$backend_env" "REDIS_MAINTENANCE_ENABLED" "true" && added=$((added + 1))
    _env_ensure_default "$backend_env" "REDIS_CELERY_RESULT_MAX_IDLE_SECONDS" "3600" && added=$((added + 1))
    _env_ensure_default "$backend_env" "CELERY_RESULT_EXPIRES_SECONDS" "3600" && added=$((added + 1))
    _env_ensure_default "$backend_env" "REDIS_ORDER_COUNTER_RETENTION_DAYS" "3" && added=$((added + 1))
    _env_ensure_default "$backend_env" "REDIS_RBAC_PERM_VERSIONS_TO_KEEP" "2" && added=$((added + 1))
    _env_ensure_default "$backend_env" "REDIS_SALES_SUMMARY_GENERATIONS_TO_KEEP" "3" && added=$((added + 1))

    chown "${SYS_USER}:${SYS_USER}" "$backend_env"
    chmod 600 "$backend_env"

    if [[ "$added" -gt 0 ]]; then
        success "backend.env — ${added} Redis bakım anahtarı eklendi veya yorumdan açıldı"
    else
        info "backend.env — Redis bakım anahtarları zaten tanımlı"
    fi
}

_merge_backend_env_print_defaults() {
    local backend_env="/etc/ramis/backend.env"
    local added=0

    if [[ ! -f "$backend_env" ]]; then
        warn "backend.env bulunamadı — yazdırma kuyruğu varsayılanları atlandı"
        return 1
    fi

    _env_ensure_default "$backend_env" "CELERY_PRINTING_WORKER_CONCURRENCY" "4" && added=$((added + 1))
    _env_ensure_default "$backend_env" "PRINT_JOB_REQUEUE_PENDING_SECONDS" "45" && added=$((added + 1))
    _env_ensure_default "$backend_env" "PRINT_JOB_STALE_PROCESSING_SECONDS" "180" && added=$((added + 1))
    _env_ensure_default "$backend_env" "PRINT_JOB_MAINTENANCE_BATCH_SIZE" "100" && added=$((added + 1))

    chown "${SYS_USER}:${SYS_USER}" "$backend_env"
    chmod 600 "$backend_env"

    if [[ "$added" -gt 0 ]]; then
        success "backend.env — ${added} yazdırma kuyruğu anahtarı eklendi veya yorumdan açıldı"
    else
        info "backend.env — yazdırma kuyruğu anahtarları zaten tanımlı"
    fi
}

_merge_backend_env_pdf_defaults() {
    local backend_env="/etc/ramis/backend.env"
    local added=0

    if [[ ! -f "$backend_env" ]]; then
        warn "backend.env bulunamadı — PDF export varsayılanları atlandı"
        return 1
    fi

    _env_ensure_default "$backend_env" "PDF_EXPORT_ASYNC_ENABLED" "true" && added=$((added + 1))
    _env_ensure_default "$backend_env" "PDF_EXPORT_CACHE_TTL" "600" && added=$((added + 1))
    _env_ensure_default "$backend_env" "PDF_EXPORT_CACHE_MAX_BYTES" "20971520" && added=$((added + 1))
    _env_ensure_default "$backend_env" "CELERY_PDF_EXPORT_WORKER_CONCURRENCY" "2" && added=$((added + 1))
    _env_ensure_default "$backend_env" "WS_MENU_CATALOG_THROTTLE_SECONDS" "5" && added=$((added + 1))

    chown "${SYS_USER}:${SYS_USER}" "$backend_env"
    chmod 600 "$backend_env"

    if [[ "$added" -gt 0 ]]; then
        success "backend.env — ${added} PDF export anahtarı eklendi veya yorumdan açıldı"
    else
        info "backend.env — PDF export anahtarları zaten tanımlı"
    fi
}

_merge_backend_env_stock_reservation_defaults() {
    local backend_env="/etc/ramis/backend.env"
    local added=0

    if [[ ! -f "$backend_env" ]]; then
        warn "backend.env bulunamadı — üretim stok rezervasyon anahtarı atlandı"
        return 1
    fi

    _env_ensure_default "$backend_env" "PRODUCTION_STOCK_RESERVATION_ENABLED" "true" && added=$((added + 1))

    chown "${SYS_USER}:${SYS_USER}" "$backend_env"
    chmod 600 "$backend_env"

    if [[ "$added" -gt 0 ]]; then
        success "backend.env — PRODUCTION_STOCK_RESERVATION_ENABLED=true eklendi"
    else
        info "backend.env — PRODUCTION_STOCK_RESERVATION_ENABLED zaten tanımlı"
    fi
}

_merge_backend_env_fiscal_defaults() {
    local backend_env="/etc/ramis/backend.env"
    local added=0
    local current_allowed host default_base=""

    if [[ ! -f "$backend_env" ]]; then
        warn "backend.env bulunamadı — mali webhook varsayılanları atlandı"
        return 1
    fi

    current_allowed=$(_env_get "$backend_env" "ALLOWED_HOSTS")
    host="${current_allowed%%,*}"
    if _is_ipv4 "$host"; then
        default_base="http://${host}"
    elif [[ -n "$host" && "$host" != "localhost" && "$host" != "127.0.0.1" ]]; then
        default_base="http://${host}"
    fi

    if [[ -n "$default_base" ]]; then
        _env_ensure_default "$backend_env" "FISCAL_WEBHOOK_BASE_URL" "$default_base" && added=$((added + 1))
    fi

    chown "${SYS_USER}:${SYS_USER}" "$backend_env"
    chmod 600 "$backend_env"

    if [[ "$added" -gt 0 ]]; then
        success "backend.env — ${added} mali webhook anahtarı eklendi (${default_base})"
    else
        info "backend.env — FISCAL_WEBHOOK_BASE_URL zaten tanımlı veya ALLOWED_HOSTS'tan türetilemedi"
    fi
}

# CORS / CSRF varsayılanlarını backend.env'de kontrol et/ekle
# IP tabanlı kurulumlarda ALLOWED_HOSTS'taki IP'yi CORS'a ekler.
_merge_backend_env_cors_defaults() {
    local backend_env="/etc/ramis/backend.env"
    local current_allowed current_cors current_csrf
    local ip=""
    local default_origin=""
    local added=0

    if [[ ! -f "$backend_env" ]]; then
        warn "backend.env bulunamadı — CORS varsayılanları atlandı"
        return 1
    fi

    # ALLOWED_HOSTS içindeki IP/domain'i bul
    current_allowed=$(_env_get "$backend_env" "ALLOWED_HOSTS")
    ip="${current_allowed%%,*}"  # ilk host

    if _is_ipv4 "$ip"; then
        default_origin="http://${ip},http://127.0.0.1"
    elif [[ -n "$ip" ]]; then
        default_origin="http://${ip}"
    else
        default_origin="http://localhost"
    fi

    _env_ensure_default "$backend_env" "CSRF_TRUSTED_ORIGINS" "$default_origin" && added=$((added + 1))
    _env_ensure_default "$backend_env" "CORS_EXTRA_ORIGINS" "$default_origin" && added=$((added + 1))

    chown "${SYS_USER}:${SYS_USER}" "$backend_env"
    chmod 600 "$backend_env"

    if [[ "$added" -gt 0 ]]; then
        success "backend.env — ${added} CORS/CSRF anahtarı eklendi (${default_origin})"
    else
        info "backend.env — CORS/CSRF anahtarları zaten tanımlı"
    fi
}

_merge_backend_env_ws_defaults() {
    local backend_env="/etc/ramis/backend.env"
    local added=0

    if [[ ! -f "$backend_env" ]]; then
        warn "backend.env bulunamadı — WebSocket/Daphne varsayılanları atlandı"
        return 1
    fi

    _env_ensure_default "$backend_env" "DAPHNE_INSTANCES" "2" && added=$((added + 1))
    _env_ensure_default "$backend_env" "CHANNEL_LAYER_CAPACITY" "8000" && added=$((added + 1))
    _env_ensure_default "$backend_env" "CHANNEL_LAYER_EXPIRY" "120" && added=$((added + 1))
    _env_ensure_default "$backend_env" "WS_AUTH_CACHE_SECONDS" "60" && added=$((added + 1))
    _env_ensure_default "$backend_env" "WS_KDS_STATS_THROTTLE_SECONDS" "2" && added=$((added + 1))
    _env_ensure_default "$backend_env" "WS_CONN_MAX_PER_MINUTE" "20" && added=$((added + 1))
    _env_ensure_default "$backend_env" "WS_MAX_PENDING_TIMERS" "1000" && added=$((added + 1))
    _env_ensure_default "$backend_env" "WS_BYPASS_CELERY" "false" && added=$((added + 1))
    _env_ensure_default "$backend_env" "UVICORN_INSTANCES" "4" && added=$((added + 1))
    _env_ensure_default "$backend_env" "KDS_RECALL_WINDOW_MINUTES" "15" && added=$((added + 1))

    chown "${SYS_USER}:${SYS_USER}" "$backend_env"
    chmod 600 "$backend_env"

    if [[ "$added" -gt 0 ]]; then
        success "backend.env — ${added} WebSocket/Daphne anahtarı eklendi veya yorumdan açıldı"
    else
        info "backend.env — WebSocket/Daphne anahtarları zaten tanımlı"
    fi
}

# Üretim frontend.env — EPIC-07 çevrimdışı kuyruk (varsayılan: açık)
_merge_frontend_env_prod_defaults() {
    local frontend_env="/etc/ramis/frontend.env"
    local changed=0

    if [[ ! -f "$frontend_env" ]]; then
        warn "frontend.env bulunamadı — NEXT_PUBLIC_POS_OFFLINE_QUEUE atlandı"
        return 1
    fi

    local current
    current=$(_env_get "$frontend_env" "NEXT_PUBLIC_POS_OFFLINE_QUEUE")
    if [[ "$current" != "true" ]]; then
        _env_set "$frontend_env" "NEXT_PUBLIC_POS_OFFLINE_QUEUE" "true"
        changed=1
    fi

    chown "${SYS_USER}:${SYS_USER}" "$frontend_env"
    chmod 600 "$frontend_env"

    if [[ "$changed" -eq 1 ]]; then
        success "frontend.env — NEXT_PUBLIC_POS_OFFLINE_QUEUE=true (EPIC-07)"
        if [[ -d "${INSTALL_DIR}/frontend" ]]; then
            _sync_frontend_env_local "${INSTALL_DIR}/frontend"
        fi
        local api_url=""
        api_url=$(_env_get "$frontend_env" "NEXT_PUBLIC_API_URL")
        if [[ -n "$api_url" ]]; then
            _write_runtime_config_json "$api_url"
        fi
        REBUILD_FRONTEND="true"
    else
        info "frontend.env — NEXT_PUBLIC_POS_OFFLINE_QUEUE zaten true"
    fi
}

_stop_ramis_daphne_services() {
    # shellcheck source=system_utils/daphne_units.sh
    source "${SCRIPT_DIR}/system_utils/daphne_units.sh"
    ramis_stop_daphne_services
}

_start_ramis_daphne_services() {
    # shellcheck source=system_utils/daphne_units.sh
    source "${SCRIPT_DIR}/system_utils/daphne_units.sh"
    ramis_start_daphne_services >> "$LOG_FILE" 2>&1 || warn "Bir veya daha fazla Daphne süreci başlatılamadı"
}

# Sunucudaki /etc/ramis/runtime-config.json içeriğini yazar/günceller.
_write_runtime_config_json() {
    local api_url="$1"
    local frontend_env="/etc/ramis/frontend.env"
    local runtime_json="/etc/ramis/runtime-config.json"
    local pos_offline_json="true"
    local api_toasts_json="false"

    if [[ -f "$runtime_json" ]]; then
        grep -q '"posOfflineQueue"[[:space:]]*:[[:space:]]*true' "$runtime_json" && pos_offline_json="true"
        grep -q '"posOfflineQueue"[[:space:]]*:[[:space:]]*false' "$runtime_json" && pos_offline_json="false"
        grep -q '"apiInterceptorToasts"[[:space:]]*:[[:space:]]*true' "$runtime_json" && api_toasts_json="true"
        grep -q '"apiInterceptorToasts"[[:space:]]*:[[:space:]]*false' "$runtime_json" && api_toasts_json="false"
    fi

    if [[ -f "$frontend_env" ]]; then
        local pos_env api_toasts_env
        pos_env=$(_env_get "$frontend_env" "NEXT_PUBLIC_POS_OFFLINE_QUEUE")
        api_toasts_env=$(_env_get "$frontend_env" "NEXT_PUBLIC_API_INTERCEPTOR_TOASTS")
        [[ "$pos_env" == "true" ]] && pos_offline_json="true"
        [[ "$pos_env" == "false" ]] && pos_offline_json="false"
        [[ "$api_toasts_env" == "true" ]] && api_toasts_json="true"
        [[ "$api_toasts_env" == "false" ]] && api_toasts_json="false"
    fi

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

# Eski kurulumlarda eksik olan runtime-config.json dosyasını frontend.env'den üretir.
# force=true ise mevcut dosyayı da frontend.env ile yeniden yazar.
_ensure_runtime_config_json() {
    local force="${1:-false}"
    local frontend_env="/etc/ramis/frontend.env"
    local runtime_json="/etc/ramis/runtime-config.json"
    local api_url=""

    if [[ ! -f "$frontend_env" ]]; then
        warn "runtime-config.json senkronize edilemedi: ${frontend_env} bulunamadı"
        return 1
    fi

    api_url=$(_env_get "$frontend_env" "NEXT_PUBLIC_API_URL")
    if [[ -z "$api_url" ]]; then
        warn "runtime-config.json senkronize edilemedi: NEXT_PUBLIC_API_URL boş"
        return 1
    fi

    if [[ -f "$runtime_json" ]] && [[ "$force" != "true" ]]; then
        return 0
    fi

    _write_runtime_config_json "$api_url"
    if [[ -f "$runtime_json" ]]; then
        success "runtime-config.json $( [[ "$force" == "true" ]] && echo 'güncellendi' || echo 'oluşturuldu' ) (${api_url})"
    fi
    return 0
}

_change_ip_update_nginx() {
    local old_ip="$1"
    local new_ip="$2"
    local ngx_conf="/etc/nginx/sites-available/ramis.conf"

    if [[ ! -f "$ngx_conf" ]]; then
        warn "Nginx yapılandırması bulunamadı (${ngx_conf}); server_name güncellenmedi"
        return 0
    fi

    if grep -q "server_name[[:space:]]\+${old_ip}[[:space:]]*;" "$ngx_conf"; then
        sed -i "s|server_name[[:space:]]\+${old_ip}[[:space:]]*;|server_name ${new_ip};|g" "$ngx_conf"
    else
        sed -i "s|^\([[:space:]]*server_name[[:space:]]\+\).*;|\1${new_ip};|" "$ngx_conf"
    fi

    info "Nginx yapılandırması test ediliyor..."
    if nginx -t >> "$LOG_FILE" 2>&1; then
        systemctl reload nginx >> "$LOG_FILE" 2>&1
        success "Nginx yeniden yüklendi (server_name=${new_ip})"
    else
        die "Nginx yapılandırma testi başarısız. Günlük: ${LOG_FILE}"
    fi
}

run_change_ip() {
    local backend_env="/etc/ramis/backend.env"
    local frontend_env="/etc/ramis/frontend.env"
    local old_ip=""
    local new_ip=""
    local allowed_hosts=""
    local app_origin=""
    local api_url=""

    if [[ ! -f "$backend_env" ]] || [[ ! -f "$frontend_env" ]]; then
        die "Ramis ortam dosyaları eksik (/etc/ramis/backend.env veya frontend.env)"
    fi

    allowed_hosts=$(_env_get "$backend_env" "ALLOWED_HOSTS")
    old_ip=${allowed_hosts%%,*}

    if ! _is_ipv4 "$old_ip"; then
        die "--change-ip yalnızca IP tabanlı kurulumlar içindir (ALLOWED_HOSTS: ${old_ip}). Alan adlı kurulumlarda DNS güncellemesi yeterlidir."
    fi

    if [[ -n "$CHANGE_IP_MANUAL" ]]; then
        new_ip="$CHANGE_IP_MANUAL"
    else
        new_ip=$(_detect_primary_ip)
        if [[ -z "$new_ip" ]]; then
            die "Yeni IP adresi otomatik tespit edilemedi. Manuel girin: sudo bash update.sh --change-ip 192.168.x.x"
        fi
    fi
    if ! _is_ipv4 "$new_ip"; then
        die "Geçersiz IP adresi: ${new_ip}"
    fi

    echo -e "  ${BOLD}Mevcut IP:${NC}  ${old_ip}"
    if [[ -n "$CHANGE_IP_MANUAL" ]]; then
        echo -e "  ${BOLD}Yeni IP:${NC}    ${new_ip} ${DIM}(manuel)${NC}"
    else
        echo -e "  ${BOLD}Yeni IP:${NC}    ${new_ip} ${DIM}(otomatik tespit)${NC}"
    fi
    echo ""

    if [[ "$old_ip" == "$new_ip" ]]; then
        if [[ ! -f /etc/ramis/runtime-config.json ]]; then
            info "IP değişmedi; eksik runtime-config.json frontend.env'den oluşturuluyor..."
            _ensure_runtime_config_json "false"
        else
            warn "IP adresi değişmemiş görünüyor (${new_ip}). İşlem yapılmadı."
        fi
        return 0
    fi

    if ! confirm_yn "Frontend/backend ayarları yeni IP ile güncellensin mi?" "e"; then
        warn "IP güncellemesi iptal edildi"
        return 0
    fi

    allowed_hosts="${new_ip},127.0.0.1,localhost"
    app_origin="http://${new_ip},http://127.0.0.1"
    api_url="http://${new_ip}/api/v1"

    info "Servisler durduruluyor..."
    systemctl stop ramis-frontend.service 2>/dev/null || true
    _stop_ramis_daphne_services
    # shellcheck source=system_utils/uvicorn_units.sh
    source "${SCRIPT_DIR}/system_utils/uvicorn_units.sh"
    ramis_stop_uvicorn_services 2>/dev/null || true
    systemctl stop ramis-worker.service 2>/dev/null || true
    systemctl stop ramis-worker-maintenance.service 2>/dev/null || true
    systemctl stop ramis-worker-broadcast.service 2>/dev/null || true
    systemctl stop ramis-worker-pdf.service 2>/dev/null || true
    systemctl stop ramis-beat.service 2>/dev/null || true
    success "Servisler durduruldu"

    info "Backend ortam dosyası güncelleniyor..."
    _merge_backend_env_cors_defaults || true
    _merge_backend_env_ws_defaults || true
    _merge_backend_env_beat_defaults || true
    _merge_backend_env_redis_defaults || true
    _merge_backend_env_print_defaults || true
    _merge_backend_env_stock_reservation_defaults || true
    _merge_backend_env_fiscal_defaults || true
    _merge_backend_env_pdf_defaults || true
    _env_set "$backend_env" "ALLOWED_HOSTS" "$allowed_hosts"
    _env_set "$backend_env" "CSRF_TRUSTED_ORIGINS" "$app_origin"
    _env_set "$backend_env" "CORS_EXTRA_ORIGINS" "$app_origin"
    _env_set "$backend_env" "FISCAL_WEBHOOK_BASE_URL" "http://${new_ip}"
    chown "${SYS_USER}:${SYS_USER}" "$backend_env"
    chmod 600 "$backend_env"
    success "backend.env güncellendi"

    info "Frontend ortam dosyası güncelleniyor..."
    _env_set "$frontend_env" "NEXT_PUBLIC_API_URL" "$api_url"
    _env_set "$frontend_env" "NEXT_PUBLIC_POS_OFFLINE_QUEUE" "true"
    chown "${SYS_USER}:${SYS_USER}" "$frontend_env"
    chmod 600 "$frontend_env"
    _sync_frontend_env_local "${INSTALL_DIR}/frontend"
    _write_runtime_config_json "${api_url}"
    success "frontend.env, .env.local ve runtime-config.json güncellendi"

    info "Nginx server_name güncelleniyor..."
    _change_ip_update_nginx "$old_ip" "$new_ip"

    info "Servisler yeniden başlatılıyor..."
    _prepare_next_standalone "${INSTALL_DIR}/frontend" && _write_ramis_frontend_systemd_unit || true
    _start_ramis_daphne_services
    # shellcheck source=system_utils/uvicorn_units.sh
    source "${SCRIPT_DIR}/system_utils/uvicorn_units.sh"
    ramis_start_uvicorn_services >> "$LOG_FILE" 2>&1 || true
    systemctl start ramis-worker.service >> "$LOG_FILE" 2>&1
    systemctl start ramis-worker-maintenance.service >> "$LOG_FILE" 2>&1
    systemctl start ramis-worker-broadcast.service >> "$LOG_FILE" 2>&1
    systemctl start ramis-worker-pdf.service >> "$LOG_FILE" 2>&1
    systemctl start ramis-beat.service >> "$LOG_FILE" 2>&1
    systemctl start ramis-frontend.service >> "$LOG_FILE" 2>&1
    sleep 2

    if service_active ramis-daphne; then
        success "$(printf '%-26s %s' 'ramis-daphne' 'çalışıyor')"
    else
        fail "$(printf '%-26s %s' 'ramis-daphne' 'başlatılamadı')"
    fi
    if service_active ramis-uvicorn; then
        success "$(printf '%-26s %s' 'ramis-uvicorn' 'çalışıyor')"
    else
        fail "$(printf '%-26s %s' 'ramis-uvicorn' 'başlatılamadı')"
    fi
    if service_active ramis-worker; then
        success "$(printf '%-26s %s' 'ramis-worker' 'çalışıyor')"
    else
        fail "$(printf '%-26s %s' 'ramis-worker' 'başlatılamadı')"
    fi
    if service_active ramis-worker-maintenance; then
        success "$(printf '%-26s %s' 'ramis-worker-maintenance' 'çalışıyor')"
    else
        fail "$(printf '%-26s %s' 'ramis-worker-maintenance' 'başlatılamadı')"
    fi
    if service_active ramis-worker-broadcast; then
        success "$(printf '%-26s %s' 'ramis-worker-broadcast' 'çalışıyor')"
    else
        fail "$(printf '%-26s %s' 'ramis-worker-broadcast' 'başlatılamadı')"
    fi
    if service_active ramis-worker-pdf; then
        success "$(printf '%-26s %s' 'ramis-worker-pdf' 'çalışıyor')"
    else
        fail "$(printf '%-26s %s' 'ramis-worker-pdf' 'başlatılamadı')"
    fi
    if service_active ramis-beat; then
        success "$(printf '%-26s %s' 'ramis-beat' 'çalışıyor')"
    else
        fail "$(printf '%-26s %s' 'ramis-beat' 'başlatılamadı')"
    fi
    if service_active ramis-frontend; then
        success "$(printf '%-26s %s' 'ramis-frontend' 'çalışıyor')"
    else
        fail "$(printf '%-26s %s' 'ramis-frontend' 'başlatılamadı')"
    fi

    echo ""
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo -e "  ${GREEN}${BOLD}IP güncellemesi tamamlandı.${NC}  ${DIM}${old_ip} → ${new_ip}${NC}"
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo -e "  ${BOLD}Panel:${NC}  http://${new_ip}/panel"
    echo -e "  ${BOLD}API:${NC}    http://${new_ip}/api/v1/"
    echo -e "  ${DIM}Tam günlük dosyası:${NC} ${LOG_FILE}"
    echo ""

    log "=== IP güncellemesi tamamlandı (${old_ip} -> ${new_ip}) ==="
}

show_help() {
    echo ""
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo -e "  ${BOLD}RAMIS ERP · Güncelleme${NC}  ${DIM}yardım${NC}"
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BOLD}Kullanım${NC}  ${DIM}proje kök dizininden:${NC}"
    echo -e "    ${BOLD}sudo bash update.sh${NC} ${DIM}[seçenek]${NC}"
    echo ""
    echo -e "  ${BOLD}Seçenekler${NC}"
    echo ""
    echo "    (boş)             Tam mod: backend + frontend dosyaları, bağımlılıklar,"
    echo "                      isteğe bağlı frontend derleme, tüm Ramis servisleri."
    echo ""
    echo "    --db-only         Yalnızca veritabanı migrasyonu; Daphne kısa süre durur."
    echo "    --backend-only    Pip, migrate, collectstatic; Daphne / Worker / Beat."
    echo "    --frontend-only   rsync, npm ci / build, Next.js servisi."
    echo ""
    echo "    --change-ip [IP]  Ağ IP'si değiştiyse backend/frontend env, runtime-config.json,"
    echo "                      Nginx server_name güncellenir; servisler yeniden başlatılır."
    echo "                      Frontend yeniden derleme gerekmez (runtime-config.json)."
    echo "                      IP verilmezse otomatik tespit edilir."
    echo "                      IP aynıysa yalnızca eksik runtime-config.json oluşturulur."
    echo "                      Örnek: sudo bash update.sh --change-ip 192.168.1.50"
    echo ""
    echo "    --sync-runtime-config"
    echo "                      /etc/ramis/runtime-config.json dosyasını frontend.env ile yeniden yazar;"
    echo "                      NEXT_PUBLIC_POS_OFFLINE_QUEUE=true üretim varsayılanını uygular."
    echo ""
    echo "    --sync-celery-workers"
    echo "                      ramis-worker birimlerini backend.env içindeki"
    echo "                      CELERY_PRINTING_WORKER_CONCURRENCY ile yeniden yazar (daemon-reload)."
    echo ""
    echo "    --reload-roles    RBAC rollerini seed_rbac ile yeniler."
    echo "    --seed-allergens  Varsayılan allerjen referans listesini seed_allergens ile yeniler."
    echo "    --reset-users     Örnek kullanıcıları yeniden oluşturur (şifreler sıfırlanır)."
    echo "    --lang tr|en      Seed / rbac dil seçimi (varsayılan: tr)."
    echo ""
    echo "    --veritabani      ${DIM}--db-only ile aynı${NC}"
    echo "    -h, --help        Bu metni gösterir."
    echo ""
    echo -e "  ${DIM}Ayrıntılı günlük: ${LOG_FILE}${NC}"
    echo ""
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --db-only|--veritabani)
                UPDATE_MODE=db
                shift
                ;;
            --backend-only)
                UPDATE_MODE=backend
                shift
                ;;
            --frontend-only)
                UPDATE_MODE=frontend
                shift
                ;;
            --change-ip)
                UPDATE_MODE=change-ip
                shift
                if [[ $# -gt 0 ]] && [[ "$1" != --* ]]; then
                    if ! _is_ipv4 "$1"; then
                        die "Geçersiz IP adresi: $1  (örnek: --change-ip 192.168.1.50)"
                    fi
                    CHANGE_IP_MANUAL="$1"
                    shift
                fi
                ;;
            --change-ip=*)
                UPDATE_MODE=change-ip
                CHANGE_IP_MANUAL="${1#*=}"
                if [[ -z "$CHANGE_IP_MANUAL" ]]; then
                    die "--change-ip için IP gerekli. Örnek: --change-ip=192.168.1.50"
                fi
                if ! _is_ipv4 "$CHANGE_IP_MANUAL"; then
                    die "Geçersiz IP adresi: ${CHANGE_IP_MANUAL}"
                fi
                shift
                ;;
            --sync-runtime-config)
                UPDATE_MODE=sync-runtime-config
                shift
                ;;
            --sync-celery-workers)
                UPDATE_MODE=sync-celery-workers
                shift
                ;;
            --reload-roles)
                RELOAD_ROLES="true"
                shift
                ;;
            --seed-allergens)
                SEED_ALLERGENS="true"
                shift
                ;;
            --reset-users)
                RESET_USERS="true"
                shift
                ;;
            --lang)
                INSTALL_LANG="$2"
                shift 2
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                die "Bilinmeyen seçenek: $1  (yardım: sudo bash update.sh --help)"
                ;;
        esac
    done
}

# ══════════════════════════════════════════════════════════════════════
# ANA AKIŞ
# ══════════════════════════════════════════════════════════════════════

main() {
    parse_args "$@"

    echo ""
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo -e "  ${BOLD}RAMIS ERP · Güncelleme${NC}  ${DIM}·  proje dosyalarını ve servisleri günceller${NC}"
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    case "$UPDATE_MODE" in
        all)      echo -e "  ${BOLD}Mod:${NC}  tam güncelleme  ${DIM}(backend + frontend + servisler)${NC}" ;;
        db)       echo -e "  ${BOLD}Mod:${NC}  yalnızca veritabanı  ${DIM}(migrate + isteğe bağlı seed)${NC}" ;;
        backend)  echo -e "  ${BOLD}Mod:${NC}  yalnızca backend  ${DIM}(rsync, pip, migrate, static)${NC}" ;;
        frontend) echo -e "  ${BOLD}Mod:${NC}  yalnızca frontend  ${DIM}(rsync, npm, Next.js)${NC}" ;;
        change-ip) echo -e "  ${BOLD}Mod:${NC}  IP güncelleme  ${DIM}(env + Nginx + servisler)${NC}" ;;
        sync-runtime-config) echo -e "  ${BOLD}Mod:${NC}  runtime-config.json senkronu  ${DIM}(frontend.env)${NC}" ;;
        sync-celery-workers) echo -e "  ${BOLD}Mod:${NC}  Celery worker birimleri  ${DIM}(printing + pdf_export concurrency)${NC}" ;;
    esac
    echo -e "  ${DIM}Günlük: ${LOG_FILE}${NC}"
    echo ""

    if [[ $EUID -ne 0 ]]; then
        die "Yönetici yetkisi gerekir. Örnek: sudo bash update.sh"
    fi

    # Dil tercihini kaydet
    if [[ -d /etc/ramis ]]; then
        echo "$INSTALL_LANG" > /etc/ramis/lang
        chmod 644 /etc/ramis/lang
    fi

    if [[ ! -d "$INSTALL_DIR/backend" ]]; then
        die "Ramis ERP kurulumu bulunamadı: ${INSTALL_DIR}/backend"
    fi

    if [[ "$UPDATE_MODE" == "change-ip" ]]; then
        run_change_ip
        return 0
    fi

    if [[ "$UPDATE_MODE" == "sync-runtime-config" ]]; then
        mkdir -p /var/log/ramis
        log "=== runtime-config.json senkronu başladı ==="
        _merge_frontend_env_prod_defaults || true
        _ensure_runtime_config_json "true"
        log "=== runtime-config.json senkronu tamamlandı ==="
        return 0
    fi

    if [[ "$UPDATE_MODE" == "sync-celery-workers" ]]; then
        mkdir -p /var/log/ramis
        log "=== Celery worker birim senkronu başladı ==="
        _merge_backend_env_print_defaults || true
        _merge_backend_env_pdf_defaults || true
        if _write_celery_systemd_units; then
            # Yeni eklenen broadcast ve pdf worker'ların çalıştığından emin ol (idempotent).
            systemctl restart ramis-worker-broadcast.service >> "$LOG_FILE" 2>&1 \
                || warn "ramis-worker-broadcast başlatılamadı"
            systemctl restart ramis-worker-pdf.service >> "$LOG_FILE" 2>&1 \
                || warn "ramis-worker-pdf başlatılamadı"
            log "=== Celery worker birim senkronu tamamlandı (concurrency=$(ramis_printing_worker_concurrency)) ==="
        else
            die "Celery worker birimleri güncellenemedi"
        fi
        return 0
    fi

    local project_src="$SCRIPT_DIR"
    if [[ "$UPDATE_MODE" != "db" ]]; then
        if [[ ! -d "${project_src}/backend" ]]; then
            die "Proje kaynak dosyaları bulunamadı: ${project_src}/backend"
        fi
    fi
    if [[ "$UPDATE_MODE" == "all" ]] || [[ "$UPDATE_MODE" == "frontend" ]]; then
        if [[ ! -d "${project_src}/frontend" ]]; then
            die "Proje kaynak dosyaları bulunamadı: ${project_src}/frontend"
        fi
    fi

    mkdir -p /var/log/ramis
    log "=== Güncelleme başladı (mod=${UPDATE_MODE}) ==="

    if [[ "$UPDATE_MODE" != "db" ]]; then
        _ensure_runtime_config_json "false"
    fi

    local pip="${INSTALL_DIR}/backend/.venv/bin/pip"
    local python="${INSTALL_DIR}/backend/.venv/bin/python"
    local req_file="${INSTALL_DIR}/backend/requirements/production.txt"
    if [[ ! -f "$req_file" ]]; then
        req_file="${INSTALL_DIR}/backend/requirements/development.txt"
    fi
    if [[ ! -x "$python" ]]; then
        die "Python venv bulunamadı: ${python} (önce install.sh veya venv kurun)"
    fi

    # ── Sadece DB: migrasyon dışında bir şey yok ──
    if [[ "$UPDATE_MODE" == "db" ]]; then
        _merge_backend_env_cors_defaults || true
        _merge_backend_env_ws_defaults || true
        _merge_backend_env_beat_defaults || true
        _merge_backend_env_redis_defaults || true
        _merge_backend_env_print_defaults || true
        _merge_backend_env_stock_reservation_defaults || true
        _merge_backend_env_fiscal_defaults || true
        _merge_backend_env_pdf_defaults || true
        info "ramis-daphne durduruluyor (migrate)..."
        _stop_ramis_daphne_services
        success "Daphne durdu"

        if confirm_yn "Veritabanı migrasyonları çalıştırılsın mı?" "e"; then
            info "Veritabanı migrasyonları çalıştırılıyor..."
            sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${INSTALL_DIR}/backend && ${python} manage.py migrate --noinput" >> "$LOG_FILE" 2>&1
            success "Migrasyonlar tamamlandı"
        else
            warn "Veritabanı migrasyonları atlandı"
        fi

        info "Celery Beat görevleri senkronize ediliyor (rezervasyon saati bildirimi dahil)..."
        sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${INSTALL_DIR}/backend && ${python} manage.py sync_celery_beat_schedule" >> "$LOG_FILE" 2>&1 || warn "sync_celery_beat_schedule başarısız"
        success "Celery Beat görevleri senkronize edildi"
        info "Celery Beat, maintenance ve broadcast worker yeniden başlatılıyor..."
        systemctl restart ramis-beat.service >> "$LOG_FILE" 2>&1 || warn "ramis-beat yeniden başlatılamadı"
        systemctl restart ramis-worker-maintenance.service >> "$LOG_FILE" 2>&1 || warn "ramis-worker-maintenance yeniden başlatılamadı"
        systemctl restart ramis-worker-broadcast.service >> "$LOG_FILE" 2>&1 || warn "ramis-worker-broadcast yeniden başlatılamadı"
        success "Celery Beat, maintenance ve broadcast worker yenilendi"

        if [[ "$RELOAD_ROLES" == "true" ]]; then
            info "Roller ve izinler güncelleniyor (seed_rbac, Dil: ${INSTALL_LANG})..."
            sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${INSTALL_DIR}/backend && ${python} manage.py seed_rbac --lang ${INSTALL_LANG}" >> "$LOG_FILE" 2>&1
            success "Roller güncellendi"
        fi

        if [[ "$SEED_ALLERGENS" == "true" ]]; then
            info "Allerjen referans listesi güncelleniyor (seed_allergens)..."
            sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${INSTALL_DIR}/backend && ${python} manage.py seed_allergens" >> "$LOG_FILE" 2>&1
            success "Allerjen referans listesi güncellendi"
        fi

        if [[ "$RESET_USERS" == "true" ]]; then
            info "Varsayılan kullanıcılar yeniden kuruluyor (seed_full --users, Dil: ${INSTALL_LANG})..."
            sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${INSTALL_DIR}/backend && ${python} manage.py seed_full --users --no-flush --lang ${INSTALL_LANG}" >> "$LOG_FILE" 2>&1
            success "Kullanıcılar sıfırlandı/yeniden kuruldu"
        fi

        info "ramis-daphne başlatılıyor..."
        _start_ramis_daphne_services
        sleep 2
        if service_active ramis-daphne; then
            success "$(printf '%-26s %s' 'ramis-daphne' 'çalışıyor')"
        else
            fail "$(printf '%-26s %s' 'ramis-daphne' 'başlatılamadı')"
        fi

        echo ""
        echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
        echo -e "  ${GREEN}${BOLD}Veritabanı güncellemesi tamamlandı.${NC}"
        echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
        echo -e "  ${DIM}Ayrıntılı kayıt:${NC} ${LOG_FILE}"
        echo ""
        log "=== Güncelleme tamamlandı (db) ==="
        return 0
    fi

    # ── Frontend modu: env / derleme ──
    if [[ "$UPDATE_MODE" == "all" ]] || [[ "$UPDATE_MODE" == "frontend" ]]; then
        _merge_frontend_env_prod_defaults || true

        info "Frontend env değişikliği kontrol ediliyor..."
        local current_env=""
        local new_env=""

        if [[ -f "${INSTALL_DIR}/frontend/.env.local" ]]; then
            current_env=$(cat "${INSTALL_DIR}/frontend/.env.local" 2>/dev/null || true)
        fi
        if [[ -f /etc/ramis/frontend.env ]]; then
            new_env=$(grep 'NEXT_PUBLIC_' /etc/ramis/frontend.env 2>/dev/null || true)
        fi

        if [[ "$UPDATE_MODE" == "frontend" ]]; then
            REBUILD_FRONTEND="true"
        elif [[ "$current_env" != "$new_env" ]] && [[ -n "$new_env" ]]; then
            warn "NEXT_PUBLIC_* ortam değişkenleri değişmiş. Frontend yeniden derlenecek."
            REBUILD_FRONTEND="true"
        elif [[ "$UPDATE_MODE" == "all" ]]; then
            if [[ "$REBUILD_FRONTEND" != "true" ]]; then
                if confirm_yn "Frontend'i yeniden derlemek (npm run build) istiyor musunuz?" "h"; then
                    REBUILD_FRONTEND="true"
                fi
            fi
        fi
    fi

    # ── Servisleri durdur (kapsama göre) ──
    info "Servisler durduruluyor..."
    if [[ "$UPDATE_MODE" == "all" ]] || [[ "$UPDATE_MODE" == "frontend" ]]; then
        systemctl stop ramis-frontend.service 2>/dev/null || true
    fi
    if [[ "$UPDATE_MODE" == "all" ]] || [[ "$UPDATE_MODE" == "backend" ]]; then
        _merge_backend_env_cors_defaults || true
        _merge_backend_env_ws_defaults || true
        _merge_backend_env_beat_defaults || true
        _merge_backend_env_redis_defaults || true
        _merge_backend_env_print_defaults || true
        _merge_backend_env_stock_reservation_defaults || true
        _merge_backend_env_fiscal_defaults || true
        _merge_backend_env_pdf_defaults || true
        _stop_ramis_daphne_services
        # shellcheck source=system_utils/uvicorn_units.sh
        source "${SCRIPT_DIR}/system_utils/uvicorn_units.sh"
        ramis_stop_uvicorn_services 2>/dev/null || true
        systemctl stop ramis-worker.service 2>/dev/null || true
        systemctl stop ramis-worker-maintenance.service 2>/dev/null || true
        systemctl stop ramis-worker-broadcast.service 2>/dev/null || true
        systemctl stop ramis-worker-pdf.service 2>/dev/null || true
        systemctl stop ramis-beat.service 2>/dev/null || true
    fi
    success "İlgili servisler durduruldu"

    # ── Dosya senkronu ──
    if [[ "$UPDATE_MODE" == "all" ]] || [[ "$UPDATE_MODE" == "backend" ]]; then
        info "Backend dosyaları güncelleniyor..."
        rsync -a --delete \
            --exclude='.venv' \
            --exclude='venv' \
            --exclude='env' \
            --exclude='__pycache__' \
            --exclude='*.pyc' \
            --exclude='db.sqlite3' \
            --exclude='.pytest_cache' \
            --exclude='media' \
            --exclude='staticfiles' \
            "${project_src}/backend/" "${INSTALL_DIR}/backend/"
        success "Backend dosyaları güncellendi"
    fi

    if [[ "$UPDATE_MODE" == "all" ]] || [[ "$UPDATE_MODE" == "frontend" ]]; then
        info "Frontend dosyaları güncelleniyor..."
        rsync -a --delete \
            --exclude='node_modules' \
            --exclude='.next' \
            --exclude='.env.local' \
            "${project_src}/frontend/" "${INSTALL_DIR}/frontend/"
        success "Frontend dosyaları güncellendi"
    fi

    chown -R "${SYS_USER}:${SYS_USER}" "$INSTALL_DIR"

    # ── Backend: pip, migrate, collectstatic ──
    if [[ "$UPDATE_MODE" == "all" ]] || [[ "$UPDATE_MODE" == "backend" ]]; then
        if confirm_yn "Python bağımlılıkları güncellensin mi?" "e"; then
            local venv_dir="${INSTALL_DIR}/backend/.venv"
            ramis_bootstrap_venv_pip "$venv_dir"
            info "Python bağımlılıkları güncelleniyor..."
            ramis_run_pip_to_log "pip install -r requirements" "başarısız." \
                "Son günlük satırları" "Güncelleme durdu. Tam kayıt:" \
                "Tam günlük: sudo tail -n 80 ${LOG_FILE}" \
                sudo -u "$SYS_USER" "$pip" install -r "$req_file"
            success "Python bağımlılıkları güncellendi"
        else
            warn "Python bağımlılıkları atlandı"
        fi

        if confirm_yn "Veritabanı migrasyonları çalıştırılsın mı?" "e"; then
            info "Veritabanı migrasyonları çalıştırılıyor..."
            sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${INSTALL_DIR}/backend && ${python} manage.py migrate --noinput" >> "$LOG_FILE" 2>&1
            success "Migrasyonlar tamamlandı"
        else
            warn "Veritabanı migrasyonları atlandı"
        fi

        info "Celery Beat görevleri senkronize ediliyor (rezervasyon saati bildirimi dahil)..."
        sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${INSTALL_DIR}/backend && ${python} manage.py sync_celery_beat_schedule" >> "$LOG_FILE" 2>&1 || warn "sync_celery_beat_schedule başarısız"
        success "Celery Beat görevleri senkronize edildi"

        if [[ "$RELOAD_ROLES" == "true" ]]; then
            info "Roller ve izinler güncelleniyor (seed_rbac, Dil: ${INSTALL_LANG})..."
            sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${INSTALL_DIR}/backend && ${python} manage.py seed_rbac --lang ${INSTALL_LANG}" >> "$LOG_FILE" 2>&1
            success "Roller güncellendi"
        fi

        if [[ "$SEED_ALLERGENS" == "true" ]]; then
            info "Allerjen referans listesi güncelleniyor (seed_allergens)..."
            sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${INSTALL_DIR}/backend && ${python} manage.py seed_allergens" >> "$LOG_FILE" 2>&1
            success "Allerjen referans listesi güncellendi"
        fi

        if [[ "$RESET_USERS" == "true" ]]; then
            info "Varsayılan kullanıcılar yeniden kuruluyor (seed_full --users, Dil: ${INSTALL_LANG})..."
            sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${INSTALL_DIR}/backend && ${python} manage.py seed_full --users --no-flush --lang ${INSTALL_LANG}" >> "$LOG_FILE" 2>&1
            success "Kullanıcılar sıfırlandı/yeniden kuruldu"
        fi

        _compile_backend_locale "${INSTALL_DIR}/backend" "${python}" "${pip}"

        info "Statik dosyalar toplanıyor..."
        sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${INSTALL_DIR}/backend && ${python} manage.py collectstatic --noinput" >> "$LOG_FILE" 2>&1
        success "Statik dosyalar toplandı"

        _write_celery_systemd_units || true
        _write_daphne_systemd_units || true
    fi

    # ── Frontend build ──
    if [[ "$UPDATE_MODE" == "all" ]] || [[ "$UPDATE_MODE" == "frontend" ]]; then
        if [[ "$REBUILD_FRONTEND" == "true" ]]; then
            local npm_bin
            npm_bin=$(command -v npm) || die "npm bulunamadı. Lütfen npm'in kurulu olduğundan emin olun."

            if confirm_yn "Frontend bağımlılıkları (npm ci) kurulsun mu?" "e"; then
                info "Frontend bağımlılıkları kuruluyor..."
                sudo -u "$SYS_USER" bash -c "cd ${INSTALL_DIR}/frontend && ${npm_bin} ci" >> "$LOG_FILE" 2>&1
                success "Frontend bağımlılıkları kuruldu"
            else
                warn "Frontend bağımlılıkları atlandı"
            fi

            info "Frontend derleniyor..."
            _sync_frontend_env_local "${INSTALL_DIR}/frontend"
            local fe_build_exports
            fe_build_exports=$(_frontend_next_public_build_exports)
            sudo -u "$SYS_USER" bash -c "cd ${INSTALL_DIR}/frontend && ${fe_build_exports} ${npm_bin} run build" >> "$LOG_FILE" 2>&1
            _write_ramis_frontend_systemd_unit || true
            success "Frontend derlendi"
        else
            info "Frontend derleme atlandı (değişiklik yok / seçim)"
        fi
    fi

    # ── Servisleri başlat ──
    info "Servisler yeniden başlatılıyor..."
    if [[ "$UPDATE_MODE" == "all" ]] || [[ "$UPDATE_MODE" == "backend" ]]; then
        # shellcheck source=system_utils/postgresql_scaling.sh
        source "${SCRIPT_DIR}/system_utils/postgresql_scaling.sh"
        # shellcheck source=system_utils/pg_release_idle_backends.sh
        source "${SCRIPT_DIR}/system_utils/pg_release_idle_backends.sh"
        ramis_sync_backend_env_conn_max_age "/etc/ramis/backend.env" "${SYS_USER:-ramis}" || true
        local pg_instances pg_max_rec pg_max_new pg_rc=0
        pg_instances="$(ramis_read_daphne_instances_from_env)"
        pg_max_rec="$(ramis_postgres_recommended_max_connections "$pg_instances")"
        pg_max_new=$(ramis_configure_postgresql_scaling "$pg_instances" "$LOG_FILE") || pg_rc=$?
        case "$pg_rc" in
            0) success "PostgreSQL bağlantı ayarları güncellendi (max_connections=${pg_max_new})" ;;
            1) info "PostgreSQL max_connections yeterli ($(ramis_postgres_current_max_connections) ≥ ${pg_max_rec})" ;;
            *) warn "PostgreSQL bağlantı ayarları güncellenemedi — manuel kontrol gerekebilir" ;;
        esac
        # shellcheck source=system_utils/uvicorn_units.sh
        source "${SCRIPT_DIR}/system_utils/uvicorn_units.sh"
        ramis_stop_uvicorn_services 2>/dev/null || true
        ramis_stop_daphne_services 2>/dev/null || true
        systemctl stop ramis-worker.service ramis-worker-maintenance.service \
            ramis-worker-broadcast.service ramis-worker-pdf.service >> "$LOG_FILE" 2>&1 || true
        info "PostgreSQL idle oturumları temizleniyor..."
        ramis_pg_release_idle_backends "ramis" "ramis" "$LOG_FILE" || true
        ramis_restart_daphne_services
        ramis_restart_uvicorn_services >> "$LOG_FILE" 2>&1 || true
        systemctl restart ramis-worker.service >> "$LOG_FILE" 2>&1 || true
        systemctl restart ramis-worker-maintenance.service >> "$LOG_FILE" 2>&1 || true
        systemctl restart ramis-worker-broadcast.service >> "$LOG_FILE" 2>&1 || true
        systemctl restart ramis-worker-pdf.service >> "$LOG_FILE" 2>&1 || true
        systemctl restart ramis-beat.service >> "$LOG_FILE" 2>&1 || true
        sleep 2

        info "Servis sağlık kontrolü yapılıyor..."
        ramis_health_check 8000 "Daphne-1" || {
            echo "ERROR: Daphne-1 failed to start"
            exit 1
        }
        ramis_health_check 9000 "Uvicorn-1" || {
            echo "ERROR: Uvicorn-1 failed to start"
            exit 1
        }
    fi
    if [[ "$UPDATE_MODE" == "all" ]] || [[ "$UPDATE_MODE" == "frontend" ]]; then
        if _prepare_next_standalone "${INSTALL_DIR}/frontend"; then
            _write_ramis_frontend_systemd_unit || true
        fi
        systemctl start ramis-frontend.service >> "$LOG_FILE" 2>&1
        sleep 2
    fi

    if [[ "$UPDATE_MODE" == "all" ]] || [[ "$UPDATE_MODE" == "backend" ]]; then
        if service_active ramis-daphne; then
            success "$(printf '%-26s %s' 'ramis-daphne' 'çalışıyor')"
        else
            fail "$(printf '%-26s %s' 'ramis-daphne' 'başlatılamadı')"
        fi
        if service_active ramis-uvicorn; then
            success "$(printf '%-26s %s' 'ramis-uvicorn' 'çalışıyor')"
        else
            fail "$(printf '%-26s %s' 'ramis-uvicorn' 'başlatılamadı')"
        fi
        if service_active ramis-worker; then
            success "$(printf '%-26s %s' 'ramis-worker' 'çalışıyor')"
        else
            fail "$(printf '%-26s %s' 'ramis-worker' 'başlatılamadı')"
        fi
        if service_active ramis-worker-maintenance; then
            success "$(printf '%-26s %s' 'ramis-worker-maintenance' 'çalışıyor')"
        else
            fail "$(printf '%-26s %s' 'ramis-worker-maintenance' 'başlatılamadı')"
        fi
        if service_active ramis-worker-broadcast; then
            success "$(printf '%-26s %s' 'ramis-worker-broadcast' 'çalışıyor')"
        else
            fail "$(printf '%-26s %s' 'ramis-worker-broadcast' 'başlatılamadı')"
        fi
        if service_active ramis-worker-pdf; then
            success "$(printf '%-26s %s' 'ramis-worker-pdf' 'çalışıyor')"
        else
            fail "$(printf '%-26s %s' 'ramis-worker-pdf' 'başlatılamadı')"
        fi
        if service_active ramis-beat; then
            success "$(printf '%-26s %s' 'ramis-beat' 'çalışıyor')"
        else
            fail "$(printf '%-26s %s' 'ramis-beat' 'başlatılamadı')"
        fi
    fi
    if [[ "$UPDATE_MODE" == "all" ]] || [[ "$UPDATE_MODE" == "frontend" ]]; then
        if service_active ramis-frontend; then
            success "$(printf '%-26s %s' 'ramis-frontend' 'çalışıyor')"
            _cleanup_frontend_sources "${INSTALL_DIR}/frontend" || true
        else
            fail "$(printf '%-26s %s' 'ramis-frontend' 'başlatılamadı')"
        fi
    fi

    echo ""
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo -e "  ${GREEN}${BOLD}Güncelleme tamamlandı.${NC}  ${DIM}Mod: ${UPDATE_MODE}${NC}"
    echo -e "${CYAN}  ══════════════════════════════════════════════════════════════════════${NC}"
    echo -e "  ${DIM}Tam günlük dosyası:${NC} ${LOG_FILE}"
    echo ""

    log "=== Güncelleme tamamlandı (mod=${UPDATE_MODE}) ==="
}

main "$@"
