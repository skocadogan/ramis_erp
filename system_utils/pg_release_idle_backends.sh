#!/usr/bin/env bash
# PostgreSQL'de birikmiş idle oturumları sonlandırır (deploy / acil durum).
# install.sh / update.sh tarafından source edilebilir.

ramis_pg_release_idle_backends() {
    local db_name="${1:-ramis}"
    local db_user="${2:-ramis}"
    local log_file="${3:-/dev/null}"

    if ! command -v psql &>/dev/null || ! sudo -u postgres pg_isready -q 2>/dev/null; then
        return 2
    fi

    sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres >>"$log_file" 2>&1 <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${db_name}'
  AND usename = '${db_user}'
  AND state = 'idle'
  AND pid <> pg_backend_pid();
SQL
}
