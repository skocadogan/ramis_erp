#!/bin/bash
# Ramis ERP Servis İzleyici başlatıcı (V1.2)
# Bağımlılıklar: python3-gi, gir1.2-gtk-4.0, gir1.2-adw-1
# beat_jobs_catalog.py: system_utils/ (PYTHONPATH)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEM_UTILS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${SCRIPT_DIR}"

if [[ ! -f "${SCRIPT_DIR}/ramis_monitor.py" ]]; then
    echo "ramis_monitor.py bulunamadı: ${SCRIPT_DIR}" >&2
    exit 1
fi

if [[ ! -f "${SYSTEM_UTILS_DIR}/beat_jobs_catalog.py" ]]; then
    echo "beat_jobs_catalog.py bulunamadı: ${SYSTEM_UTILS_DIR}" >&2
    echo "Zamanlanmış görevler sekmesi için bu dosya gereklidir." >&2
    exit 1
fi

export PYTHONPATH="${SYSTEM_UTILS_DIR}${PYTHONPATH:+:${PYTHONPATH}}"

exec python3 "${SCRIPT_DIR}/ramis_monitor.py" "$@"
