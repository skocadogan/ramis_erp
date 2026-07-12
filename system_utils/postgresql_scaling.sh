#!/usr/bin/env bash
# PostgreSQL bağlantı limiti — split ASGI (Uvicorn + Daphne) + Celery ile uyumlu.
# install.sh / update.sh tarafından source edilir.

ramis_clamp_daphne_instances() {
    local n="${1:-2}"
    if [[ ! "$n" =~ ^[0-9]+$ ]] || (( n < 1 )); then
        n=1
    elif (( n > 4 )); then
        n=4
    fi
    echo "$n"
}

ramis_load_backend_env() {
    if [[ -f /etc/ramis/backend.env ]]; then
        # shellcheck disable=SC1091
        set -a
        # shellcheck source=/dev/null
        source /etc/ramis/backend.env 2>/dev/null || true
        set +a
    fi
}

ramis_read_uvicorn_instances_from_env() {
    local n="${UVICORN_INSTANCES:-4}"
    ramis_load_backend_env
    n="${UVICORN_INSTANCES:-4}"
    if [[ ! "$n" =~ ^[0-9]+$ ]] || [[ "$n" -lt 1 ]]; then
        n=1
    fi
    if [[ "$n" -gt 8 ]]; then
        n=8
    fi
    echo "$n"
}

ramis_read_daphne_instances_from_env() {
    local n="${DAPHNE_INSTANCES:-2}"
    ramis_load_backend_env
    n="${DAPHNE_INSTANCES:-2}"
    ramis_clamp_daphne_instances "$n"
}

ramis_read_printing_worker_concurrency_from_env() {
    local n="${CELERY_PRINTING_WORKER_CONCURRENCY:-4}"
    ramis_load_backend_env
    n="${CELERY_PRINTING_WORKER_CONCURRENCY:-4}"
    if [[ ! "$n" =~ ^[0-9]+$ ]] || [[ "$n" -lt 1 ]]; then
        n=1
    fi
    if [[ "$n" -gt 16 ]]; then
        n=16
    fi
    echo "$n"
}

ramis_read_broadcast_worker_concurrency_from_env() {
    local n="${CELERY_BROADCAST_WORKER_CONCURRENCY:-2}"
    ramis_load_backend_env
    n="${CELERY_BROADCAST_WORKER_CONCURRENCY:-2}"
    if [[ ! "$n" =~ ^[0-9]+$ ]] || [[ "$n" -lt 1 ]]; then
        n=1
    fi
    if [[ "$n" -gt 8 ]]; then
        n=8
    fi
    echo "$n"
}

# Uvicorn + Daphne ayrı süreçlerde mi?
ramis_is_split_asgi_deployment() {
    local split_flag uvicorn_instances daphne_instances
    ramis_load_backend_env
    split_flag="${RAMIS_ASGI_SPLIT:-}"
    case "${split_flag,,}" in
        1 | true | yes | on) return 0 ;;
        0 | false | no | off) return 1 ;;
    esac
    uvicorn_instances="$(ramis_read_uvicorn_instances_from_env)"
    daphne_instances="$(ramis_read_daphne_instances_from_env)"
    (( uvicorn_instances >= 1 && daphne_instances >= 1 ))
}

# Split ASGI: kalıcı bağlantı kapalı (thread pool idle birikimini önler).
ramis_postgres_recommended_conn_max_age() {
    if ramis_is_split_asgi_deployment; then
        echo 0
        return
    fi
    local daphne_instances uvicorn_instances total
    daphne_instances="$(ramis_read_daphne_instances_from_env)"
    uvicorn_instances="$(ramis_read_uvicorn_instances_from_env)"
    total=$(( daphne_instances + uvicorn_instances ))
    if (( total >= 6 )); then
        echo 30
    elif (( total >= 4 )); then
        echo 45
    else
        echo 60
    fi
}

# CONN_MAX_AGE=0: eşzamanlı sorgu + Celery; kalıcı idle birikimi yok.
ramis_postgres_recommended_max_connections() {
    local daphne_instances uvicorn_instances printing broadcast conn_age
    daphne_instances="$(ramis_read_daphne_instances_from_env)"
    uvicorn_instances="$(ramis_read_uvicorn_instances_from_env)"
    printing="$(ramis_read_printing_worker_concurrency_from_env)"
    broadcast="$(ramis_read_broadcast_worker_concurrency_from_env)"
    conn_age="$(ramis_postgres_recommended_conn_max_age)"

    if (( conn_age == 0 )); then
        # Süreç başına eşzamanlı sorgu tahmini + Celery + yedek
        echo $(( 25 + (daphne_instances + uvicorn_instances) * 8 + printing + broadcast + 20 ))
        return
    fi

    echo $(( 25 + daphne_instances * 20 + uvicorn_instances * 5 + printing + broadcast + 5 + 15 ))
}

ramis_postgres_recommended_idle_session_timeout() {
    echo "120s"
}

ramis_postgres_current_max_connections() {
    local current=""
    if command -v psql &>/dev/null && sudo -u postgres pg_isready -q 2>/dev/null; then
        current="$(sudo -u postgres psql -tAc "SHOW max_connections;" 2>/dev/null | tr -d '[:space:]')"
    fi
    if [[ ! "$current" =~ ^[0-9]+$ ]]; then
        current=100
    fi
    echo "$current"
}

ramis_postgres_current_idle_session_timeout() {
    local current=""
    if command -v psql &>/dev/null && sudo -u postgres pg_isready -q 2>/dev/null; then
        current="$(sudo -u postgres psql -tAc "SHOW idle_session_timeout;" 2>/dev/null | tr -d '[:space:]')"
    fi
    echo "${current:-0}"
}

# max_connections + idle_session_timeout — gerekirse tek PostgreSQL restart.
# stdout: önerilen max_connections; dönüş: 0=güncellendi, 1=zaten yeterli, 2=atlandı/hata
ramis_configure_postgresql_scaling() {
    local daphne_instances="${1:-2}"
    local log_file="${2:-/dev/null}"
    local recommended current idle_target idle_current need_alter=false

    daphne_instances="$(ramis_clamp_daphne_instances "$daphne_instances")"
    recommended="$(ramis_postgres_recommended_max_connections)"
    idle_target="$(ramis_postgres_recommended_idle_session_timeout)"

    if ! command -v psql &>/dev/null || ! sudo -u postgres pg_isready -q 2>/dev/null; then
        return 2
    fi

    current="$(ramis_postgres_current_max_connections)"
    idle_current="$(ramis_postgres_current_idle_session_timeout)"

    if (( recommended > current )); then
        if ! sudo -u postgres psql -v ON_ERROR_STOP=1 \
            -c "ALTER SYSTEM SET max_connections = '${recommended}';" >>"$log_file" 2>&1; then
            return 2
        fi
        need_alter=true
    fi

    # idle_session_timeout: split ASGI'de boş oturumları sunucu tarafında kes
    if ramis_is_split_asgi_deployment; then
        if [[ "$idle_current" == "0" ]] || [[ -z "$idle_current" ]] || [[ "$idle_current" == "0ms" ]]; then
            if ! sudo -u postgres psql -v ON_ERROR_STOP=1 \
                -c "ALTER SYSTEM SET idle_session_timeout = '${idle_target}';" >>"$log_file" 2>&1; then
                return 2
            fi
            need_alter=true
        fi
    fi

    if [[ "$need_alter" == true ]]; then
        if ! systemctl restart postgresql >>"$log_file" 2>&1; then
            return 2
        fi
        echo "$recommended"
        return 0
    fi

    return 1
}

# backend.env: POSTGRES_CONN_MAX_AGE split stratejisine göre (0 veya monolit).
ramis_sync_backend_env_conn_max_age() {
    local backend_env="${1:-/etc/ramis/backend.env}"
    local sys_user="${2:-ramis}"
    local conn_age

    [[ -f "$backend_env" ]] || return 1

    conn_age="$(ramis_postgres_recommended_conn_max_age)"

    if grep -qE '^POSTGRES_CONN_MAX_AGE=' "$backend_env" 2>/dev/null; then
        sed -i "s|^POSTGRES_CONN_MAX_AGE=.*|POSTGRES_CONN_MAX_AGE=${conn_age}|" "$backend_env"
    else
        echo "POSTGRES_CONN_MAX_AGE=${conn_age}" >>"$backend_env"
    fi

    chown "${sys_user}:${sys_user}" "$backend_env" 2>/dev/null || true
    chmod 600 "$backend_env" 2>/dev/null || true
}
