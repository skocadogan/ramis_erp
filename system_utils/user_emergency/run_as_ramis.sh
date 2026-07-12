#!/bin/bash
# Ramis backend'de django_user_cli.py çalıştırır. pkexec ile root olarak
# çağrıldığında ramis sistem kullanıcısına düşer.
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

if [[ $# -lt 1 ]]; then
  echo '{"ok":false,"error":"missing_payload","message":"Base64 yük gerekli"}'
  exit 2
fi

TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT
if ! echo "$1" | base64 -d >"$TMPFILE" 2>/dev/null; then
  echo '{"ok":false,"error":"bad_payload","message":"Base64 çözülemedi"}'
  exit 2
fi

run_cli() {
  local py="$1"
  local cli_script="$SCRIPT_DIR/django_user_cli.py"

  # Backend dizininin sahibini tespit et (örn: sedat veya ramis)
  local dir_owner
  dir_owner=$(stat -c '%U' "$BACKEND_DIR" 2>/dev/null || echo "$SYS_USER")

  if [[ $EUID -eq 0 ]]; then
    # Eğer root olarak çalışıyorsak, dizin sahibine geçiş yapalım.
    # Bu, /home/user gibi kısıtlı dizinlere erişimi sağlar ve dosya sahipliğini korur.
    
    # Script dosyasının hedef kullanıcı tarafından okunabilir olduğundan emin olalım.
    if ! sudo -u "$dir_owner" test -r "$cli_script"; then
      cp "$cli_script" /tmp/django_user_cli_tmp.py
      chmod 644 /tmp/django_user_cli_tmp.py
      cli_script="/tmp/django_user_cli_tmp.py"
    fi
    # TMPFILE için de yetki ver
    chmod 644 "$TMPFILE"

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

    # Debug log
    echo "--- ROOT EXECUTION ENV ---" > /tmp/ramis_user_admin_debug.log
    for arg in "${env_args[@]}"; do
      if [[ "$arg" == POSTGRES_PASSWORD=* ]]; then
        echo "$arg" >> /tmp/ramis_user_admin_debug.log
      fi
    done
    echo "dir_owner: $dir_owner" >> /tmp/ramis_user_admin_debug.log
    echo "py: $py" >> /tmp/ramis_user_admin_debug.log

    sudo -u "$dir_owner" env DJANGO_SETTINGS_MODULE=config.settings PYTHONPATH="$BACKEND_DIR" "${env_args[@]}" \
      bash -c "cd \"$BACKEND_DIR\" && exec \"$py\" \"$cli_script\" \"$TMPFILE\""
  else
    # Root değilsek doğrudan çalıştır (mevcut kullanıcı dizine erişebiliyorsa)
    export DJANGO_SETTINGS_MODULE=config.settings
    export PYTHONPATH="$BACKEND_DIR"
    cd "$BACKEND_DIR"
    
    # Debug log
    echo "--- NON-ROOT EXECUTION ---" > /tmp/ramis_user_admin_debug.log
    
    if [[ -f /etc/ramis/backend.env ]]; then
      set -a
      source /etc/ramis/backend.env
      set +a
      echo "POSTGRES_PASSWORD: $POSTGRES_PASSWORD" >> /tmp/ramis_user_admin_debug.log
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
