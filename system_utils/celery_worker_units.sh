#!/usr/bin/env bash
# Celery worker systemd birimleri — printing / maintenance kuyrukları.
# install.sh / update.sh / ramis_settings (update.sh --sync-celery-workers) tarafından kullanılır.

ramis_printing_worker_concurrency() {
    local n="${CELERY_PRINTING_WORKER_CONCURRENCY:-4}"
    if [[ -f /etc/ramis/backend.env ]]; then
        # shellcheck disable=SC1091
        set -a
        # shellcheck source=/dev/null
        source /etc/ramis/backend.env 2>/dev/null || true
        set +a
        n="${CELERY_PRINTING_WORKER_CONCURRENCY:-4}"
    fi
    if [[ ! "$n" =~ ^[0-9]+$ ]] || [[ "$n" -lt 1 ]]; then
        n=1
    fi
    if [[ "$n" -gt 16 ]]; then
        n=16
    fi
    echo "$n"
}

# Broadcast worker eşzamanlılığı — WS yayın task'ları (KDS/POS) düşük gecikme için.
ramis_broadcast_worker_concurrency() {
    local n="${CELERY_BROADCAST_WORKER_CONCURRENCY:-4}"
    if [[ -f /etc/ramis/backend.env ]]; then
        # shellcheck disable=SC1091
        set -a
        # shellcheck source=/dev/null
        source /etc/ramis/backend.env 2>/dev/null || true
        set +a
        n="${CELERY_BROADCAST_WORKER_CONCURRENCY:-4}"
    fi
    if [[ ! "$n" =~ ^[0-9]+$ ]] || [[ "$n" -lt 1 ]]; then
        n=1
    fi
    if [[ "$n" -gt 8 ]]; then
        n=8
    fi
    echo "$n"
}

ramis_maintenance_worker_concurrency() {
    local n="${CELERY_MAINTENANCE_WORKER_CONCURRENCY:-2}"
    if [[ -f /etc/ramis/backend.env ]]; then
        # shellcheck disable=SC1091
        set -a
        # shellcheck source=/dev/null
        source /etc/ramis/backend.env 2>/dev/null || true
        set +a
        n="${CELERY_MAINTENANCE_WORKER_CONCURRENCY:-2}"
    fi
    if [[ ! "$n" =~ ^[0-9]+$ ]] || [[ "$n" -lt 1 ]]; then
        n=1
    fi
    if [[ "$n" -gt 8 ]]; then
        n=8
    fi
    echo "$n"
}

ramis_pdf_export_worker_concurrency() {
    local n="${CELERY_PDF_EXPORT_WORKER_CONCURRENCY:-2}"
    if [[ -f /etc/ramis/backend.env ]]; then
        # shellcheck disable=SC1091
        set -a
        # shellcheck source=/dev/null
        source /etc/ramis/backend.env 2>/dev/null || true
        set +a
        n="${CELERY_PDF_EXPORT_WORKER_CONCURRENCY:-2}"
    fi
    if [[ ! "$n" =~ ^[0-9]+$ ]] || [[ "$n" -lt 1 ]]; then
        n=1
    fi
    if [[ "$n" -gt 4 ]]; then
        n=4
    fi
    echo "$n"
}

ramis_celery_bin() {
    local install_dir="$1"
    local celery_bin="${install_dir}/backend/.venv/bin/celery"
    if [[ ! -x "$celery_bin" ]]; then
        celery_bin="${install_dir}/backend/env/bin/celery"
    fi
    if [[ ! -x "$celery_bin" ]]; then
        celery_bin="${install_dir}/backend/venv/bin/celery"
    fi
    echo "$celery_bin"
}

# Argümanlar: install_dir sys_user
ramis_write_celery_systemd_units() {
    local install_dir="$1"
    local sys_user="$2"
    local celery_bin concurrency broadcast_concurrency maintenance_concurrency pdf_concurrency

    celery_bin="$(ramis_celery_bin "$install_dir")"
    if [[ ! -x "$celery_bin" ]]; then
        return 1
    fi

    concurrency="$(ramis_printing_worker_concurrency)"
    broadcast_concurrency="$(ramis_broadcast_worker_concurrency)"
    maintenance_concurrency="$(ramis_maintenance_worker_concurrency)"
    pdf_concurrency="$(ramis_pdf_export_worker_concurrency)"

    cat > /etc/systemd/system/ramis-worker.service << SVCEOF
# Ramis ERP — Celery Worker (printing kuyruğu)
# Otomatik oluşturuldu: $(date '+%Y-%m-%d %H:%M:%S')
[Unit]
Description=Ramis ERP — Celery Worker (printing)
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target
Requires=postgresql.service redis-server.service

[Service]
Type=simple
User=${sys_user}
Group=${sys_user}
WorkingDirectory=${install_dir}/backend
Environment=PYTHONUNBUFFERED=1
Environment=RAMIS_DB_APPLICATION_NAME=ramis-celery-printing
EnvironmentFile=-/etc/ramis/backend.env
ExecStart=${celery_bin} -A config worker -n printing@%h -l INFO -Q printing --concurrency=${concurrency} --max-tasks-per-child=500
Restart=on-failure
RestartSec=5
PrivateDevices=false
NoNewPrivileges=false

[Install]
WantedBy=multi-user.target
SVCEOF

    cat > /etc/systemd/system/ramis-worker-maintenance.service << SVCEOF
# Ramis ERP — Celery Worker (maintenance kuyruğu)
# Otomatik oluşturuldu: $(date '+%Y-%m-%d %H:%M:%S')
[Unit]
Description=Ramis ERP — Celery Worker (maintenance)
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target
Requires=postgresql.service redis-server.service

[Service]
Type=simple
User=${sys_user}
Group=${sys_user}
WorkingDirectory=${install_dir}/backend
Environment=PYTHONUNBUFFERED=1
Environment=RAMIS_DB_APPLICATION_NAME=ramis-celery-maintenance
EnvironmentFile=-/etc/ramis/backend.env
ExecStart=${celery_bin} -A config worker -n maintenance@%h -l INFO -Q maintenance,celery --concurrency=${maintenance_concurrency} --max-tasks-per-child=50
Restart=on-failure
RestartSec=5
PrivateDevices=false
NoNewPrivileges=false

[Install]
WantedBy=multi-user.target
SVCEOF

    # ── ramis-worker-broadcast.service (Celery — WebSocket yayın kuyruğu) ──
    # KDS/POS gerçek zamanlı yayın task'ları (broadcast_kds_refresh_task,
    # broadcast_kitchen_order_status_changed_task) bu kuyruğa yönlenir
    # (settings.CELERY_BROADCAST_QUEUE). Bu birim olmadan yayınlar işlenmez
    # ve KDS/POS/mobil arasındaki gerçek zamanlı iletişim durur.
    cat > /etc/systemd/system/ramis-worker-broadcast.service << SVCEOF
# Ramis ERP — Celery Worker (broadcast kuyruğu — WS yayınları)
# Otomatik oluşturuldu: $(date '+%Y-%m-%d %H:%M:%S')
[Unit]
Description=Ramis ERP — Celery Worker (broadcast)
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target
Requires=postgresql.service redis-server.service

[Service]
Type=simple
User=${sys_user}
Group=${sys_user}
WorkingDirectory=${install_dir}/backend
Environment=PYTHONUNBUFFERED=1
Environment=RAMIS_DB_APPLICATION_NAME=ramis-celery-broadcast
EnvironmentFile=-/etc/ramis/backend.env
ExecStart=${celery_bin} -A config worker -n broadcast@%h -l INFO -Q broadcast --concurrency=${broadcast_concurrency} --max-tasks-per-child=500
Restart=on-failure
RestartSec=5
PrivateDevices=false
NoNewPrivileges=false

[Install]
WantedBy=multi-user.target
SVCEOF

    # ── ramis-worker-pdf.service (Celery — PDF export kuyruğu) ──
    # Rapor/fatura PDF üretimi (WeasyPrint, reportlab) CPU-bound.
    # Bu birim olmadan async PDF export çalışmaz; task'ler kuyrukta bekler.
    cat > /etc/systemd/system/ramis-worker-pdf.service << SVCEOF
# Ramis ERP — Celery Worker (pdf_export kuyruğu)
# Otomatik oluşturuldu: $(date '+%Y-%m-%d %H:%M:%S')
[Unit]
Description=Ramis ERP — Celery Worker (pdf_export)
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target
Requires=postgresql.service redis-server.service

[Service]
Type=simple
User=${sys_user}
Group=${sys_user}
WorkingDirectory=${install_dir}/backend
Environment=PYTHONUNBUFFERED=1
Environment=RAMIS_DB_APPLICATION_NAME=ramis-celery-pdf-export
EnvironmentFile=-/etc/ramis/backend.env
ExecStart=${celery_bin} -A config worker -n pdf-export@%h -l INFO -Q pdf_export --concurrency=${pdf_concurrency} --max-tasks-per-child=20
Restart=on-failure
RestartSec=5
PrivateDevices=false
NoNewPrivileges=false

[Install]
WantedBy=multi-user.target
SVCEOF

    systemctl daemon-reload
    systemctl enable ramis-worker.service >/dev/null 2>&1 || true
    systemctl enable ramis-worker-maintenance.service >/dev/null 2>&1 || true
    systemctl enable ramis-worker-broadcast.service >/dev/null 2>&1 || true
    systemctl enable ramis-worker-pdf.service >/dev/null 2>&1 || true
    return 0
}
