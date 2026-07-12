#!/bin/bash
# Ramis ERP Servis İzleyici kurulum betiği (V1.2)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEM_UTILS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_NAME="Ramis Servis İzleyici"
APP_EXEC="${SCRIPT_DIR}/run_monitor.sh"
APP_ICON="utilities-system-monitor"
DESKTOP_FILE_NAME="ramis-monitor.desktop"

echo "--- ${APP_NAME} Kurulumu Başlatılıyor ---"

if [[ ! -f "${SCRIPT_DIR}/ramis_monitor.py" ]]; then
    echo "Hata: ramis_monitor.py bulunamadı (${SCRIPT_DIR})" >&2
    exit 1
fi

if [[ ! -f "${SYSTEM_UTILS_DIR}/beat_jobs_catalog.py" ]]; then
    echo "Hata: beat_jobs_catalog.py bulunamadı (${SYSTEM_UTILS_DIR})" >&2
    exit 1
fi

# 1. Bağımlılık kontrolü
if ! dpkg -l | grep -q "python3-gi" || ! dpkg -l | grep -q "gir1.2-gtk-4.0" || ! dpkg -l | grep -q "gir1.2-adw-1"; then
    echo "Gerekli paketler eksik. Kurmak için şifrenizi giriniz..."
    sudo apt update && sudo apt install -y python3-gi gir1.2-gtk-4.0 gir1.2-adw-1
fi

chmod +x "${APP_EXEC}" "${SCRIPT_DIR}/ramis_monitor.py"

# 2. .desktop dosyası
cat <<EOF > "${DESKTOP_FILE_NAME}"
[Desktop Entry]
Name=${APP_NAME}
Comment=Ramis ERP servisleri ve Celery Beat zamanlamalarını izle
Exec=${APP_EXEC}
Icon=${APP_ICON}
Terminal=false
Type=Application
Categories=System;Monitor;
EOF

chmod +x "${DESKTOP_FILE_NAME}"

# 3. Uygulama menüsü
mkdir -p ~/.local/share/applications/
cp "${DESKTOP_FILE_NAME}" ~/.local/share/applications/
echo "Uygulama menüsüne eklendi."

# 4. Masaüstü / otostart
read -r -p "Masaüstüne kısayol oluşturulsun mu? (e/h): " desk_ans
if [[ "${desk_ans}" == "e" || "${desk_ans}" == "E" ]]; then
    mkdir -p ~/Desktop/
    cp "${DESKTOP_FILE_NAME}" ~/Desktop/
    gio set ~/Desktop/"${DESKTOP_FILE_NAME}" metadata::trusted true 2>/dev/null || true
    chmod +x ~/Desktop/"${DESKTOP_FILE_NAME}"
    echo "Masaüstü kısayolu oluşturuldu."
fi

read -r -p "Oturum açıldığında otomatik başlatılsın mı? (e/h): " auto_ans
if [[ "${auto_ans}" == "e" || "${auto_ans}" == "E" ]]; then
    mkdir -p ~/.config/autostart/
    cp "${DESKTOP_FILE_NAME}" ~/.config/autostart/
    echo "Otomatik başlatma listesine eklendi."
fi

rm -f "${DESKTOP_FILE_NAME}"
echo "Kurulum tamamlandı."
