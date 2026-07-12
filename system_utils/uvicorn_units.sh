#!/usr/bin/env bash
# Uvicorn çoklu süreç: systemd birimleri — HTTP API için.
# install.sh / update.sh tarafından source edilir.

ramis_uvicorn_instance_count() {
    local n="${UVICORN_INSTANCES:-4}"
    if [[ -f /etc/ramis/backend.env ]]; then
        # shellcheck disable=SC1091
        set -a
        # shellcheck source=/dev/null
        source /etc/ramis/backend.env 2>/dev/null || true
        set +a
        n="${UVICORN_INSTANCES:-4}"
    fi
    if [[ ! "$n" =~ ^[0-9]+$ ]] || [[ "$n" -lt 1 ]]; then
        n=1
    fi
    if [[ "$n" -gt 8 ]]; then
        n=8
    fi
    echo "$n"
}

ramis_uvicorn_upstream_lines() {
    local instances="$1"
    local i port
    for ((i = 0; i < instances; i++)); do
        port=$((9000 + i))
        printf '    server 127.0.0.1:%s;\n' "$port"
    done
}

ramis_uvicorn_venv_bin() {
    local install_dir="$1"
    local uvicorn_bin="${install_dir}/backend/.venv/bin/uvicorn"
    if [[ ! -x "$uvicorn_bin" ]]; then
        uvicorn_bin="${install_dir}/backend/env/bin/uvicorn"
    fi
    if [[ ! -x "$uvicorn_bin" ]]; then
        uvicorn_bin="${install_dir}/backend/venv/bin/uvicorn"
    fi
    echo "$uvicorn_bin"
}

ramis_write_uvicorn_systemd_units() {
    local install_dir="$1"
    local sys_user="$2"
    local uvicorn_bind="${3:-127.0.0.1}"
    local instances
    instances="$(ramis_uvicorn_instance_count)"
    local uvicorn_bin
    uvicorn_bin="$(ramis_uvicorn_venv_bin "$install_dir")"

    if [[ ! -x "$uvicorn_bin" ]]; then
        warn "uvicorn binary bulunamadı — Uvicorn birimleri oluşturulamadı"
        return 1
    fi

    # Eski ek port birimlerini temizle
    for port in 9001 9002 9003 9004 9005 9006 9007; do
        systemctl disable --now "ramis-uvicorn-${port}.service" >>/dev/null 2>&1 || true
        rm -f "/etc/systemd/system/ramis-uvicorn-${port}.service"
    done

    local i port unit_name unit_path desc
    for ((i = 0; i < instances; i++)); do
        port=$((9000 + i))
        if [[ "$i" -eq 0 ]]; then
            unit_name="ramis-uvicorn.service"
        else
            unit_name="ramis-uvicorn-${port}.service"
        fi
        unit_path="/etc/systemd/system/${unit_name}"
        desc="Ramis ERP — HTTP API (Uvicorn ASGI :${port})"
        cat >"$unit_path" <<SVCEOF
# Ramis ERP — HTTP API (Uvicorn ASGI)
# Otomatik oluşturuldu: $(date '+%Y-%m-%d %H:%M:%S')
[Unit]
Description=${desc}
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target

[Service]
Type=simple
User=${sys_user}
Group=${sys_user}
WorkingDirectory=${install_dir}/backend
Environment=PYTHONUNBUFFERED=1
Environment=RAMIS_DB_APPLICATION_NAME=ramis-uvicorn-${port}
EnvironmentFile=-/etc/ramis/backend.env
ExecStart=${uvicorn_bin} config.asgi:application --host ${uvicorn_bind} --port ${port} --workers 1
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SVCEOF
        systemctl enable "$unit_name" >/dev/null 2>&1 || true
    done

    systemctl daemon-reload
}

ramis_stop_uvicorn_services() {
    local instances
    instances="$(ramis_uvicorn_instance_count)"
    local i port unit_name
    for ((i = 0; i < instances; i++)); do
        port=$((9000 + i))
        if [[ "$i" -eq 0 ]]; then
            unit_name="ramis-uvicorn.service"
        else
            unit_name="ramis-uvicorn-${port}.service"
        fi
        systemctl stop "$unit_name" >/dev/null 2>&1 || true
    done
}

ramis_start_uvicorn_services() {
    local instances
    instances="$(ramis_uvicorn_instance_count)"
    local i port unit_name
    for ((i = 0; i < instances; i++)); do
        port=$((9000 + i))
        if [[ "$i" -eq 0 ]]; then
            unit_name="ramis-uvicorn.service"
        else
            unit_name="ramis-uvicorn-${port}.service"
        fi
        systemctl start "$unit_name" >/dev/null 2>&1 || true
    done
}

ramis_restart_uvicorn_services() {
    local instances
    instances="$(ramis_uvicorn_instance_count)"
    local i port unit_name
    for ((i = 0; i < instances; i++)); do
        port=$((9000 + i))
        if [[ "$i" -eq 0 ]]; then
            unit_name="ramis-uvicorn.service"
        else
            unit_name="ramis-uvicorn-${port}.service"
        fi
        systemctl restart "$unit_name" >/dev/null 2>&1 || true
    done
}
