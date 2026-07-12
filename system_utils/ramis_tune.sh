#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# Ramis ERP — Donanıma Göre Otomatik Performans Ayar Scripti
# ═══════════════════════════════════════════════════════════════════════
#
# Kullanım:
#   sudo bash ramis_tune.sh                   # Etkileşimli (neyin değişeceğini gösterir)
#   sudo bash ramis_tune.sh --apply           # Doğrudan uygula
#   sudo bash ramis_tune.sh --dry-run         # Sadece ne yapacağını göster, uygulama
#   sudo bash ramis_tune.sh --reset           # Varsayılan install.sh ayarlarına dön
#
# Bu script:
#   1. Donanımı otomatik tespit eder (CPU, RAM, disk)
#   2. Tespit edilen donanıma göre tüm ayarları optimize eder
#   3. /etc/ramis/backend.env , /etc/ramis/frontend.env
#   4. /etc/nginx/sites-available/ramis*.conf
#   5. /etc/postgresql/*/main/postgresql.conf
#   6. /etc/redis/redis.conf
#   7. Servis restart (gerekliyse)
#
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Renkler ────────────────────────────────────────────────────────────
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
CYAN=$'\033[0;36m'
BOLD=$'\033[1m'
DIM=$'\033[2m'
NC=$'\033[0m'

CHECK="${GREEN}✓${NC}"
CROSS="${RED}✗${NC}"
WARN="${YELLOW}⚠${NC}"
INFO="${BLUE}·${NC}"

# ── Varsayılanlar ─────────────────────────────────────────────────────
MODE="interactive"          # interactive | apply | dry-run | reset
BACKUP_DIR="/var/backups/ramis/tune"
TIMESTAMP="$(date '+%Y%m%d_%H%M%S')"

# ── Komut satırı ──────────────────────────────────────────────────────
for arg in "$@"; do
    case "$arg" in
        --apply)    MODE="apply"    ;;
        --dry-run)  MODE="dry-run"  ;;
        --reset)    MODE="reset"    ;;
        --help|-h)
            echo "Kullanım: sudo bash ramis_tune.sh [--apply|--dry-run|--reset]"
            echo ""
            echo "  --apply     Ayarları doğrudan uygula (onay sormaz)"
            echo "  --dry-run   Sadece ne yapılacağını göster"
            echo "  --reset     Varsayılan (install.sh) ayarlarına dön"
            echo "  (boş)       Etkileşimli mod: neyin değişeceğini gösterip onay alır"
            exit 0
            ;;
    esac
done

# ── Root kontrolü ─────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    echo -e "${CROSS} Bu script root yetkisi gerektirir: sudo bash ramis_tune.sh"
    exit 1
fi

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 1: Donanım Tespiti
# ══════════════════════════════════════════════════════════════════════

detect_hardware() {
    echo -e "\n${CYAN}  ─── Donanım Tespiti ───${NC}\n"

    # CPU
    CPU_CORES=$(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || echo 2)
    CPU_MODEL=$(grep -m1 "model name" /proc/cpuinfo 2>/dev/null | sed 's/.*: //' || echo "Bilinmiyor")
    CPU_GEN=""
    if echo "$CPU_MODEL" | grep -qi "i3-3\|i3-4\|i5-4\|N\(100\|95\|97\|150\|200\)\|J4125\|N5095\|N5105"; then
        CPU_GEN="low"       # Eski nesil veya düşük güçlü
    elif echo "$CPU_MODEL" | grep -qi "i[357]-\(10\|11\|12\)\|R[357] \([45]\|5[67]\|7[57]\)\|i[357]-\(6\|7\|8\|9\)\|E-\(22\|23\)"; then
        CPU_GEN="medium"     # Orta nesil (6.-12. nesil)
    elif echo "$CPU_MODEL" | grep -qi "i[3579]-\(13\|14\|\)\|R[579] \([78]\|9\)\|Ultra\|Xeon.*[0-9]"; then
        CPU_GEN="high"       # Yeni nesil
    else
        CPU_GEN="medium"     # Varsayılan
    fi

    echo -e "  ${INFO} İşlemci: ${BOLD}${CPU_MODEL}${NC} (${CPU_CORES} çekirdek)"

    # RAM
    MEM_TOTAL_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    MEM_TOTAL_MB=$((MEM_TOTAL_KB / 1024))
    MEM_TOTAL_GB=$((MEM_TOTAL_MB / 1024))

    echo -e "  ${INFO} RAM:     ${BOLD}${MEM_TOTAL_MB} MB${NC} (≈${MEM_TOTAL_GB} GB)"

    # RAM seviyesi
    if (( MEM_TOTAL_MB <= 2048 )); then
        RAM_TIER="critical"        # 2 GB veya az
    elif (( MEM_TOTAL_MB <= 4096 )); then
        RAM_TIER="low"             # 4 GB
    elif (( MEM_TOTAL_MB <= 8192 )); then
        RAM_TIER="medium"          # 8 GB
    elif (( MEM_TOTAL_MB <= 16384 )); then
        RAM_TIER="good"            # 16 GB
    else
        RAM_TIER="high"            # 32 GB+
    fi

    # Disk
    DISK_ROTATION=""
    if [[ -b /dev/sda ]]; then
        ROTA=$(cat /sys/block/sda/queue/rotational 2>/dev/null || echo 1)
        if [[ "$ROTA" == "0" ]]; then
            DISK_TYPE="ssd"
            DISK_ROTATION="0"
        else
            DISK_TYPE="hdd"
            DISK_ROTATION="1"
        fi
    elif [[ -b /dev/nvme0n1 ]]; then
        DISK_TYPE="nvme"
        DISK_ROTATION="0"
    elif [[ -b /dev/vda ]]; then
        ROTA=$(cat /sys/block/vda/queue/rotational 2>/dev/null || echo 1)
        if [[ "$ROTA" == "0" ]]; then
            DISK_TYPE="ssd"
        else
            DISK_TYPE="hdd"
        fi
    else
        DISK_TYPE="unknown"
    fi

    echo -e "  ${INFO} Disk:    ${BOLD}${DISK_TYPE^^}${NC}"

    # Aktif servisler
    SERVICES=""
    systemctl is-active --quiet postgresql 2>/dev/null && SERVICES+="postgresql "
    systemctl is-active --quiet redis-server 2>/dev/null && SERVICES+="redis "
    systemctl is-active --quiet nginx 2>/dev/null && SERVICES+="nginx "
    systemctl is-active --quiet ramis-daphne 2>/dev/null && SERVICES+="daphne "
    systemctl is-active --quiet ramis-worker 2>/dev/null && SERVICES+="celery "

    echo -e "  ${INFO} Servisler: ${BOLD}${SERVICES:-bulunamadı}${NC}"

    # Tiers
    if [[ "$RAM_TIER" == "critical" || "$RAM_TIER" == "low" ]]; then
        HW_TIER="low"
    elif [[ "$RAM_TIER" == "medium" || "$RAM_TIER" == "good" && "$CPU_GEN" == "low" ]]; then
        HW_TIER="medium"
    else
        HW_TIER="high"
    fi

    echo ""
    echo -e "  ${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${BOLD}Donanım Seviyesi:${NC} ${CYAN}${HW_TIER^^}${NC}"
    echo -e "  ${BOLD}RAM Kategorisi:${NC} ${CYAN}${RAM_TIER^^}${NC}"
    echo -e "  ${BOLD}CPU Nesli:${NC}    ${CYAN}${CPU_GEN^^}${NC}"
    echo -e "  ${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 2: Ayar Hesaplama
# ══════════════════════════════════════════════════════════════════════

calculate_settings() {
    echo -e "${CYAN}  ─── Ayarlar Hesaplanıyor ───${NC}\n"

    # ── PostgreSQL Ayarları ─────────────────────────────────────────
    # shared_buffers: RAM'in %25'i (max 16 GB)
    PG_SHARED_BUFFERS=$((MEM_TOTAL_MB / 4))
    if (( PG_SHARED_BUFFERS > 16384 )); then PG_SHARED_BUFFERS=16384; fi
    if (( PG_SHARED_BUFFERS < 128 )); then PG_SHARED_BUFFERS=128; fi

    # effective_cache_size: RAM'in %60'ı
    PG_EFFECTIVE_CACHE=$((MEM_TOTAL_MB * 60 / 100))
    if (( PG_EFFECTIVE_CACHE > 49152 )); then PG_EFFECTIVE_CACHE=49152; fi

    # work_mem: Düşük RAM'de kısıtlı, yüksek RAM'de cömert
    if (( MEM_TOTAL_MB <= 2048 )); then
        PG_WORK_MEM="2MB"
        PG_MAINTENANCE_WORK_MEM="64MB"
    elif (( MEM_TOTAL_MB <= 4096 )); then
        PG_WORK_MEM="4MB"
        PG_MAINTENANCE_WORK_MEM="128MB"
    elif (( MEM_TOTAL_MB <= 8192 )); then
        PG_WORK_MEM="8MB"
        PG_MAINTENANCE_WORK_MEM="256MB"
    elif (( MEM_TOTAL_MB <= 16384 )); then
        PG_WORK_MEM="16MB"
        PG_MAINTENANCE_WORK_MEM="512MB"
    else
        PG_WORK_MEM="32MB"
        PG_MAINTENANCE_WORK_MEM="1GB"
    fi

    # max_connections
    if (( MEM_TOTAL_MB <= 2048 )); then
        PG_MAX_CONN=25
    elif (( MEM_TOTAL_MB <= 4096 )); then
        PG_MAX_CONN=30
    else
        PG_MAX_CONN=50
    fi

    # parallel workers (CPU çekirdeğine göre)
    if (( CPU_CORES >= 8 )); then
        PG_PARALLEL_WORKERS=4
    elif (( CPU_CORES >= 4 )); then
        PG_PARALLEL_WORKERS=2
    else
        PG_PARALLEL_WORKERS=1
    fi

    # wal_buffers
    if (( MEM_TOTAL_MB <= 2048 )); then
        PG_WAL_BUFFERS="1MB"
    elif (( MEM_TOTAL_MB <= 8192 )); then
        PG_WAL_BUFFERS="4MB"
    else
        PG_WAL_BUFFERS="16MB"
    fi

    # random_page_cost (SSD vs HDD)
    if [[ "$DISK_TYPE" == "hdd" ]]; then
        PG_RANDOM_PAGE_COST=4.0
        PG_EFFECTIVE_IO=1
    elif [[ "$DISK_TYPE" == "ssd" ]]; then
        PG_RANDOM_PAGE_COST=1.1
        PG_EFFECTIVE_IO=200
    else
        PG_RANDOM_PAGE_COST=1.1
        PG_EFFECTIVE_IO=200
    fi

    echo -e "  ${INFO} PostgreSQL: shared_buffers=${PG_SHARED_BUFFERS}MB · work_mem=${PG_WORK_MEM} · max_conn=${PG_MAX_CONN}"

    # ── Redis Ayarları ──────────────────────────────────────────────
    if (( MEM_TOTAL_MB <= 2048 )); then
        REDIS_MAXMEMORY="64mb"
    elif (( MEM_TOTAL_MB <= 4096 )); then
        REDIS_MAXMEMORY="96mb"
    elif (( MEM_TOTAL_MB <= 8192 )); then
        REDIS_MAXMEMORY="128mb"
    elif (( MEM_TOTAL_MB <= 16384 )); then
        REDIS_MAXMEMORY="256mb"
    else
        REDIS_MAXMEMORY="512mb"
    fi

    echo -e "  ${INFO} Redis:    maxmemory=${REDIS_MAXMEMORY}"

    # ── Daphne / Celery Ayarları ────────────────────────────────────
    # Daphne instance sayısı (RAM'e göre)
    if (( MEM_TOTAL_MB <= 2048 )); then
        DAPHNE_INSTANCES=1
        CELERY_PRINTING_CONCURRENCY=1
        CHANNEL_LAYER_CAPACITY=1000
    elif (( MEM_TOTAL_MB <= 4096 )); then
        DAPHNE_INSTANCES=1
        CELERY_PRINTING_CONCURRENCY=1
        CHANNEL_LAYER_CAPACITY=2000
    elif (( MEM_TOTAL_MB <= 8192 )); then
        DAPHNE_INSTANCES=1
        CELERY_PRINTING_CONCURRENCY=2
        CHANNEL_LAYER_CAPACITY=4000
    elif (( MEM_TOTAL_MB <= 16384 )); then
        DAPHNE_INSTANCES=1
        CELERY_PRINTING_CONCURRENCY=2
        CHANNEL_LAYER_CAPACITY=6000
    else
        DAPHNE_INSTANCES=2
        CELERY_PRINTING_CONCURRENCY=4
        CHANNEL_LAYER_CAPACITY=8000
    fi

    # POS/Garson/KDS için WS throttle: Düşük RAM'de daha agresif
    if (( MEM_TOTAL_MB <= 2048 )); then
        WS_THROTTLE=5
        WS_AUTH_CACHE=120
        CHANNEL_EXPIRY=300
    elif (( MEM_TOTAL_MB <= 4096 )); then
        WS_THROTTLE=3
        WS_AUTH_CACHE=90
        CHANNEL_EXPIRY=180
    else
        WS_THROTTLE=2
        WS_AUTH_CACHE=60
        CHANNEL_EXPIRY=120
    fi

    # RBAC cache TTL: RAM azsa daha uzun (DB yükünü azalt)
    if (( MEM_TOTAL_MB <= 4096 )); then
        RBAC_CACHE_TTL=600
    else
        RBAC_CACHE_TTL=120
    fi

    # Dashboard cache (RAM kritikse 5 dk, yoksa 2 dk)
    if (( MEM_TOTAL_MB <= 4096 )); then
        DASHBOARD_CACHE_TIMEOUT=300
    else
        DASHBOARD_CACHE_TIMEOUT=120
    fi

    # KDS aktif sipariş cache (RAM kritikse 5 dk, yoksa 60 sn)
    if (( MEM_TOTAL_MB <= 4096 )); then
        KDS_ACTIVE_CACHE_TTL=300
    else
        KDS_ACTIVE_CACHE_TTL=60
    fi

    echo -e "  ${INFO} Daphne:   instance=${DAPHNE_INSTANCES} · WS throttle=${WS_THROTTLE}sn"
    echo -e "  ${INFO} Celery:   printing concurrency=${CELERY_PRINTING_CONCURRENCY}"

    # ── Nginx Timeout Ayarları ──────────────────────────────────────
    if (( MEM_TOTAL_MB <= 2048 )); then
        NGINX_PROXY_TIMEOUT="60s"
        NGINX_KEEPALIVE_API=16
        NGINX_KEEPALIVE_NEXT=32
    elif (( MEM_TOTAL_MB <= 8192 )); then
        NGINX_PROXY_TIMEOUT="90s"
        NGINX_KEEPALIVE_API=24
        NGINX_KEEPALIVE_NEXT=48
    else
        NGINX_PROXY_TIMEOUT="120s"
        NGINX_KEEPALIVE_API=32
        NGINX_KEEPALIVE_NEXT=64
    fi

    echo -e "  ${INFO} Nginx:    proxy_timeout=${NGINX_PROXY_TIMEOUT} · keepalive=${NGINX_KEEPALIVE_API}"

    # ── Baskı Ayarları ──────────────────────────────────────────────
    if (( MEM_TOTAL_MB <= 2048 )); then
        PRINT_JOB_REQUEUE=60
        PRINT_JOB_STALE=240
        PRINT_JOB_BATCH=50
    else
        PRINT_JOB_REQUEUE=45
        PRINT_JOB_STALE=180
        PRINT_JOB_BATCH=100
    fi

    # ── PDF Rapor (RAM kritikse kapat) ──────────────────────────────
    if (( MEM_TOTAL_MB <= 4096 )); then
        DISABLE_PDF_EXPORT="true"
    else
        DISABLE_PDF_EXPORT="false"
    fi

    echo ""
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 3: Yedekleme
# ══════════════════════════════════════════════════════════════════════

backup_current_configs() {
    local backup_path="${BACKUP_DIR}/${TIMESTAMP}"
    mkdir -p "$backup_path"

    echo -e "${CYAN}  ─── Mevcut Ayarlar Yedekleniyor ───${NC}\n"

    local files_to_backup=(
        "/etc/ramis/backend.env"
        "/etc/ramis/frontend.env"
    )

    # Nginx
    while IFS= read -r -d '' f; do
        files_to_backup+=("$f")
    done < <(find /etc/nginx/sites-available -name "ramis*.conf" -print0 2>/dev/null || true)

    # PostgreSQL
    while IFS= read -r -d '' f; do
        files_to_backup+=("$f")
    done < <(find /etc/postgresql -name "postgresql.conf" -print0 2>/dev/null || true)

    # Redis
    files_to_backup+=("/etc/redis/redis.conf")

    local count=0
    for src in "${files_to_backup[@]}"; do
        if [[ -f "$src" ]]; then
            local dest="${backup_path}/$(echo "$src" | sed 's|/|_|g')"
            cp -a "$src" "$dest"
            echo -e "  ${CHECK} Yedek: ${DIM}${src} → ${dest}${NC}"
            ((count++))
        fi
    done

    if (( count == 0 )); then
        echo -e "  ${INFO} Yedeklenecek dosya bulunamadı (ilk kurulum olabilir)"
    else
        echo -e "\n  ${GREEN}${count} dosya yedeklendi: ${backup_path}${NC}"
    fi
    echo ""
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 4: backend.env Yazma
# ══════════════════════════════════════════════════════════════════════

write_backend_env() {
    echo -e "${CYAN}  ─── /etc/ramis/backend.env Yazılıyor ───${NC}\n"

    local current_secret_key=""
    local current_allowed_hosts=""
    local current_db_name=""
    local current_db_user=""
    local current_db_pass=""
    local current_redis_url=""
    local current_csrf=""
    local current_cors=""

    # Mevcut değerleri koru (varsa)
    if [[ -f /etc/ramis/backend.env ]]; then
        # shellcheck disable=SC1091
        source /etc/ramis/backend.env 2>/dev/null || true
        current_secret_key="${DJANGO_SECRET_KEY:-}"
        current_allowed_hosts="${ALLOWED_HOSTS:-}"
        current_db_name="${POSTGRES_DB:-}"
        current_db_user="${POSTGRES_USER:-}"
        current_db_pass="${POSTGRES_PASSWORD:-}"
        current_redis_url="${REDIS_URL:-}"
        current_csrf="${CSRF_TRUSTED_ORIGINS:-}"
        current_cors="${CORS_EXTRA_ORIGINS:-}"
    fi

    # Varsayılan değerler (install.sh'dekiler)
    local secret_key="${current_secret_key:-insecure-dev-key-change-me}"
    local allowed_hosts="${current_allowed_hosts:-localhost,127.0.0.1}"
    local db_name="${current_db_name:-ramis}"
    local db_user="${current_db_user:-ramis}"
    local db_pass="${current_db_pass:-ramis}"
    local redis_url="${current_redis_url:-redis://127.0.0.1:6379/0}"
    local csrf_origins="${current_csrf:-http://localhost}"
    local cors_origins="${current_cors:-http://localhost}"

    # Celery result expires (RAM'e göre)
    if (( MEM_TOTAL_MB <= 4096 )); then
        CELERY_RESULT_EXPIRES=600
        REDIS_CELERY_IDLE=600
        REDIS_ORDER_RETENTION=1
        REDIS_RBAC_VERSIONS=1
        REDIS_SALES_GENERATIONS=1
    else
        CELERY_RESULT_EXPIRES=3600
        REDIS_CELERY_IDLE=3600
        REDIS_ORDER_RETENTION=3
        REDIS_RBAC_VERSIONS=2
        REDIS_SALES_GENERATIONS=3
    fi

    cat > /etc/ramis/backend.env << ENVEOF
# Ramis ERP — Üretim Ortam Dosyası (otomatik optimize edildi)
# Tarih: $(date '+%Y-%m-%d %H:%M:%S')
# Donanım: ${CPU_MODEL} · ${MEM_TOTAL_MB}MB RAM · ${DISK_TYPE^^}
# Seviye: ${HW_TIER^^}
# Uyarı: Bu dosyayı repoya commit ETMEYİN.

# --- Zorunlu ---
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=${secret_key}
ALLOWED_HOSTS=${allowed_hosts}

# --- PostgreSQL ---
POSTGRES_DB=${db_name}
POSTGRES_USER=${db_user}
POSTGRES_PASSWORD=${db_pass}
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_CONN_MAX_AGE=0

# --- Redis ---
REDIS_URL=${redis_url}

# --- WebSocket / Daphne ---
DAPHNE_INSTANCES=${DAPHNE_INSTANCES}
CHANNEL_LAYER_CAPACITY=${CHANNEL_LAYER_CAPACITY}
CHANNEL_LAYER_EXPIRY=${CHANNEL_EXPIRY}
WS_AUTH_CACHE_SECONDS=${WS_AUTH_CACHE}
WS_KDS_STATS_THROTTLE_SECONDS=${WS_THROTTLE}

# --- CSRF / CORS ---
CSRF_TRUSTED_ORIGINS=${csrf_origins}
CORS_EXTRA_ORIGINS=${cors_origins}

# --- HTTPS / Güvenlik ---
SECURE_SSL_REDIRECT=false

# --- Smart Firing v2 ---
ENABLE_SMART_FIRING_V2=true
SMART_FIRING_QUEUE_DEPTH_THRESHOLD=8
SMART_FIRING_BACKLOG_MINUTE_FACTOR=2
SMART_FIRING_QUEUE_BUFFER_CAP=30
SMART_FIRING_LEARNED_MIN_SAMPLES=5
KDS_RECALL_WINDOW_MINUTES=15

# --- Celery Beat (Europe/Istanbul) ---
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

# --- Redis Gece Bakımı ---
REDIS_MAINTENANCE_ENABLED=true
REDIS_CELERY_RESULT_MAX_IDLE_SECONDS=${REDIS_CELERY_IDLE}
CELERY_RESULT_EXPIRES_SECONDS=${CELERY_RESULT_EXPIRES}
REDIS_ORDER_COUNTER_RETENTION_DAYS=${REDIS_ORDER_RETENTION}
REDIS_RBAC_PERM_VERSIONS_TO_KEEP=${REDIS_RBAC_VERSIONS}
REDIS_SALES_SUMMARY_GENERATIONS_TO_KEEP=${REDIS_SALES_GENERATIONS}

# --- Baskı / PrintJob Kuyruğu ---
CELERY_PRINTING_WORKER_CONCURRENCY=${CELERY_PRINTING_CONCURRENCY}
PRINT_JOB_REQUEUE_PENDING_SECONDS=${PRINT_JOB_REQUEUE}
PRINT_JOB_STALE_PROCESSING_SECONDS=${PRINT_JOB_STALE}
PRINT_JOB_MAINTENANCE_INTERVAL_SECONDS=30
PRINT_JOB_MAINTENANCE_BATCH_SIZE=${PRINT_JOB_BATCH}

# --- RBAC Cache ---
RBAC_CACHE_TTL=${RBAC_CACHE_TTL}

# --- Dashboard Cache ---
DASHBOARD_CACHE_TIMEOUT=${DASHBOARD_CACHE_TIMEOUT}

# --- KDS Aktif Sipariş Cache ---
KDS_ACTIVE_CACHE_TTL=${KDS_ACTIVE_CACHE_TTL}

# --- PDF Rapor (RAM kritikse kapatılır) ---
DISABLE_PDF_EXPORT=${DISABLE_PDF_EXPORT}
ENVEOF

    chown ramis:ramis /etc/ramis/backend.env 2>/dev/null || true
    chmod 600 /etc/ramis/backend.env

    echo -e "  ${CHECK} /etc/ramis/backend.env yazıldı (${HW_TIER^^} profili)"
    echo ""
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 5: frontend.env Yazma
# ══════════════════════════════════════════════════════════════════════

write_frontend_env() {
    echo -e "${CYAN}  ─── /etc/ramis/frontend.env Yazılıyor ───${NC}\n"

    local current_api_url="http://localhost/api/v1"
    local current_port="3000"

    # Mevcut değerleri koru
    if [[ -f /etc/ramis/frontend.env ]]; then
        # shellcheck disable=SC1091
        source /etc/ramis/frontend.env 2>/dev/null || true
        current_api_url="${NEXT_PUBLIC_API_URL:-http://localhost/api/v1}"
        current_port="${PORT:-3000}"
    fi

    cat > /etc/ramis/frontend.env << ENVEOF
# Ramis ERP — Frontend Üretim Ortam Dosyası (otomatik optimize edildi)
# Tarih: $(date '+%Y-%m-%d %H:%M:%S')

NODE_ENV=production
PORT=${current_port}
NEXT_PUBLIC_API_URL=${current_api_url}
NEXT_PUBLIC_POS_OFFLINE_QUEUE=true
ENVEOF

    chown ramis:ramis /etc/ramis/frontend.env 2>/dev/null || true
    chmod 600 /etc/ramis/frontend.env

    echo -e "  ${CHECK} /etc/ramis/frontend.env yazıldı"
    echo ""
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 6: PostgreSQL postgresql.conf Yazma
# ══════════════════════════════════════════════════════════════════════

write_postgresql_conf() {
    echo -e "${CYAN}  ─── PostgreSQL postgresql.conf Yazılıyor ───${NC}\n"

    # PostgreSQL sürümünü bul
    local pg_version=""
    for v in 18 17 16 15 14 13; do
        if [[ -d "/etc/postgresql/${v}/main" ]]; then
            pg_version="$v"
            break
        fi
    done

    if [[ -z "$pg_version" ]]; then
        echo -e "  ${WARN} PostgreSQL bulunamadı, atlanıyor"
        echo ""
        return
    fi

    local pg_conf="/etc/postgresql/${pg_version}/main/postgresql.conf"
    local pg_conf_d="/etc/postgresql/${pg_version}/main/conf.d"

    if [[ ! -f "$pg_conf" ]]; then
        echo -e "  ${WARN} ${pg_conf} bulunamadı, atlanıyor"
        echo ""
        return
    fi

    echo -e "  ${INFO} PostgreSQL ${pg_version} yapılandırması: ${pg_conf}"

    # Özel ayar dosyası oluştur (ana konfigürasyonu bozmamak için)
    mkdir -p "$pg_conf_d"

    cat > "${pg_conf_d}/ramis-optimizations.conf" << PGEOF
# Ramis ERP — Performans Optimizasyon Ayarları
# Otomatik oluşturuldu: $(date '+%Y-%m-%d %H:%M:%S')
# Donanım: ${MEM_TOTAL_MB}MB RAM · ${CPU_CORES} çekirdek · ${DISK_TYPE^^}

# ── Bellek Ayarları ──
shared_buffers = '${PG_SHARED_BUFFERS}MB'
effective_cache_size = '${PG_EFFECTIVE_CACHE}MB'
work_mem = '${PG_WORK_MEM}'
maintenance_work_mem = '${PG_MAINTENANCE_WORK_MEM}'
wal_buffers = '${PG_WAL_BUFFERS}'

# ── Bağlantı Ayarları ──
max_connections = '${PG_MAX_CONN}'

# ── Paralel Sorgu Ayarları (CPU'ya göre) ──
max_parallel_workers_per_gather = ${PG_PARALLEL_WORKERS}
max_parallel_workers = ${PG_PARALLEL_WORKERS}
parallel_tuple_cost = 0.1
parallel_setup_cost = 1000
min_parallel_table_scan_size = '8MB'
min_parallel_index_scan_size = '512kB'

# ── Disk/IO Ayarları ──
random_page_cost = ${PG_RANDOM_PAGE_COST}
effective_io_concurrency = ${PG_EFFECTIVE_IO}

# ── WAL / Checkpoint Ayarları ──
checkpoint_completion_target = 0.9
wal_level = replica
max_wal_size = '1GB'
min_wal_size = '256MB'

# ── Sorgu Planlayıcı ──
default_statistics_target = 100
PGEOF

    chown postgres:postgres "${pg_conf_d}/ramis-optimizations.conf"
    chmod 644 "${pg_conf_d}/ramis-optimizations.conf"

    # include_dir zaten varsa tekrar ekleme
    if ! grep -q "include_dir.*=.*'conf\.d'" "$pg_conf" 2>/dev/null; then
        echo "" >> "$pg_conf"
        echo "# Ramis ERP optimizasyonları" >> "$pg_conf"
        echo "include_dir = 'conf.d'" >> "$pg_conf"
        echo -e "  ${INFO} include_dir eklendi: ${DIM}${pg_conf}${NC}"
    fi

    echo -e "  ${CHECK} PostgreSQL ayarları yazıldı: ${DIM}${pg_conf_d}/ramis-optimizations.conf${NC}"
    echo ""
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 7: Redis redis.conf Yazma
# ══════════════════════════════════════════════════════════════════════

write_redis_conf() {
    echo -e "${CYAN}  ─── Redis redis.conf Yazılıyor ───${NC}\n"

    local redis_conf="/etc/redis/redis.conf"
    if [[ ! -f "$redis_conf" ]]; then
        echo -e "  ${WARN} ${redis_conf} bulunamadı, atlanıyor"
        echo ""
        return
    fi

    # Yedek al
    cp "$redis_conf" "${redis_conf}.bak.${TIMESTAMP}" 2>/dev/null || true

    # Sadece ilgili satırları güncelle (tüm dosyayı değiştirme)
    sed -i "s/^#*maxmemory .*/maxmemory ${REDIS_MAXMEMORY}/" "$redis_conf" 2>/dev/null || \
        echo "maxmemory ${REDIS_MAXMEMORY}" >> "$redis_conf"

    sed -i "s/^#*maxmemory-policy .*/maxmemory-policy allkeys-lru/" "$redis_conf" 2>/dev/null || \
        echo "maxmemory-policy allkeys-lru" >> "$redis_conf"

    # Düşük RAM'de persistence kapat
    if (( MEM_TOTAL_MB <= 4096 )); then
        sed -i "s/^save .*/#save /" "$redis_conf" 2>/dev/null
        sed -i "s/^appendonly .*/appendonly no/" "$redis_conf" 2>/dev/null
        echo -e "  ${WARN} Redis persistence kapatıldı (düşük RAM modu)"
        echo -e "  ${WARN} Uyarı: Sunucu重启te Redis verileri kaybolur. Redis sadece cache/WS/kuyruk içindir, kalıcı veri kaybı olmaz."
    fi

    echo -e "  ${CHECK} Redis ayarları güncellendi: maxmemory=${REDIS_MAXMEMORY}"
    echo ""
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 8: Nginx Konfigürasyonu Güncelleme
# ══════════════════════════════════════════════════════════════════════

write_nginx_conf() {
    echo -e "${CYAN}  ─── Nginx Konfigürasyonu Güncelleniyor ───${NC}\n"

    local nginx_conf=""
    if [[ -f /etc/nginx/sites-available/ramis.conf ]]; then
        nginx_conf="/etc/nginx/sites-available/ramis.conf"
    elif [[ -f /etc/nginx/sites-available/ramis-api.conf ]]; then
        # Dual domain — her iki dosyayı da güncelle
        _patch_nginx_timeout "/etc/nginx/sites-available/ramis-api.conf"
        _patch_nginx_timeout "/etc/nginx/sites-available/ramis-app.conf"
        _patch_nginx_keepalive "/etc/nginx/sites-available/ramis-api.conf" "ramis_api" "${NGINX_KEEPALIVE_API}"
        _patch_nginx_keepalive "/etc/nginx/sites-available/ramis-app.conf" "ramis_next" "${NGINX_KEEPALIVE_NEXT}"
        echo -e "  ${CHECK} Dual domain nginx ayarları güncellendi"
        echo ""
        return
    fi

    if [[ -z "$nginx_conf" || ! -f "$nginx_conf" ]]; then
        echo -e "  ${WARN} Nginx ramis konfigürasyonu bulunamadı, atlanıyor"
        echo ""
        return
    fi

    _patch_nginx_timeout "$nginx_conf"
    _patch_nginx_keepalive "$nginx_conf" "ramis_api" "${NGINX_KEEPALIVE_API}"
    _patch_nginx_keepalive "$nginx_conf" "ramis_next" "${NGINX_KEEPALIVE_NEXT}"

    echo -e "  ${CHECK} Nginx ayarları güncellendi: ${DIM}${nginx_conf}${NC}"
    echo ""
}

_patch_nginx_timeout() {
    local conf="$1"
    [[ ! -f "$conf" ]] && return

    # proxy_connect_timeout
    if grep -q "proxy_connect_timeout" "$conf"; then
        sed -i "s/proxy_connect_timeout [0-9]\+s;/proxy_connect_timeout ${NGINX_PROXY_TIMEOUT};/g" "$conf"
    fi
    # proxy_read_timeout (WS lokasyonu bloğu hariç)
    # sed: WS location'dan kapanış }'a kadar olan satırlarda DEĞİLSE değiştir
    if grep -q "proxy_read_timeout [0-9]\+s;" "$conf"; then
        sed -i "/location \/ws\//,/^ *}/!s/proxy_read_timeout [0-9]\+s;/proxy_read_timeout ${NGINX_PROXY_TIMEOUT};/g" "$conf"
    fi
    # proxy_send_timeout (WS lokasyonu bloğu hariç)
    if grep -q "proxy_send_timeout [0-9]\+s;" "$conf"; then
        sed -i "/location \/ws\//,/^ *}/!s/proxy_send_timeout [0-9]\+s;/proxy_send_timeout ${NGINX_PROXY_TIMEOUT};/g" "$conf"
    fi
    # Buffer boyutları — düşük RAM'de küçült
    _patch_nginx_buffers "$conf"
}

_patch_nginx_buffers() {
    local conf="$1"
    [[ ! -f "$conf" ]] && return
    if (( MEM_TOTAL_MB <= 4096 )); then
        # Düşük RAM: buffer'ları küçült
        if grep -q "proxy_buffer_size" "$conf"; then
            sed -i "s/proxy_buffer_size [0-9]\+k;/proxy_buffer_size 4k;/g" "$conf"
        fi
        if grep -q "proxy_buffers [0-9]" "$conf"; then
            sed -i "s/proxy_buffers [0-9]\+ [0-9]\+k;/proxy_buffers 8 4k;/g" "$conf"
        fi
        if grep -q "client_body_buffer_size" "$conf"; then
            sed -i "s/client_body_buffer_size [0-9]\+k;/client_body_buffer_size 8k;/g" "$conf"
        fi
    fi
}

_patch_nginx_keepalive() {
    local conf="$1"
    local upstream="$2"
    local value="$3"
    [[ ! -f "$conf" ]] && return

    sed -i "/upstream ${upstream}/,/^}/s/keepalive [0-9]\+;/keepalive ${value};/" "$conf"
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 9: Özet Tablosu Göster
# ══════════════════════════════════════════════════════════════════════

show_summary() {
    echo ""
    echo -e "${GREEN}  ╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}  ║             RAMIS ERP — PERFORMANS AYAR RAPORU              ║${NC}"
    echo -e "${GREEN}  ╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${BOLD}DONANIM${NC}"
    echo -e "  ─────────"
    echo -e "  ${INFO} İşlemci:  ${CPU_MODEL} (${CPU_CORES} çekirdek, ${CPU_GEN^^})"
    echo -e "  ${INFO} RAM:      ${MEM_TOTAL_MB} MB (${RAM_TIER^^})"
    echo -e "  ${INFO} Disk:     ${DISK_TYPE^^}"
    echo -e "  ${INFO} Seviye:   ${BOLD}${HW_TIER^^}${NC}"
    echo ""

    if [[ "$MODE" == "dry-run" ]]; then
        echo -e "  ${BOLD}UYGULANACAK AYARLAR (dry-run — değişiklik yapılmadı)${NC}"
    else
        echo -e "  ${BOLD}UYGULANAN AYARLAR${NC}"
    fi
    echo "  ───────────────────────────────────────────────"

    echo -e "  ${CYAN}PostgreSQL:${NC}"
    echo -e "    shared_buffers      = ${PG_SHARED_BUFFERS}MB"
    echo -e "    effective_cache     = ${PG_EFFECTIVE_CACHE}MB"
    echo -e "    work_mem            = ${PG_WORK_MEM}"
    echo -e "    maintenance_work_mem = ${PG_MAINTENANCE_WORK_MEM}"
    echo -e "    max_connections     = ${PG_MAX_CONN}"
    echo -e "    random_page_cost    = ${PG_RANDOM_PAGE_COST}"
    echo -e "    parallel_workers    = ${PG_PARALLEL_WORKERS}"

    echo -e "  ${CYAN}Redis:${NC}"
    echo -e "    maxmemory           = ${REDIS_MAXMEMORY}"

    echo -e "  ${CYAN}Daphne / WS:${NC}"
    echo -e "    instances           = ${DAPHNE_INSTANCES}"
    echo -e "    channel_capacity    = ${CHANNEL_LAYER_CAPACITY}"
    echo -e "    channel_expiry      = ${CHANNEL_EXPIRY}sn"
    echo -e "    ws_throttle         = ${WS_THROTTLE}sn"

    echo -e "  ${CYAN}Celery:${NC}"
    echo -e "    printing_concurrency = ${CELERY_PRINTING_CONCURRENCY}"

    echo -e "  ${CYAN}Nginx:${NC}"
    echo -e "    proxy_timeout       = ${NGINX_PROXY_TIMEOUT}"
    echo -e "    keepalive_api       = ${NGINX_KEEPALIVE_API}"

    echo -e "  ${CYAN}Cache:${NC}"
    echo -e "    rbac_cache_ttl     = ${RBAC_CACHE_TTL}sn"
    echo -e "    dashboard_cache    = ${DASHBOARD_CACHE_TIMEOUT}sn"
    echo -e "    kds_active_cache   = ${KDS_ACTIVE_CACHE_TTL}sn"

    echo -e "  ${CYAN}PDF:${NC}"
    echo -e "    disable_pdf        = ${DISABLE_PDF_EXPORT}"
    echo ""
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 10: Servis Restart
# ══════════════════════════════════════════════════════════════════════

restart_services() {
    echo -e "${CYAN}  ─── Servisler Yeniden Başlatılıyor ───${NC}\n"

    local needs_reload=false
    local changed_services=()

    # PostgreSQL (config değiştiyse restart gerek)
    local pg_conf_file=""
    pg_conf_file=$(find /etc/postgresql -name "ramis-optimizations.conf" -print -quit 2>/dev/null || true)
    if [[ -n "$pg_conf_file" ]] && systemctl is-active --quiet postgresql 2>/dev/null; then
        changed_services+=("postgresql")
    fi

    # Redis
    if systemctl is-active --quiet redis-server 2>/dev/null; then
        changed_services+=("redis-server")
    fi

    # Nginx (test et)
    if systemctl is-active --quiet nginx 2>/dev/null; then
        if nginx -t 2>/dev/null; then
            needs_reload=true
        else
            echo -e "  ${WARN} Nginx config testi BAŞARISIZ — el ile kontrol edin"
        fi
    fi

    for svc in "${changed_services[@]}"; do
        echo -e "  ${INFO} ${svc} yeniden başlatılıyor..."
        systemctl restart "$svc" 2>/dev/null || echo -e "  ${WARN} ${svc} restart başarısız"
    done

    if $needs_reload; then
        systemctl reload nginx 2>/dev/null && echo -e "  ${CHECK} Nginx yeniden yüklendi" || true
    fi

    # Ramis servisleri (varsa)
    for svc in ramis-daphne ramis-worker ramis-worker-maintenance ramis-worker-broadcast ramis-beat ramis-frontend; do
        if systemctl is-active --quiet "$svc" 2>/dev/null; then
            systemctl restart "$svc" 2>/dev/null || true
        fi
    done

    echo ""
    echo -e "  ${GREEN}Servis yeniden başlatma tamamlandı.${NC}"
    echo ""
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 11: Reset (install.sh varsayılanına dön)
# ══════════════════════════════════════════════════════════════════════

reset_to_defaults() {
    echo -e "${CYAN}  ─── Varsayılan Ayarlara Dönülüyor ───${NC}\n"
    echo -e "  ${INFO} Bu işlem tüm ayarları install.sh varsayılanlarına döndürür."
    echo -e "  ${INFO} Yedek dosyalar: ${BACKUP_DIR}/"

    if [[ ! -d "$BACKUP_DIR" ]]; then
        echo -e "  ${WARN} Yedek bulunamadı. Varsayılan ayarlar kullanılacak."
    fi

    # En son yedekten geri yükle
    local latest_backup
    latest_backup=$(ls -td "${BACKUP_DIR}"/*/ 2>/dev/null | head -1) || true

    if [[ -n "$latest_backup" ]]; then
        for backup_file in "$latest_backup"*; do
            local orig_name
            orig_name=$(basename "$backup_file" | sed 's|_|/|' | sed 's|_|/|' | sed 's|_|/|')
            # Basit restorasyon (dosya adından yola çıkarak)
            case "$(basename "$backup_file")" in
                *etc_ramis_backend.env)
                    cp "$backup_file" /etc/ramis/backend.env 2>/dev/null || true
                    echo -e "  ${CHECK} backend.env geri yüklendi"
                    ;;
                *etc_ramis_frontend.env)
                    cp "$backup_file" /etc/ramis/frontend.env 2>/dev/null || true
                    echo -e "  ${CHECK} frontend.env geri yüklendi"
                    ;;
                *etc_nginx*)
                    cp "$backup_file" "/$(echo "$(basename "$backup_file")" | sed 's|_|/|g')" 2>/dev/null || true
                    echo -e "  ${CHECK} Nginx config geri yüklendi"
                    ;;
                *etc_postgresql*)
                    cp "$backup_file" "/$(echo "$(basename "$backup_file")" | sed 's|_|/|g')" 2>/dev/null || true
                    echo -e "  ${CHECK} PostgreSQL config geri yüklendi"
                    ;;
                *etc_redis*)
                    cp "$backup_file" /etc/redis/redis.conf 2>/dev/null || true
                    echo -e "  ${CHECK} Redis config geri yüklendi"
                    ;;
            esac
        done
    else
        # Yedek yoksa uyar
        echo -e "  ${WARN} Yedek bulunamadı, el ile müdahale gerekebilir."
    fi

    restart_services
    echo -e "  ${GREEN}Varsayılan ayarlara dönüldü.${NC}"
}

# ══════════════════════════════════════════════════════════════════════
# BÖLÜM 12: Ana Akış
# ══════════════════════════════════════════════════════════════════════

main() {
    echo ""
    echo -e "${GREEN}  ╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}  ║       RAMIS ERP — Donanıma Göre Performans Ayarlayıcı      ║${NC}"
    echo -e "${GREEN}  ╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Reset modu
    if [[ "$MODE" == "reset" ]]; then
        reset_to_defaults
        exit 0
    fi

    # Donanım tespiti
    detect_hardware

    # Ayar hesaplama
    calculate_settings

    # Özet göster
    show_summary

    # Dry-run modu: burada dur
    if [[ "$MODE" == "dry-run" ]]; then
        echo -e "  ${YELLOW}dry-run modu: Hiçbir dosya değiştirilmedi.${NC}"
        echo -e "  ${YELLOW}Uygulamak için: sudo bash ramis_tune.sh --apply${NC}"
        echo ""
        exit 0
    fi

    # Etkileşimli mod: onay al
    if [[ "$MODE" == "interactive" ]]; then
        echo ""
        echo -e "  ${YELLOW}⚠  Bu işlem sistem ayarlarını değiştirecek.${NC}"
        echo -e "  ${YELLOW}⚠  Değişiklik öncesi mevcut ayarlar yedeklenecek.${NC}"
        echo ""
        read -r -p "  Devam edilsin mi? [e/N]: " confirm
        if [[ ! "$confirm" =~ ^[eE] ]]; then
            echo -e "  ${CROSS} İptal edildi."
            exit 1
        fi
    fi

    # Yedekle
    backup_current_configs

    # Ayarları yaz
    write_backend_env
    write_frontend_env
    write_postgresql_conf
    write_redis_conf
    write_nginx_conf

    # Servisleri yeniden başlat
    restart_services

    echo -e "${GREEN}  ╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}  ║                    İŞLEM TAMAMLANDI                          ║${NC}"
    echo -e "${GREEN}  ╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${INFO} Yedek: ${DIM}${BACKUP_DIR}/${TIMESTAMP}/${NC}"
    echo -e "  ${INFO} Eski ayarlara dönmek için: ${DIM}sudo bash ramis_tune.sh --reset${NC}"
    echo -e "  ${INFO} Bu işlemi tekrar çalıştırmak: ${DIM}sudo bash ramis_tune.sh --apply${NC}"
    echo ""

    # Performans notu
    if (( MEM_TOTAL_MB <= 2048 )); then
        echo -e "  ${YELLOW}⚠  KRİTİK: RAM 2GB veya altı. Önerilen: RAM yükseltmesi (16GB)${NC}"
        echo -e "  ${YELLOW}⚠  PDF raporlama kapatıldı. Dashboard cache 5dk.${NC}"
    elif (( MEM_TOTAL_MB <= 4096 )); then
        echo -e "  ${YELLOW}⚠  NOT: RAM 4GB — düşük seviye. POS/KDS çalışır, PDF kapalı.${NC}"
    elif (( MEM_TOTAL_MB <= 8192 )); then
        echo -e "  ${GREEN}✅  RAM 8GB — iyi seviye. Çoğu özellik çalışır.${NC}"
    else
        echo -e "  ${GREEN}✅  RAM ${MEM_TOTAL_MB}MB — yüksek seviye. Tüm özellikler hızlı çalışır.${NC}"
    fi
    echo ""
}

main "$@"
