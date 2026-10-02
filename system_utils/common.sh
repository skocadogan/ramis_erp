#!/usr/bin/env bash
# Ramis ERP ortak bash kütüphanesi.
#
# Bu dosya install.sh, update.sh ve uninstall.sh tarafından `source` edilir.
# Yalnızca fonksiyon tanımları içerir; `set -euo pipefail` UYGULAMAZ (çağıran
# scriptler zaten ayarlar).
#
# Çağıran taraftan gelmesi gereken değişkenler:
#   RED GREEN YELLOW BLUE CYAN BOLD DIM NC CHECK CROSS WARN INFO  (renkler)
#   LOG_FILE      (logların yazıldığı dosya)
#   INSTALL_DIR   (varsayılan kurulum dizini)
#   SYS_USER      (servis/uygulama kullanıcısı)
#   INSTALL_LANG  (tr|en|bg|sq — confirm_yn dil davranışı)
#   die()         (hata halinde çağrılan, çağıran tarafta tanımlı fonksiyon)

# ── Loglama ───────────────────────────────────────────────────────────

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

# --quiet: bilgi/başarı satırları gizlenir; warn/fail her zaman görünür, log tamdır.
info()    { [[ "${RAMIS_QUIET:-false}" == "true" ]] || echo -e "  ${INFO}  $*"; log "INFO: $*"; }
success() { [[ "${RAMIS_QUIET:-false}" == "true" ]] || echo -e "  ${CHECK}  $*"; log "OK: $*"; }
warn()    { echo -e "  ${WARN}  $*"; log "WARN: $*"; }
fail()    { echo -e "  ${CROSS}  $*"; log "FAIL: $*"; }

# ── UX bayrakları (--no-color / --quiet / --yes) ─────────────────────
# Bu değişkenler çağıran script tarafından argümanlardan set edilir; burada
# yalnızca güvenli varsayılanlarla okunurlar.

# Renkleri kapatır (semboller sade kalır).
ramis_disable_colors() {
    RED=''; GREEN=''; YELLOW=''; BLUE=''; CYAN=''; BOLD=''; DIM=''; NC=''
    CHECK='✓'; CROSS='✗'; WARN='‼'; INFO='·'
}

# --no-color verildiyse VEYA çıktı bir terminale gitmiyorsa renkleri kapatır.
ramis_maybe_disable_colors() {
    if [[ "${RAMIS_NO_COLOR:-false}" == "true" ]] || [[ ! -t 1 ]]; then
        ramis_disable_colors
    fi
}

# ── Metin / env yardımcıları ─────────────────────────────────────────

# .env / şifre: açık heredoc $(VAR) genişlerken değerde \n satır kırar; girişte yapıştırma kirliliği
trim_space() {
    local s="$1"
    s="${s#"${s%%[![:space:]]*}"}"
    s="${s%"${s##*[![:space:]]}"}"
    printf '%s' "$s"
}

env_single_line() {
    printf '%s' "$1" | tr -d '\r\n'
}

# PostgreSQL ALTER/CREATE USER — tek tırnak kaçışı (backend.env ile aynı ham parola)
postgres_sql_quote() {
    local s="$1"
    s="${s//\'/\'\'}"
    printf "'%s'" "$s"
}

command_exists() {
    command -v "$1" &>/dev/null
}

service_active() {
    systemctl is-active --quiet "$1" 2>/dev/null
}

# Onay sorusu. Dil davranışı:
#   INSTALL_LANG == en: default "e" → [Y/n] (boş = y), aksi [y/N] (boş = n); kabul: y/yes
#   diğer (tr/bg/sq):   default "e" → [E/h]: (boş = e), aksi [e/H]: (boş = h); kabul: e/evet/y/yes
confirm_yn() {
    local prompt="$1"
    local default="${2:-e}"
    local answer hint

    # --yes: tüm onayları otomatik kabul et.
    if [[ "${RAMIS_ASSUME_YES:-false}" == "true" ]]; then
        log "auto-yes: $prompt"
        return 0
    fi

    if [[ "${INSTALL_LANG:-tr}" == "en" ]]; then
        if [[ "$default" == "e" ]]; then
            hint="[Y/n]"
            read -rp "  $prompt $hint " answer
            answer="${answer:-y}"
        else
            hint="[y/N]"
            read -rp "  $prompt $hint " answer
            answer="${answer:-n}"
        fi
        [[ "${answer,,}" == "y" || "${answer,,}" == "yes" ]]
    else
        if [[ "$default" == "e" ]]; then
            read -rp "  $prompt [E/h]: " answer
            answer="${answer:-e}"
        else
            read -rp "  $prompt [e/H]: " answer
            answer="${answer:-h}"
        fi
        [[ "${answer,,}" == "e" || "${answer,,}" == "evet" || "${answer,,}" == "y" || "${answer,,}" == "yes" ]]
    fi
}

# ── Frontend yardımcıları ────────────────────────────────────────────

# frontend build için /etc/ramis/frontend.env içindeki NEXT_PUBLIC_* satırlarını export ifadelerine çevirir
_frontend_next_public_build_exports() {
    local exports=""
    if [[ -f /etc/ramis/frontend.env ]]; then
        while IFS= read -r line || [[ -n "$line" ]]; do
            [[ "$line" =~ ^[[:space:]]*# ]] && continue
            [[ "$line" =~ ^NEXT_PUBLIC_[A-Za-z0-9_]+= ]] || continue
            exports+=" export ${line};"
        done < /etc/ramis/frontend.env
    fi
    printf '%s' "$exports"
}

# frontend.env içindeki NEXT_PUBLIC_* değerlerini .env.local ile hizalar (rsync .env.local hariç tutar)
_sync_frontend_env_local() {
    local frontend_dir="$1"
    local tmp
    tmp=$(mktemp)
    if [[ -f /etc/ramis/frontend.env ]]; then
        grep -E '^NEXT_PUBLIC_[A-Za-z0-9_]+=' /etc/ramis/frontend.env > "$tmp" || true
    fi
    if [[ -s "$tmp" ]]; then
        install -o "$SYS_USER" -g "$SYS_USER" -m 600 "$tmp" "${frontend_dir}/.env.local"
    fi
    rm -f "$tmp"
}

# next build (output: standalone) + postbuild tamamlandıktan sonra
# üretim sunucusunda artık ihtiyaç duyulmayan kaynak dosyaları temizler.
# Korunanlar: .next/  (çalışan standalone build)
#              .env.local  (rsync hariç tutulur, install.sh oluşturur)
#              scripts/    (prepare-standalone.sh — _prepare_next_standalone tarafından kullanılır)
_cleanup_frontend_sources() {
    local frontend_dir="${1:-${INSTALL_DIR}/frontend}"

    if [[ ! -f "${frontend_dir}/.next/standalone/server.js" ]]; then
        warn "Frontend kaynak temizliği atlandı: standalone build bulunamadı"
        return 1
    fi

    if ! service_active ramis-frontend; then
        warn "Frontend kaynak temizliği atlandı: ramis-frontend servisi çalışmıyor"
        return 1
    fi

    info "Frontend kaynak dosyaları temizleniyor (üretimde gerekli değil)..."

    local cleaned=0
    while IFS= read -r -d '' entry; do
        local base
        base=$(basename "$entry")
        case "$base" in
            .next|.env.local|scripts) : ;;
            *)
                rm -rf "$entry"
                cleaned=1
                ;;
        esac
    done < <(find "${frontend_dir}" -maxdepth 1 -mindepth 1 -print0 2>/dev/null)

    if [[ "$cleaned" -eq 1 ]]; then
        success "Frontend kaynak dosyaları temizlendi (.next/ ve scripts/ korundu)"
        log "Frontend source cleanup tamamlandı: ${frontend_dir}"
    else
        info "Frontend kaynak dizini zaten temiz"
    fi
}

# ── Backend yardımcıları ─────────────────────────────────────────────

# makemessages (.po güncelleme) + django.po → django.mo derleme
_compile_backend_locale() {
    local backend_dir="$1"
    local python="$2"
    local pip="$3"
    local makemessages_args=(
        -l tr -l en -l ar -l de -l ru
        --ignore=venv --ignore=.venv --ignore=env
        --ignore=node_modules --ignore=.pytest_cache
    )

    info "Backend çeviri dizeleri çıkarılıyor (makemessages)..."
    if sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${backend_dir} && ${python} manage.py makemessages ${makemessages_args[*]}" >> "$LOG_FILE" 2>&1; then
        success "Backend django.po dosyaları güncellendi (makemessages)"
    else
        warn "makemessages başarısız — gettext kurulu değilse .po dosyaları rsync ile gelen sürümle kalır"
    fi

    info "Backend dil dosyaları derleniyor (django.po → django.mo)..."
    sudo -u "$SYS_USER" "$pip" install polib >> "$LOG_FILE" 2>&1 || true
    if sudo -u "$SYS_USER" bash -c "cd ${backend_dir} && ${python} scripts/compile_locale_mo.py" >> "$LOG_FILE" 2>&1; then
        success "Backend dil dosyaları derlendi"
        return 0
    fi

    if sudo -u "$SYS_USER" bash -c "set -a && source /etc/ramis/backend.env && set +a && cd ${backend_dir} && ${python} manage.py compilemessages" >> "$LOG_FILE" 2>&1; then
        success "Backend dil dosyaları derlendi (compilemessages)"
        return 0
    fi

    warn "Backend dil dosyaları derlenemedi — çeviri metinleri eksik olabilir"
}

# ── IP / env dosyası yardımcıları ────────────────────────────────────

_is_ipv4() {
    local ip="$1"
    local o o1 o2 o3 o4

    [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1

    IFS='.' read -r o1 o2 o3 o4 <<< "$ip"
    for o in "$o1" "$o2" "$o3" "$o4"; do
        [[ "$o" =~ ^[0-9]+$ ]] || return 1
        (( o >= 0 && o <= 255 )) || return 1
    done
}

_detect_primary_ip() {
    local ip=""
    ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}')
    if [[ -z "$ip" ]]; then
        ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi
    printf '%s' "$ip"
}

_env_get() {
    local file="$1"
    local key="$2"
    grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- || true
}

# sed replacement içinde özel anlam taşıyan &, \ ve | karakterlerini kaçışlar.
_sed_replacement_escape() {
    printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'
}

_env_set() {
    local file="$1"
    local key="$2"
    local value="$3"
    local escaped
    if [[ ! -f "$file" ]]; then
        die "Ortam dosyası bulunamadı: ${file}"
    fi
    if grep -q "^${key}=" "$file"; then
        escaped=$(_sed_replacement_escape "$value")
        sed -i "s|^${key}=.*|${key}=${escaped}|" "$file"
    else
        value="$(printf '%s' "$value" | tr -d '\r\n')"
        echo "${key}=${value}" >> "$file"
    fi
}

# Eksik anahtarları ekler; mevcut aktif satırları değiştirmez. Yorum satırı varsa açar.
# Değişiklik yapıldıysa 0, anahtar zaten aktifse 1 döner.
_env_ensure_default() {
    local file="$1"
    local key="$2"
    local value="$3"
    local escaped
    if grep -qE "^${key}=" "$file" 2>/dev/null; then
        return 1
    fi
    if grep -qE "^#[[:space:]]*${key}=" "$file" 2>/dev/null; then
        escaped=$(_sed_replacement_escape "$value")
        sed -i "s|^#[[:space:]]*${key}=.*|${key}=${escaped}|" "$file"
        return 0
    fi
    value="$(printf '%s' "$value" | tr -d '\r\n')"
    echo "${key}=${value}" >> "$file"
    return 0
}
