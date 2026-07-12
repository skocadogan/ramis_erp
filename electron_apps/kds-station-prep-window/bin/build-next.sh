#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
APP_DIR="$ROOT_DIR/electron_apps/kds-station-prep-window"
NEXT_OUTPUT_DIR="$APP_DIR/src"
KDS_DIR="$ROOT_DIR/electron_apps/kds"

echo "🔧 [1/3] Frontend build alınıyor..."
cd "$FRONTEND_DIR"
npm run build

echo "📦 [2/3] Standalone çıktı kopyalanıyor..."
rm -rf "$NEXT_OUTPUT_DIR"
cp -r .next/standalone "$NEXT_OUTPUT_DIR"

if [ -d "$NEXT_OUTPUT_DIR/node_modules" ]; then
  mv "$NEXT_OUTPUT_DIR/node_modules" "$NEXT_OUTPUT_DIR/node_modules_prod"
fi

mkdir -p "$NEXT_OUTPUT_DIR/public"
if [ -d "public" ]; then
  cp -r public/* "$NEXT_OUTPUT_DIR/public/"
fi

mkdir -p "$NEXT_OUTPUT_DIR/.next"
if [ -d ".next/static" ]; then
  cp -r .next/static "$NEXT_OUTPUT_DIR/.next/static"
fi

mkdir -p "$APP_DIR/resources/sounds"
if [ -d "public/sounds" ]; then
  cp -r public/sounds/* "$APP_DIR/resources/sounds/"
fi

if [ ! -f "$APP_DIR/resources/icon.png" ] && [ -f "$KDS_DIR/resources/icon.png" ]; then
  mkdir -p "$APP_DIR/resources"
  cp "$KDS_DIR/resources/icon.png" "$APP_DIR/resources/icon.png"
fi

echo "✅ [3/3] Build tamamlandı → $NEXT_OUTPUT_DIR"
