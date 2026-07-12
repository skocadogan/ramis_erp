#!/bin/bash
# pkexec ile root olarak settings_privileged.py çalıştırır.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "${SCRIPT_DIR}/settings_privileged.py" ]]; then
    echo "settings_privileged.py bulunamadı: ${SCRIPT_DIR}" >&2
    exit 1
fi

export PYTHONPATH="${SCRIPT_DIR}${PYTHONPATH:+:${PYTHONPATH}}"

exec python3 "${SCRIPT_DIR}/settings_privileged.py" "$@"
