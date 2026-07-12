#!/bin/bash
# Ramis ERP Ayar Yöneticisi kurulum betiği

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="Ramis Ayar Yöneticisi"
APP_EXEC="${SCRIPT_DIR}/run_settings.sh"
PRIV_EXEC="${SCRIPT_DIR}/run_privileged.sh"
APP_ICON="preferences-system"
DESKTOP_FILE_NAME="ramis-settings.desktop"

echo "--- ${APP_NAME} Kurulumu ---"

for required in ramis_settings.py settings_schema.py settings_privileged.py env_io.py run_settings.sh run_privileged.sh; do
    if [[ ! -f "${SCRIPT_DIR}/${required}" ]]; then
        echo "Hata: ${required} bulunamadı (${SCRIPT_DIR})" >&2
        exit 1
    fi
done

if ! dpkg -l | grep -q "python3-gi" || ! dpkg -l | grep -q "gir1.2-gtk-4.0" || ! dpkg -l | grep -q "gir1.2-adw-1"; then
    echo "Gerekli paketler kuruluyor..."
    sudo apt update && sudo apt install -y python3-gi gir1.2-gtk-4.0 gir1.2-adw-1 policykit-1
fi

chmod +x "${APP_EXEC}" "${PRIV_EXEC}" "${SCRIPT_DIR}/ramis_settings.py" "${SCRIPT_DIR}/settings_privileged.py"

cat <<EOF > "${DESKTOP_FILE_NAME}"
[Desktop Entry]
Name=${APP_NAME}
Comment=Ramis ERP ortam değişkenleri (backend.env, Beat, Redis bakım)
Exec=${APP_EXEC}
Icon=${APP_ICON}
Terminal=false
Type=Application
Categories=System;Settings;
EOF

chmod +x "${DESKTOP_FILE_NAME}"
mkdir -p ~/.local/share/applications/
cp "${DESKTOP_FILE_NAME}" ~/.local/share/applications/
echo "Uygulama menüsüne eklendi."

read -r -p "Masaüstüne kısayol oluşturulsun mu? (e/h): " desk_ans
if [[ "${desk_ans}" == "e" || "${desk_ans}" == "E" ]]; then
    mkdir -p ~/Desktop/
    cp "${DESKTOP_FILE_NAME}" ~/Desktop/
    gio set ~/Desktop/"${DESKTOP_FILE_NAME}" metadata::trusted true 2>/dev/null || true
    chmod +x ~/Desktop/"${DESKTOP_FILE_NAME}"
    echo "Masaüstü kısayolu oluşturuldu."
fi

rm -f "${DESKTOP_FILE_NAME}"
echo "Kurulum tamamlandı."
