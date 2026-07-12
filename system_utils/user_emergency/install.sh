#!/bin/bash

# Ramis ERP — acil kullanıcı yönetimi (GTK) kurulum betiği
APP_NAME="Ramis acil kullanıcı yönetimi"
APP_EXEC="$(pwd)/run_users.sh"
APP_ICON="system-users"
DESKTOP_FILE_NAME="ramis-user-emergency.desktop"

echo "--- $APP_NAME kurulumu ---"

chmod +x "$(pwd)/run_users.sh" "$(pwd)/run_as_ramis.sh" 2>/dev/null || true

# 1. Bağımlılık kontrolü
if ! dpkg -l | grep -q "python3-gi" || ! dpkg -l | grep -q "gir1.2-gtk-4.0" || ! dpkg -l | grep -q "gir1.2-adw-1"; then
    echo "Gerekli paketler eksik. Kurmak için şifrenizi giriniz..."
    sudo apt update && sudo apt install -y python3-gi gir1.2-gtk-4.0 gir1.2-adw-1
fi

# 2. .desktop dosyası
cat <<EOF > "$DESKTOP_FILE_NAME"
[Desktop Entry]
Name=$APP_NAME
Comment=KDS dışı kullanıcı yönetimi, login kilidi kaldırma, parola sıfırlama ve süper kullanıcı oluşturma
Exec=$APP_EXEC
Icon=$APP_ICON
Terminal=false
Type=Application
Categories=System;Settings;
EOF

chmod +x "$DESKTOP_FILE_NAME"

mkdir -p ~/.local/share/applications/
cp "$DESKTOP_FILE_NAME" ~/.local/share/applications/
echo "Uygulama menüsüne eklendi."

read -p "Masaüstüne kısayol oluşturulsun mu? (e/h): " desk_ans
if [[ $desk_ans == "e" || $desk_ans == "E" ]]; then
    mkdir -p ~/Desktop/
    cp "$DESKTOP_FILE_NAME" ~/Desktop/
    gio set ~/Desktop/"$DESKTOP_FILE_NAME" metadata::trusted true 2>/dev/null
    chmod +x ~/Desktop/"$DESKTOP_FILE_NAME"
    echo "Masaüstü kısayolu oluşturuldu."
fi

rm "$DESKTOP_FILE_NAME"
echo ""
echo "Kurulum tamamlandı."
echo "Üretimde backend yolu varsayılan: /srv/ramis_erp/backend"
echo "Farklı kurulum için ortam değişkenleri: RAMIS_INSTALL_DIR, RAMIS_BACKEND_DIR, RAMIS_SYS_USER"
echo "Geliştirme (pkexec olmadan): RAMIS_USER_ADMIN_NO_PKEXEC=1 ve gerekirse RAMIS_USER_ADMIN_ALLOW_SYSTEM_PYTHON=1"
