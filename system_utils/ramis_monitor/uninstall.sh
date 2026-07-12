#!/bin/bash
# Ramis ERP Servis İzleyici kaldırma betiği

set -euo pipefail

APP_NAME="Ramis Servis İzleyici"
DESKTOP_FILE_NAME="ramis-monitor.desktop"

echo "--- ${APP_NAME} Kaldırılıyor ---"

if [[ -f "${HOME}/.local/share/applications/${DESKTOP_FILE_NAME}" ]]; then
    rm "${HOME}/.local/share/applications/${DESKTOP_FILE_NAME}"
    echo "Uygulama menüsünden kaldırıldı."
fi

if [[ -f "${HOME}/Desktop/${DESKTOP_FILE_NAME}" ]]; then
    rm "${HOME}/Desktop/${DESKTOP_FILE_NAME}"
    echo "Masaüstü kısayolu kaldırıldı."
fi

if [[ -f "${HOME}/.config/autostart/${DESKTOP_FILE_NAME}" ]]; then
    rm "${HOME}/.config/autostart/${DESKTOP_FILE_NAME}"
    echo "Otomatik başlatmadan kaldırıldı."
fi

echo "Kaldırma işlemi tamamlandı."
