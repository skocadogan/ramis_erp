#!/usr/bin/env bash
# Ramis uninstall.sh — kullanıcı arayüzü çevirileri (source edilir)
#
# INSTALL_LANG değişkeni: tr | en | bg | sq
#
# _L <key> [fallback]
#   Eşleşme varsa çeviriyi, yoksa fallback'i döndürür; fallback verilmezse key.
#   Anahtar öneki `unins_` olduğundan install_i18n.sh anahtarlarıyla çakışmaz.
#   tr / bg / sq için girdi yoktur: bu diller `*` dalından, çağrıda verilen
#   Türkçe fallback metnini alır.

_L() {
    local key="$1"
    local fallback="${2:-$1}"
    case "${INSTALL_LANG:-tr}:${key}" in

        # --- Banner / kök ---
        en:unins_banner_title) echo "RAMIS ERP · Uninstall" ;;
        en:unins_banner_desc) echo "Application services, Nginx site files and environment configuration are removed." ;;
        en:unins_root_required) echo "This script must be run with administrator privileges: sudo bash uninstall.sh" ;;

        # --- Genel onay ---
        en:unins_intro_warn) echo "This operation removes the Ramis application from the server; the database and project files are deleted only if you choose so." ;;
        en:unins_confirm_continue) echo "Continue with the uninstallation?" ;;
        en:unins_cancelled) echo "Operation cancelled." ;;

        # --- Bölüm başlıkları (1..10) ---
        en:unins_sec1) echo "1 · Services" ;;
        en:unins_sec1_sub) echo "Stopping" ;;
        en:unins_sec2) echo "2 · Systemd" ;;
        en:unins_sec2_sub) echo "Removing unit files" ;;
        en:unins_sec3) echo "3 · Nginx" ;;
        en:unins_sec3_sub) echo "Site configuration" ;;
        en:unins_sec4) echo "4 · PostgreSQL" ;;
        en:unins_sec4_sub) echo "Database and application role" ;;
        en:unins_sec5) echo "5 · Environment" ;;
        en:unins_sec5_sub) echo "/etc/ramis" ;;
        en:unins_sec6) echo "6 · Leftovers" ;;
        en:unins_sec6_sub) echo "udev and desktop entries" ;;
        en:unins_sec7) echo "7 · Application files" ;;
        en:unins_sec7_sub) echo "Optional" ;;
        en:unins_sec8) echo "8 · Log files" ;;
        en:unins_sec8_sub) echo "Optional" ;;
        en:unins_sec9) echo "9 · System user" ;;
        en:unins_sec9_sub) echo "Optional" ;;
        en:unins_sec10) echo "10 · Firewall (UFW)" ;;
        en:unins_sec10_sub) echo "Optional" ;;

        # --- 1 · Servisler ---
        en:unins_sec1_info_stop) echo "Stopping and disabling all ramis-* systemd units…" ;;
        en:unins_sec1_info_none) echo "No Ramis unit file found in /etc/systemd/system." ;;
        en:unins_sec1_ok) echo "Ramis systemd units stopped and disabled" ;;

        # --- 2 · Systemd ---
        en:unins_sec2_info_removed) echo "Unit file removed" ;;
        en:unins_sec2_ok) echo "Ramis unit definitions under /etc/systemd/system removed" ;;

        # --- 3 · Nginx ---
        en:unins_sec3_ok) echo "Ramis Nginx site files removed (nginx package remains installed)" ;;

        # --- 4 · PostgreSQL ---
        en:unins_sec4_warn) echo "For a clean reinstall, fully removing the Ramis database and DB user is recommended." ;;
        en:unins_sec4_info_target) echo "Target derived from backend.env (database / user):" ;;
        en:unins_q_pg_remove) echo "Delete the PostgreSQL database and user role entirely?" ;;
        en:unins_q_pg_custom) echo "Do you want to enter a different database/user name?" ;;
        en:unins_prm_db_name) echo "Database name" ;;
        en:unins_prm_db_user) echo "User name" ;;
        en:unins_pg_kept) echo "PostgreSQL database and user were kept." ;;

        # --- 5 · Ortam ---
        en:unins_sec5_ok) echo "Environment files removed" ;;

        # --- 6 · Artıklar ---
        en:unins_udev_ok) echo "ESC/POS udev rule removed" ;;
        en:unins_udev_none) echo "ESC/POS udev rule not found; skipped." ;;
        en:unins_desktop_ok) echo "Desktop entries removed" ;;
        en:unins_desktop_none) echo "Desktop entry not found" ;;
        en:unins_desktop_nohome) echo "User home directory not found" ;;
        en:unins_desktop_nosudo) echo "SUDO_USER is not set; desktop entries skipped." ;;

        # --- 7 · Uygulama dosyaları ---
        en:unins_q_del_installdir) echo "Do you want to delete the installation directory entirely?" ;;
        en:unins_installdir_ok) echo "Installation directory removed" ;;
        en:unins_installdir_kept) echo "Installation directory kept" ;;
        en:unins_installdir_none) echo "Installation directory does not exist" ;;

        # --- 8 · Günlük dosyaları ---
        en:unins_q_del_logs) echo "Do you want to delete the logs under /var/log/ramis?" ;;
        en:unins_logs_ok) echo "Ramis log directory removed" ;;
        en:unins_logs_kept) echo "Logs kept (/var/log/ramis)" ;;

        # --- 9 · Sistem kullanıcısı ---
        en:unins_q_del_user) echo "Do you want to delete the system user?" ;;
        en:unins_user_ok) echo "User removed" ;;
        en:unins_user_kept) echo "User kept (may be needed for file ownership)" ;;

        # --- 10 · Güvenlik duvarı ---
        en:unins_q_ufw) echo "Shall we try removing the UFW rules added by Ramis (80, 9100, etc.)?" ;;
        en:unins_ufw_ok) echo "Relevant UFW rules were removed (missing-rule warnings are normal)" ;;
        en:unins_ufw_kept) echo "UFW rules were not changed" ;;
        en:unins_ufw_none) echo "UFW is not active or not installed; skipped" ;;

        # --- Kapanış özeti ---
        en:unins_done) echo "Uninstallation completed." ;;
        en:unins_footer1) echo "System packages such as PostgreSQL, Redis, Nginx and Node.js are not removed automatically." ;;
        en:unins_footer2) echo "Only the items you approved were deleted; you can remove the packages with apt if needed." ;;

        # --- Yardım / sürüm / bayraklar ---
        en:unins_help_title) echo "RAMIS ERP · Uninstall" ;;
        en:unins_help_help) echo "help" ;;
        en:unins_help_usage) echo "Usage" ;;
        en:unins_help_from_root) echo "from the project root:" ;;
        en:unins_help_option_word) echo "[option]" ;;
        en:unins_help_options) echo "Options" ;;
        en:unins_help_yes) echo "Automatically accept all confirmation prompts." ;;
        en:unins_help_quiet) echo "Hide info/success lines (warnings remain visible)." ;;
        en:unins_help_no_color) echo "Disable colored output." ;;
        en:unins_help_dry_run) echo "Summarize what would be removed without deleting anything." ;;
        en:unins_help_purge_all) echo "Remove database, install directory, logs and system user too (default answer: yes)." ;;
        en:unins_help_keep_data) echo "Keep database, install directory, logs and user; remove only services/config/nginx." ;;
        en:unins_help_version) echo "Print version information and exit." ;;
        en:unins_help_h) echo "Show this help." ;;
        en:unins_help_log) echo "Detailed log:" ;;
        en:unins_err_unknown_option) echo "Unknown option" ;;
        en:unins_err_purge_keep_conflict) echo "--purge-all and --keep-data cannot be used together (one deletes data, the other preserves it)." ;;

        # --- Kapsam seçenekleri (--keep-data) ---
        en:unins_keepdata_pg) echo "--keep-data: PostgreSQL database and user were kept." ;;
        en:unins_keepdata_dir) echo "Installation directory kept due to --keep-data" ;;
        en:unins_keepdata_logs) echo "--keep-data: logs kept (/var/log/ramis)" ;;
        en:unins_keepdata_user) echo "--keep-data: user kept" ;;

        # --- Kuru çalıştırma (--dry-run) ---
        en:unins_dry_run_title) echo "Dry run" ;;
        en:unins_dry_run_sub) echo "No changes are made" ;;
        en:unins_dry_run_will_remove) echo "Items to be removed:" ;;
        en:unins_dry_services) echo "All ramis-* systemd services (stop + disable)" ;;
        en:unins_dry_units) echo "/etc/systemd/system/ramis-*.service unit files" ;;
        en:unins_dry_nginx) echo "Ramis Nginx site files (sites-available + sites-enabled)" ;;
        en:unins_dry_etcramis) echo "/etc/ramis environment/state files" ;;
        en:unins_dry_udev) echo "ESC/POS udev rule (/etc/udev/rules.d/99-escpos.rules)" ;;
        en:unins_dry_desktop) echo "Desktop / autostart entries" ;;
        en:unins_dry_ufw) echo "UFW rules added by Ramis (if approved)" ;;
        en:unins_dry_run_data) echo "Data and user:" ;;
        en:unins_dry_pg_kept) echo "PostgreSQL database + role: KEPT" ;;
        en:unins_dry_dir_kept) echo "Installation directory: KEPT" ;;
        en:unins_dry_logs_kept) echo "Logs: KEPT" ;;
        en:unins_dry_user_kept) echo "System user: KEPT" ;;
        en:unins_dry_pg_removed) echo "PostgreSQL database + role: REMOVED" ;;
        en:unins_dry_dir_removed) echo "Installation directory: REMOVED" ;;
        en:unins_dry_logs_removed) echo "Logs: REMOVED" ;;
        en:unins_dry_user_removed) echo "System user: REMOVED" ;;
        en:unins_dry_pg_ask) echo "PostgreSQL database + role: will prompt" ;;
        en:unins_dry_dir_ask) echo "Installation directory: will prompt" ;;
        en:unins_dry_logs_ask) echo "Logs: will prompt" ;;
        en:unins_dry_user_ask) echo "System user: will prompt" ;;
        en:unins_dry_run_note) echo "DRY-RUN: no changes were made" ;;

        # tr / bg / sq ve tanımsız anahtarlar: çağrıdaki Türkçe metne düş.
        *)
            printf '%s' "$fallback"
            ;;
    esac
}
