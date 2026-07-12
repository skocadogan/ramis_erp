#!/usr/bin/env bash
# Daphne çoklu süreç: systemd birimleri + nginx upstream yamaları.
# install.sh / update.sh tarafından source edilir.
# Split mimari: Daphne WS/Channels, Uvicorn HTTP API.

# ── Daphne instance ────────────────────────────────────────────────

ramis_daphne_instance_count() {
    local n="${DAPHNE_INSTANCES:-1}"
    if [[ -f /etc/ramis/backend.env ]]; then
        # shellcheck disable=SC1091
        set -a
        # shellcheck source=/dev/null
        source /etc/ramis/backend.env 2>/dev/null || true
        set +a
        n="${DAPHNE_INSTANCES:-1}"
    fi
    if [[ ! "$n" =~ ^[0-9]+$ ]] || [[ "$n" -lt 1 ]]; then
        n=1
    fi
    if [[ "$n" -gt 4 ]]; then
        n=4
    fi
    echo "$n"
}

ramis_daphne_upstream_lines() {
    local instances="$1"
    local i port
    for ((i = 0; i < instances; i++)); do
        port=$((8000 + i))
        printf '    server 127.0.0.1:%s;\n' "$port"
    done
}

ramis_write_daphne_systemd_units() {
    local install_dir="$1"
    local sys_user="$2"
    local daphne_bin="$3"
    local daphne_bind="${4:-127.0.0.1}"
    local instances
    instances="$(ramis_daphne_instance_count)"

    for port in 8001 8002 8003; do
        systemctl disable --now "ramis-daphne-${port}.service" >>/dev/null 2>&1 || true
        rm -f "/etc/systemd/system/ramis-daphne-${port}.service"
    done

    local i port unit_name unit_path desc
    for ((i = 0; i < instances; i++)); do
        port=$((8000 + i))
        if [[ "$i" -eq 0 ]]; then
            unit_name="ramis-daphne.service"
        else
            unit_name="ramis-daphne-${port}.service"
        fi
        unit_path="/etc/systemd/system/${unit_name}"
        desc="Ramis ERP — WebSocket (Daphne ASGI :${port})"
        cat >"$unit_path" <<SVCEOF
# Ramis ERP — WebSocket (Daphne ASGI)
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
Environment=RAMIS_DB_APPLICATION_NAME=ramis-daphne-${port}
EnvironmentFile=-/etc/ramis/backend.env
ExecStart=${daphne_bin} -b ${daphne_bind} -p ${port} config.asgi:application
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

ramis_stop_daphne_services() {
    local instances
    instances="$(ramis_daphne_instance_count)"
    local i port unit_name
    for ((i = 0; i < instances; i++)); do
        port=$((8000 + i))
        if [[ "$i" -eq 0 ]]; then
            unit_name="ramis-daphne.service"
        else
            unit_name="ramis-daphne-${port}.service"
        fi
        systemctl stop "$unit_name" >/dev/null 2>&1 || true
    done
}

ramis_start_daphne_services() {
    local instances
    instances="$(ramis_daphne_instance_count)"
    local i port unit_name
    for ((i = 0; i < instances; i++)); do
        port=$((8000 + i))
        if [[ "$i" -eq 0 ]]; then
            unit_name="ramis-daphne.service"
        else
            unit_name="ramis-daphne-${port}.service"
        fi
        systemctl start "$unit_name" >/dev/null 2>&1 || true
    done
}

ramis_restart_daphne_services() {
    local instances
    instances="$(ramis_daphne_instance_count)"
    local i port unit_name
    for ((i = 0; i < instances; i++)); do
        port=$((8000 + i))
        if [[ "$i" -eq 0 ]]; then
            unit_name="ramis-daphne.service"
        else
            unit_name="ramis-daphne-${port}.service"
        fi
        systemctl restart "$unit_name" >/dev/null 2>&1 || true
    done
}

# ── Nginx upstream yaması (Split: Daphne + Uvicorn) ──────────────
# nginx ramis-api.conf içinde:
#   upstream ramis_daphne { ... __DAPHNE_UPSTREAM_SERVERS__ ... }
#   upstream ramis_uvicorn { ... __UVICORN_UPSTREAM_SERVERS__ ... }

_ramis_nginx_patch_py() {
    python3 - "$1" "$2" <<'PY'
import pathlib
import re
import sys

daphne_lines = sys.argv[1]
uvicorn_lines = sys.argv[2]

TIMEOUT_TRIPLET = (
    "        proxy_connect_timeout 30s;\n"
    "        proxy_read_timeout 120s;\n"
    "        proxy_send_timeout 120s;\n"
)
TIMEOUT_LINE = re.compile(
    r"^[ \t]*proxy_(?:connect|read|send)_timeout\s+[^;]+;\s*\n",
    re.MULTILINE,
)


def dedupe_timeout_triplets(text: str) -> str:
    lines = text.splitlines(keepends=True)
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.lstrip().startswith("proxy_connect_timeout"):
            block = [line]
            j = i + 1
            while j < len(lines) and j < i + 3:
                if TIMEOUT_LINE.match(lines[j]):
                    block.append(lines[j])
                j += 1
            if len(block) == 3:
                if (
                    len(out) >= 3
                    and out[-3].lstrip().startswith("proxy_connect_timeout")
                    and out[-2].lstrip().startswith("proxy_read_timeout")
                    and out[-1].lstrip().startswith("proxy_send_timeout")
                ):
                    i = j
                    continue
                out.extend(block)
                i = j
                continue
        out.append(line)
        i += 1
    return "".join(out)


def patch_upstream(text: str, marker: str, lines: str, name: str) -> str:
    """Yer tutucuyu veya var olan upstream blok adını günceller."""
    if marker in text:
        return text.replace(marker, lines)
    # Geriye dönük: var olan upstream {name} bloğunu bul
    pattern = re.compile(
        rf"(upstream {name} \{{\n(?:    least_conn;\n)?)(.*?)(\n    keepalive \d+;\n\}})",
        re.DOTALL,
    )
    if pattern.search(text):
        def repl(m):
            head = m.group(1)
            if "least_conn" not in head:
                head = f"upstream {name} {{\n    least_conn;\n"
            return f"{head}{lines}{m.group(3)}"
        return pattern.sub(repl, text, count=1)
    return text


def patch_location_timeouts(text: str, location: str) -> str:
    loc_re = re.compile(
        rf"(    location {re.escape(location)} \{{)(.*?)(^\s*\}})",
        re.DOTALL | re.MULTILINE,
    )
    match = loc_re.search(text)
    if not match:
        return text
    body = match.group(2)
    if "proxy_connect_timeout" in body or "proxy_read_timeout" in body:
        return text
    insert_at = body.rfind("\n")
    if insert_at == -1:
        new_body = body + TIMEOUT_TRIPLET
    else:
        new_body = body[: insert_at + 1] + TIMEOUT_TRIPLET + body[insert_at + 1 :]
    return text[: match.start()] + match.group(1) + new_body + match.group(3) + text[match.end() :]


def patch_location_proxy_pass(text: str, location: str, upstream: str) -> str:
    """Belirtilen location'daki proxy_pass upstream'ini günceller.
    Eski ramis_api adını veya yeni ramis_daphne/ramis_uvicorn adını tanır."""
    loc_re = re.compile(
        rf"(    location {re.escape(location)} \{{.*?proxy_pass\s+)http://ramis_api(;.*?^\s*\}})",
        re.DOTALL | re.MULTILINE,
    )
    result = loc_re.sub(rf"\1http://{upstream}\2", text)
    if result != text:
        return result
    # Bir de yeni adlarla dene (birden çok update arasında)
    loc_re_new = re.compile(
        rf"(    location {re.escape(location)} \{{.*?proxy_pass\s+)http://ramis_(?:daphne|uvicorn)(;.*?^\s*\}})",
        re.DOTALL | re.MULTILINE,
    )
    return loc_re_new.sub(rf"\1http://{upstream}\2", result)


def ensure_uvicorn_upstream(text: str, lines: str) -> str:
    """Eski config'lerde upstream ramis_uvicorn bloğu yoksa oluştur."""
    if "upstream ramis_uvicorn" in text:
        return text  # zaten var
    # Daphne upstream bloğunu bul ve hemen ardına ekle
    pattern = re.compile(
        r"(upstream ramis_(?:daphne|api) \{\n(?:.*?\n)*?\})",
        re.DOTALL,
    )
    match = pattern.search(text)
    if match:
        end = match.end()
        uvicorn_block = (
            "\n\nupstream ramis_uvicorn {\n"
            "    least_conn;\n"
            f"{lines}"
            "    keepalive 32;\n"
            "}"
        )
        return text[:end] + uvicorn_block + text[end:]
    return text


def patch_file(path: pathlib.Path) -> bool:
    try:
        original = path.read_text(encoding="utf-8")
    except OSError:
        return False

    updated = dedupe_timeout_triplets(original)

    # ── Daphne upstream ────────────────────────────────────
    # Önce __DAPHNE_UPSTREAM_SERVERS__ yer tutucusunu dene (yeni şablon)
    daphne_done = patch_upstream(updated, "__DAPHNE_UPSTREAM_SERVERS__", daphne_lines, "ramis_daphne")
    if daphne_done != updated:
        updated = daphne_done
    else:
        # Geriye dönük: eski ramis_api adını bulup güncelle
        daphne_done = patch_upstream(updated, "__DAPHNE_UPSTREAM_SERVERS__", daphne_lines, "ramis_api")
        if daphne_done != updated:
            updated = daphne_done
        # upstream adını her koşulda ramis_daphne yap
        # (server satırları aynı kalsa bile rename gerekebilir)
        if "upstream ramis_api {" in updated:
            updated = updated.replace("upstream ramis_api {", "upstream ramis_daphne {", 1)

    # ── Uvicorn upstream ───────────────────────────────────
    # Yer tutucuyu dene (yeni şablon)
    uvicorn_done = patch_upstream(updated, "__UVICORN_UPSTREAM_SERVERS__", uvicorn_lines, "ramis_uvicorn")
    if uvicorn_done != updated:
        updated = uvicorn_done
    else:
        # Var olan ramis_uvicorn bloğunu güncelle
        uvicorn_done = patch_upstream(updated, "__UVICORN_UPSTREAM_SERVERS__", uvicorn_lines, "ramis_uvicorn")
        if uvicorn_done != updated:
            updated = uvicorn_done
        else:
            # Hiç yoksa — eski config — upstream bloğu oluştur
            with_uvicorn = ensure_uvicorn_upstream(updated, uvicorn_lines)
            if with_uvicorn != updated:
                updated = with_uvicorn

    # ── Location proxy_pass güncellemesi ───────────────────
    # /api/ ve /admin/ → ramis_uvicorn (HTTP)
    for loc in ("/api/", "/admin/"):
        before = updated
        updated = patch_location_proxy_pass(updated, loc, "ramis_uvicorn")
        if updated != before:
            # Timeout'ları ekle (yoksa)
            updated = patch_location_timeouts(updated, loc)

    # / (catch-all) → ramis_uvicorn (API domain'de HTTP root)
    # NOT: Single domain'de / → ramis_next olduğu için regex eşleşmez, dokunulmaz
    before = updated
    updated = patch_location_proxy_pass(updated, "/", "ramis_uvicorn")
    if updated != before:
        updated = patch_location_timeouts(updated, "/")

    # /ws/ → ramis_daphne (WebSocket)
    updated = patch_location_proxy_pass(updated, "/ws/", "ramis_daphne")

    # WS location read_timeout 86400 zaten varsa dokunma
    if updated != original:
        path.write_text(updated, encoding="utf-8")
        return True
    return False


paths = list(pathlib.Path("/etc/nginx/sites-available").glob("ramis*.conf"))
changed = False
for path in sorted(paths):
    if patch_file(path):
        changed = True
if not paths:
    print("UYARI: /etc/nginx/sites-available/ içinde ramis*.conf bulunamadı", file=sys.stderr)
    sys.exit(2)
sys.exit(0 if changed else 1)
PY
}

ramis_apply_split_upstream_to_nginx() {
    local daphne_instances uvicorn_instances daphne_lines uvicorn_lines rc
    daphne_instances="$(ramis_daphne_instance_count)"
    uvicorn_instances="$(ramis_uvicorn_instance_count)"
    daphne_lines="$(ramis_daphne_upstream_lines "$daphne_instances")"
    uvicorn_lines="$(ramis_uvicorn_upstream_lines "$uvicorn_instances")"
    _ramis_nginx_patch_py "$daphne_lines" "$uvicorn_lines"
    rc=$?
    if [[ $rc -eq 2 ]]; then
        warn "Nginx config dosyası bulunamadı — upstream yaması atlandı"
    elif [[ $rc -eq 1 ]]; then
        info "Nginx config güncel (upstream değişikliği gerekmedi)"
    fi
    return $rc
}

# Geriye dönük uyumluluk — aynı işi yapar (artık split sürümü).
ramis_apply_daphne_upstream_to_nginx() {
    ramis_apply_split_upstream_to_nginx
}

ramis_ensure_nginx_api_proxy_timeouts() {
    ramis_apply_split_upstream_to_nginx
}
