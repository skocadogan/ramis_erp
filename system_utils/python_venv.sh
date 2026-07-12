#!/usr/bin/env bash
# Sanal ortam pip bootstrap (get-pip.py) — install.sh / update.sh tarafından source edilir.
# Gerekli: log, info, success, fail, die, SYS_USER, INSTALL_DIR, LOG_FILE
# İsteğe bağlı renkler: YELLOW, CYAN, RED, DIM

ramis_pip_troubleshoot_hint() {
    local hint1="${1:-Sık nedenler: internet/DNS yok, PyPI erişimi kapalı veya az disk.}"
    local hint2="${2:-PyPI erişimi: curl -I https://pypi.org/simple/ ve sistem saati (TLS) kontrol edin.}"
    echo -e "  ${YELLOW}${hint1}${NC}"
    echo -e "  ${YELLOW}curl -fsSL https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py && sudo -u ${SYS_USER} ${INSTALL_DIR}/backend/.venv/bin/python /tmp/get-pip.py${NC}"
    echo -e "  ${YELLOW}${hint2}${NC}"
    echo ""
}

ramis_run_pip_to_log() {
    local desc="$1"
    local suffix_failed="${2:-başarısız.}"
    local tail_label="${3:-Son günlük satırları}"
    local stopped_label="${4:-İşlem durdu. Tam kayıt:}"
    local log_hint="${5:-Tam günlük (root): sudo tail -n 80 ${LOG_FILE}}"
    shift 5
    if ! "$@" >> "$LOG_FILE" 2>&1; then
        log "FAIL: $desc"
        fail "${desc} ${suffix_failed}"
        ramis_pip_troubleshoot_hint
        echo -e "  ${CYAN}${tail_label}: ${LOG_FILE}${NC}"
        tail -n 60 "$LOG_FILE" 2>/dev/null | sed 's/^/  /' || true
        echo ""
        echo -e "  ${RED}${stopped_label} ${LOG_FILE}${NC}"
        echo -e "  ${DIM}${log_hint}${NC}"
        echo ""
        exit 1
    fi
}

# Debian/Ubuntu python3-pip eski kalabiliyor; venv içine PyPA get-pip.py ile güncel pip kurulur.
ramis_bootstrap_venv_pip() {
    local venv_dir="$1"
    local msg_dl="${2:-get-pip.py indiriliyor (güncel pip)...}"
    local msg_dl_fail="${3:-get-pip.py indirilemedi — internet/DNS kontrol edin.}"
    local msg_run="${4:-Sanal ortama get-pip.py ile güncel pip kuruluyor...}"
    local msg_run_fail="${5:-get-pip.py sanal ortamda başarısız oldu.}"
    local msg_missing="${6:-get-pip.py sonrası pip bulunamadı — günlüğe bakın.}"
    local msg_ok="${7:-pip hazır:}"
    local python="${venv_dir}/bin/python"
    local pip="${venv_dir}/bin/pip"
    local get_pip
    get_pip=$(mktemp /tmp/ramis-get-pip.XXXXXX.py)

    info "$msg_dl"
    if ! curl -fsSL https://bootstrap.pypa.io/get-pip.py -o "$get_pip" >> "$LOG_FILE" 2>&1; then
        rm -f "$get_pip"
        die "$msg_dl_fail"
    fi
    chown "${SYS_USER}:${SYS_USER}" "$get_pip"
    chmod 600 "$get_pip"

    info "$msg_run"
    if ! sudo -u "$SYS_USER" "$python" "$get_pip" >> "$LOG_FILE" 2>&1; then
        rm -f "$get_pip"
        fail "$msg_run_fail"
        ramis_pip_troubleshoot_hint
        echo -e "  ${CYAN}Son günlük satırları: ${LOG_FILE}${NC}"
        tail -n 60 "$LOG_FILE" 2>/dev/null | sed 's/^/  /' || true
        echo ""
        exit 1
    fi
    rm -f "$get_pip"

    if [[ ! -x "$pip" ]]; then
        die "$msg_missing"
    fi

    local pip_ver
    pip_ver=$(sudo -u "$SYS_USER" "$pip" --version 2>&1 || true)
    log "pip bootstrap: ${pip_ver}"
    success "${msg_ok} ${pip_ver}"
}
