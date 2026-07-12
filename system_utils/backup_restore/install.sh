#!/bin/bash

# Ramis ERP Yedekleme Yönetimi Kurulum Betiği
APP_NAME="Ramis Yedekleme Yönetimi"
APP_EXEC="$(pwd)/run_backup.sh"
APP_ICON="document-save-as"
DESKTOP_FILE_NAME="ramis-backup.desktop"

echo "--- $APP_NAME Kurulumu Başlatılıyor ---"

# 1. Bağımlılık Kontrolü
if ! dpkg -l | grep -q "python3-gi" || ! dpkg -l | grep -q "gir1.2-gtk-4.0" || ! dpkg -l | grep -q "gir1.2-adw-1"; then
    echo "Gerekli paketler eksik. Kurmak için şifrenizi giriniz..."
    sudo apt update && sudo apt install -y python3-gi gir1.2-gtk-4.0 gir1.2-adw-1
fi

# 2. .desktop dosyası oluşturma
cat <<EOF > $DESKTOP_FILE_NAME
[Desktop Entry]
Name=$APP_NAME
Comment=Ramis ERP Veritabanı Yedekleme ve Geri Yükleme
Exec=$APP_EXEC
Icon=$APP_ICON
Terminal=false
Type=Application
Categories=System;Settings;
EOF

chmod +x $DESKTOP_FILE_NAME

# 3. Uygulama menüsüne ekle
mkdir -p ~/.local/share/applications/
cp $DESKTOP_FILE_NAME ~/.local/share/applications/
echo "Uygulama menüsüne eklendi."

# 4. Masaüstü Kısayolu
read -p "Masaüstüne kısayol oluşturulsun mu? (e/h): " desk_ans
if [[ $desk_ans == "e" || $desk_ans == "E" ]]; then
    mkdir -p ~/Desktop/
    cp $DESKTOP_FILE_NAME ~/Desktop/
    gio set ~/Desktop/$DESKTOP_FILE_NAME metadata::trusted true 2>/dev/null
    chmod +x ~/Desktop/$DESKTOP_FILE_NAME
    echo "Masaüstü kısayolu oluşturuldu."
fi

# Temizlik
rm $DESKTOP_FILE_NAME
echo "Kurulum tamamlandı!"
