#!/usr/bin/env bash
# PostgreSQL'de birikmiş idle oturumları sonlandırır (deploy / acil durum).
# install.sh / update.sh tarafından source edilebilir.

ramis_pg_release_idle_backends() {
    local db_name="${1:-ramis}"
    local db_user="${2:-ramis}"
    local log_file="${3:-/dev/null}"

    # Tanımlayıcı güvenliği — yalnızca alfanumerik / alt çizgi
    if [[ ! "$db_name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || [[ ! "$db_user" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
        echo "ramis_pg_release_idle_backends: geçersiz db_name/db_user" >>"$log_file"
        return 2
    fi

    if ! command -v psql &>/dev/null || ! sudo -u postgres pg_isready -q 2>/dev/null; then
        return 2
    fi

    # psql -v ile parametre bağlama (SQL enjeksiyonunu önler)
    sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres \
        -v db_name="$db_name" \
        -v db_user="$db_user" \
        >>"$log_file" 2>&1 <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = :'db_name'
  AND usename = :'db_user'
  AND state = 'idle'
  AND pid <> pg_backend_pid();
SQL
}
