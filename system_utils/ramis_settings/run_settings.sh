#!/bin/bash
# Ramis ERP Ayar Yöneticisi başlatıcı
# Bağımlılıklar: python3-gi, gir1.2-gtk-4.0, gir1.2-adw-1, policykit-1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "${SCRIPT_DIR}"

if [[ ! -f "${SCRIPT_DIR}/ramis_settings.py" ]]; then
    echo "ramis_settings.py bulunamadı: ${SCRIPT_DIR}" >&2
    exit 1
fi

if [[ ! -f "${SCRIPT_DIR}/settings_schema.py" ]]; then
    echo "settings_schema.py bulunamadı: ${SCRIPT_DIR}" >&2
    exit 1
fi

if [[ ! -f "${SCRIPT_DIR}/run_privileged.sh" ]]; then
    echo "run_privileged.sh bulunamadı: ${SCRIPT_DIR}" >&2
    exit 1
fi

SYSTEM_UTILS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
if [[ ! -f "${SYSTEM_UTILS_DIR}/beat_jobs_catalog.py" ]]; then
    echo "beat_jobs_catalog.py bulunamadı: ${SYSTEM_UTILS_DIR}" >&2
    exit 1
fi

export PYTHONPATH="${SCRIPT_DIR}:${SYSTEM_UTILS_DIR}${PYTHONPATH:+:${PYTHONPATH}}"

exec python3 "${SCRIPT_DIR}/ramis_settings.py" "$@"
