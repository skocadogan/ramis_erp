#!/bin/bash
# Ramis backend'de django_user_cli.py çalıştırır. pkexec ile root olarak
# çağrıldığında ramis sistem kullanıcısına düşer.
#
# Kullanım:
#   run_as_ramis.sh --payload-file /path/to/payload.json
#   run_as_ramis.sh <base64-payload>   # geriye dönük uyumluluk (tercih edilmez)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Otomatik dizin tespiti: Script'in üst dizinlerinde RAMIS backend'i ara
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
if [[ -f "$PROJECT_ROOT/backend/manage.py" ]]; then
  DEFAULT_INSTALL_DIR="$PROJECT_ROOT"
else
  DEFAULT_INSTALL_DIR="/srv/ramis_erp"
fi

INSTALL_DIR="${RAMIS_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
BACKEND_DIR="${RAMIS_BACKEND_DIR:-$INSTALL_DIR/backend}"
SYS_USER="${RAMIS_SYS_USER:-ramis}"

# Sanal ortam tespiti (.venv veya env)
VENV_PY=""
for d in ".venv" "venv" "env"; do
  if [[ -x "$BACKEND_DIR/$d/bin/python" ]]; then
    VENV_PY="$BACKEND_DIR/$d/bin/python"
    break
  fi
done

OWNED_TMPFILES=()
CLI_TMP_COPY=""
cleanup() {
  local f
  for f in "${OWNED_TMPFILES[@]:-}"; do
    [[ -n "$f" && -f "$f" ]] && rm -f "$f"
  done
  [[ -n "$CLI_TMP_COPY" && -f "$CLI_TMP_COPY" ]] && rm -f "$CLI_TMP_COPY"
}
trap cleanup EXIT

if [[ $# -lt 1 ]]; then
  echo '{"ok":false,"error":"missing_payload","message":"Payload dosyası veya Base64 yük gerekli"}'
  exit 2
fi

if [[ "$1" == "--payload-file" ]]; then
  if [[ $# -lt 2 || -z "${2:-}" ]]; then
    echo '{"ok":false,"error":"missing_payload","message":"--payload-file yolu gerekli"}'
    exit 2
  fi
  TMPFILE="$2"
  if [[ ! -f "$TMPFILE" ]]; then
    echo '{"ok":false,"error":"bad_payload","message":"Payload dosyası bulunamadı"}'
    exit 2
  fi
else
  # Geriye dönük: base64 argv (parola process listesinde görünebilir — GUI artık dosya kullanır)
  TMPFILE=$(mktemp)
  OWNED_TMPFILES+=("$TMPFILE")
  chmod 600 "$TMPFILE"
  if ! echo "$1" | base64 -d >"$TMPFILE" 2>/dev/null; then
    echo '{"ok":false,"error":"bad_payload","message":"Base64 çözülemedi"}'
    exit 2
  fi
fi

# Payload yalnızca bu süreç ve hedef kullanıcı tarafından okunabilsin
chmod 600 "$TMPFILE" 2>/dev/null || true

run_cli() {
  local py="$1"
  local cli_script="$SCRIPT_DIR/django_user_cli.py"

  # Backend dizininin sahibini tespit et (örn: sedat veya ramis)
  local dir_owner
  dir_owner=$(stat -c '%U' "$BACKEND_DIR" 2>/dev/null || echo "$SYS_USER")

  if [[ $EUID -eq 0 ]]; then
    # Script dosyasının hedef kullanıcı tarafından okunabilir olduğundan emin olalım.
    if ! sudo -u "$dir_owner" test -r "$cli_script"; then
      CLI_TMP_COPY=$(mktemp /tmp/django_user_cli.XXXXXX.py)
      cp "$cli_script" "$CLI_TMP_COPY"
      chmod 600 "$CLI_TMP_COPY"
      chown "$dir_owner":"$dir_owner" "$CLI_TMP_COPY"
      cli_script="$CLI_TMP_COPY"
    fi

    # Çağıranın payload dosyasını chown etme — kopya üzerinden çalış (GUI unlink edebilsin)
    local payload_for_user
    payload_for_user=$(mktemp)
    OWNED_TMPFILES+=("$payload_for_user")
    cp "$TMPFILE" "$payload_for_user"
    chown "$dir_owner":"$dir_owner" "$payload_for_user"
    chmod 600 "$payload_for_user"

    # Sistem ayarlarını root olarak oku ve env ile aktar
    local env_args=()
    if [[ -f /etc/ramis/backend.env ]]; then
      while IFS= read -r line || [[ -n "$line" ]]; do
        if [[ ! "$line" =~ ^# ]] && [[ "$line" == *=* ]]; then
          local key="${line%%=*}"
          local val="${line#*=}"
          val="${val#\"}"
          val="${val%\"}"
          val="${val#\'}"
          val="${val%\'}"
          env_args+=("$key=$val")
        fi
      done < /etc/ramis/backend.env
    fi

    sudo -u "$dir_owner" env DJANGO_SETTINGS_MODULE=config.settings PYTHONPATH="$BACKEND_DIR" "${env_args[@]}" \
      bash -c "cd \"$BACKEND_DIR\" && exec \"$py\" \"$cli_script\" \"$payload_for_user\""
  else
    export DJANGO_SETTINGS_MODULE=config.settings
    export PYTHONPATH="$BACKEND_DIR"
    cd "$BACKEND_DIR"

    if [[ -f /etc/ramis/backend.env ]]; then
      set -a
      # shellcheck disable=SC1091
      source /etc/ramis/backend.env
      set +a
    fi
    exec "$py" "$cli_script" "$TMPFILE"
  fi
}

if [[ -n "$VENV_PY" ]]; then
  run_cli "$VENV_PY"
elif [[ "${RAMIS_USER_ADMIN_ALLOW_SYSTEM_PYTHON:-}" == "1" ]]; then
  SYSPY="$(command -v python3 || true)"
  if [[ -z "$SYSPY" ]]; then
    echo "{\"ok\":false,\"error\":\"Python bulunamadı.\",\"message\":\"python3 bulunamadı\"}"
    exit 1
  fi
  run_cli "$SYSPY"
else
  echo "{\"ok\":false,\"error\":\"Sanal ortam bulunamadı.\",\"path\":\"$BACKEND_DIR/.venv/bin/python\",\"backend\":\"$BACKEND_DIR\"}"
  exit 1
fi
