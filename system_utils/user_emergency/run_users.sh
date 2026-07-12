#!/bin/bash
# Ramis acil kullanıcı yönetimi — GTK başlatıcı
cd "$(dirname "$0")"
export RAMIS_USER_ADMIN_SCRIPT_DIR="$(pwd)"
exec python3 ramis_user_admin.py
