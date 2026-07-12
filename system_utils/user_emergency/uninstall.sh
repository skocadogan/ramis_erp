#!/bin/bash

# Ramis ERP — acil kullanıcı yönetimi kaldırma betiği
APP_NAME="Ramis acil kullanıcı yönetimi"
DESKTOP_FILE_NAME="ramis-user-emergency.desktop"

echo "--- $APP_NAME kaldırılıyor ---"

if [ -f ~/.local/share/applications/"$DESKTOP_FILE_NAME" ]; then
    rm ~/.local/share/applications/"$DESKTOP_FILE_NAME"
    echo "Uygulama menüsünden kaldırıldı."
fi

if [ -f ~/Desktop/"$DESKTOP_FILE_NAME" ]; then
    rm ~/Desktop/"$DESKTOP_FILE_NAME"
    echo "Masaüstü kısayolu kaldırıldı."
fi

echo "Kaldırma işlemi tamamlandı."
