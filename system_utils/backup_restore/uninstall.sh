#!/bin/bash

# Ramis ERP Yedekleme Yönetimi Kaldırma Betiği
APP_NAME="Ramis Yedekleme Yönetimi"
DESKTOP_FILE_NAME="ramis-backup.desktop"

echo "--- $APP_NAME Kaldırılıyor ---"

# 1. Menüden kaldır
if [ -f ~/.local/share/applications/$DESKTOP_FILE_NAME ]; then
    rm ~/.local/share/applications/$DESKTOP_FILE_NAME
    echo "Uygulama menüsünden kaldırıldı."
fi

# 2. Masaüstünden kaldır
if [ -f ~/Desktop/$DESKTOP_FILE_NAME ]; then
    rm ~/Desktop/$DESKTOP_FILE_NAME
    echo "Masaüstü kısayolu kaldırıldı."
fi

echo "Kaldırma işlemi tamamlandı."
