#!/usr/bin/env bash
# next build (output: standalone) sonrası public ve statik dosyaları standalone pakete kopyalar.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STANDALONE="${ROOT}/.next/standalone"
SERVER_JS="${STANDALONE}/server.js"

if [[ ! -f "$SERVER_JS" ]]; then
  echo "prepare-standalone: ${SERVER_JS} bulunamadı (next.config output: standalone gerekli)" >&2
  exit 1
fi

if [[ -d "${ROOT}/public" ]]; then
  rm -rf "${STANDALONE}/public"
  cp -a "${ROOT}/public" "${STANDALONE}/"
fi

if [[ -d "${ROOT}/.next/static" ]]; then
  mkdir -p "${STANDALONE}/.next"
  rm -rf "${STANDALONE}/.next/static"
  cp -a "${ROOT}/.next/static" "${STANDALONE}/.next/"
fi
