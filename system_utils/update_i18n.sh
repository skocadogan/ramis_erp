#!/usr/bin/env bash
# Ramis update.sh — kullanıcı arayüzü çevirileri (source edilir).
#
# INSTALL_LANG değişkeni: tr | en | bg | sq
#
# Kullanım: _L <anahtar> [varsayılan]
#   Eşleşen bir çeviri varsa onu, yoksa verilen varsayılan metni (o da
#   verilmediyse anahtarın kendisini) döndürür.
#
# Türkçe metinler çağrı tarafında fallback olarak verilir. bg/sq için ayrı
# çeviri tanımlanmaz; fallback (Türkçe) kullanılır. Yalnızca `en` karşılıkları
# bu dosyada tutulur. Anahtarlar install_i18n.sh ile çakışmasın diye `upd_`
# öneki taşır.
_L() {
    local key="$1"
    local fallback="${2:-$1}"

    case "${INSTALL_LANG:-tr}:$key" in

        # --- Yardım metni ---
        en:upd_help_title) echo "RAMIS ERP · Update" ;;
        en:upd_help_help) echo "help" ;;
        en:upd_help_usage) echo "Usage" ;;
        en:upd_help_from_root) echo "from the project root:" ;;
        en:upd_help_option_word) echo "[option]" ;;
        en:upd_help_options) echo "Options" ;;
        en:upd_help_none) echo "(none)" ;;
        en:upd_help_default_1) echo "Full mode: backend + frontend files, dependencies," ;;
        en:upd_help_default_2) echo "optional frontend build, all Ramis services." ;;
        en:upd_help_db) echo "Database migration only; Daphne stops briefly." ;;
        en:upd_help_backend) echo "Pip, migrate, collectstatic; Daphne / Worker / Beat." ;;
        en:upd_help_frontend) echo "rsync, npm ci / build, Next.js service." ;;
        en:upd_help_changeip_1) echo "If the network IP changed, backend/frontend env, runtime-config.json," ;;
        en:upd_help_changeip_2) echo "Nginx server_name are updated; services are restarted." ;;
        en:upd_help_changeip_3) echo "Frontend rebuild is not required (runtime-config.json)." ;;
        en:upd_help_changeip_4) echo "If no IP is given, it is auto-detected." ;;
        en:upd_help_changeip_5) echo "If the IP is the same, only a missing runtime-config.json is created." ;;
        en:upd_help_changeip_example) echo "Example: sudo bash update.sh --change-ip 192.168.1.50" ;;
        en:upd_help_syncrc_1) echo "Rewrites /etc/ramis/runtime-config.json from frontend.env;" ;;
        en:upd_help_syncrc_2) echo "applies the NEXT_PUBLIC_POS_OFFLINE_QUEUE=true production default." ;;
        en:upd_help_synccelery_1) echo "Rewrites ramis-worker units using" ;;
        en:upd_help_synccelery_2) echo "CELERY_PRINTING_WORKER_CONCURRENCY from backend.env (daemon-reload)." ;;
        en:upd_help_reload_roles) echo "Refreshes RBAC roles via seed_rbac." ;;
        en:upd_help_seed_allergens) echo "Refreshes the default allergen reference list via seed_allergens." ;;
        en:upd_help_reset_users) echo "Recreates sample users (passwords reset)." ;;
        en:upd_help_lang) echo "Seed / rbac language selection (default: tr)." ;;
        en:upd_help_veritabani) echo "same as --db-only" ;;
        en:upd_help_h) echo "Shows this help." ;;
        en:upd_help_log) echo "Detailed log:" ;;

        # --- Banner / mod satırları ---
        en:upd_banner_title) echo "RAMIS ERP · Update" ;;
        en:upd_banner_sub) echo "·  updates project files and services" ;;
        en:upd_mode_label) echo "Mode:" ;;
        en:upd_mode_all) echo "full update" ;;
        en:upd_mode_all_note) echo "(backend + frontend + services)" ;;
        en:upd_mode_db) echo "database only" ;;
        en:upd_mode_db_note) echo "(migrate + optional seed)" ;;
        en:upd_mode_backend) echo "backend only" ;;
        en:upd_mode_backend_note) echo "(rsync, pip, migrate, static)" ;;
        en:upd_mode_frontend) echo "frontend only" ;;
        en:upd_mode_frontend_note) echo "(rsync, npm, Next.js)" ;;
        en:upd_mode_changeip) echo "IP update" ;;
        en:upd_mode_changeip_note) echo "(env + Nginx + services)" ;;
        en:upd_mode_syncrc) echo "runtime-config.json sync" ;;
        en:upd_mode_syncrc_note) echo "(frontend.env)" ;;
        en:upd_mode_synccelery) echo "Celery worker units" ;;
        en:upd_mode_synccelery_note) echo "(printing + pdf_export concurrency)" ;;
        en:upd_log_label) echo "Log:" ;;

        # --- die / ana akış mesajları ---
        en:upd_die_footer) echo "Operation stopped." ;;
        en:upd_die_root) echo "Root privileges required. Example: sudo bash update.sh" ;;
        en:upd_die_no_install) echo "Ramis ERP installation not found:" ;;
        en:upd_die_no_src) echo "Project source files not found:" ;;
        en:upd_die_no_venv) echo "Python venv not found:" ;;
        en:upd_die_celery) echo "Celery worker units could not be updated" ;;
        en:upd_info_stopping_services) echo "Stopping services..." ;;
        en:upd_success_services_stopped) echo "Related services stopped" ;;
        en:upd_info_backend_files) echo "Updating backend files..." ;;
        en:upd_success_backend_files) echo "Backend files updated" ;;
        en:upd_info_frontend_files) echo "Updating frontend files..." ;;
        en:upd_success_frontend_files) echo "Frontend files updated" ;;
        en:upd_info_restarting_services) echo "Restarting services..." ;;
        en:upd_done_title) echo "Update completed." ;;
        en:upd_done_title_db) echo "Database update completed." ;;
        en:upd_done_log) echo "Full log file:" ;;
        en:upd_done_log_db) echo "Detailed log:" ;;
        en:upd_done_backup) echo "Backup directory:" ;;

        # --- change-ip görünür yüzeyi ---
        en:upd_ip_done_title) echo "IP update completed." ;;
        en:upd_lbl_panel) echo "Panel:" ;;
        en:upd_lbl_api) echo "API:" ;;
        en:upd_lbl_current_ip) echo "Current IP:" ;;
        en:upd_lbl_new_ip) echo "New IP:" ;;
        en:upd_ip_manual) echo "(manual)" ;;
        en:upd_ip_auto) echo "(auto-detected)" ;;

        # --- UX bayrakları: yardım ---
        en:upd_help_yes) echo "Automatically accept all confirmation prompts." ;;
        en:upd_help_quiet) echo "Hide info/success output (warn/fail still shown)." ;;
        en:upd_help_no_color) echo "Disable colors (auto-applied when not a TTY)." ;;
        en:upd_help_dry_run) echo "Show planned actions without making any changes." ;;
        en:upd_help_keep_sources) echo "Skip frontend source cleanup." ;;
        en:upd_help_rollback) echo "Restore the most recent file backup." ;;
        en:upd_help_version) echo "Print version and exit." ;;

        # --- rollback modu ---
        en:upd_mode_rollback) echo "rollback" ;;
        en:upd_mode_rollback_note) echo "(most recent file backup)" ;;

        # --- dry-run ---
        en:upd_dryrun_header) echo "DRY-RUN — planned actions:" ;;
        en:upd_dryrun_db_env) echo "backend.env default keys will be checked/updated" ;;
        en:upd_dryrun_migrate) echo "Database migrations will run (manage.py migrate)" ;;
        en:upd_dryrun_db_beat) echo "Celery Beat schedule will sync; beat/maintenance/broadcast will restart" ;;
        en:upd_dryrun_rsync_backend) echo "Backend sources will be rsync'd to the install dir" ;;
        en:upd_dryrun_pip) echo "Python dependencies will be updated (pip install)" ;;
        en:upd_dryrun_collectstatic) echo "Static files will be collected (collectstatic)" ;;
        en:upd_dryrun_celery_units) echo "Daphne/Celery systemd units will be rewritten" ;;
        en:upd_dryrun_restart_backend) echo "Daphne, Uvicorn, worker and beat services will restart" ;;
        en:upd_dryrun_rsync_frontend) echo "Frontend sources will be rsync'd to the install dir" ;;
        en:upd_dryrun_npm) echo "Frontend deps (npm ci) and build (npm run build) will run" ;;
        en:upd_dryrun_frontend_service) echo "ramis-frontend service will restart" ;;
        en:upd_dryrun_restart_all) echo "Daphne, Uvicorn, worker, beat and frontend services will restart" ;;
        en:upd_dryrun_syncrc) echo "/etc/ramis/runtime-config.json will be rewritten from frontend.env" ;;
        en:upd_dryrun_synccelery) echo "Celery worker systemd units will be rewritten with concurrency" ;;
        en:upd_dryrun_generic) echo "Update steps will be applied" ;;
        en:upd_dryrun_keep_sources) echo "Frontend sources will not be cleaned (--keep-sources)" ;;
        en:upd_dryrun_noop) echo "DRY-RUN: no changes were made." ;;
        en:upd_dryrun_changeip_1) echo "backend.env / frontend.env / runtime-config.json will be updated with the new IP" ;;
        en:upd_dryrun_changeip_2) echo "Nginx server_name will be changed to the new IP" ;;
        en:upd_dryrun_changeip_3) echo "Daphne, Uvicorn, worker, beat and frontend services will restart" ;;

        # --- rollback görünür yüzeyi ---
        en:upd_rollback_no_backup) echo "No backup found to restore:" ;;
        en:upd_rollback_empty) echo "Backup directory is empty (no backend/ or frontend/):" ;;
        en:upd_rollback_latest) echo "Backup to restore:" ;;
        en:upd_rollback_restore_backend) echo "backend →" ;;
        en:upd_rollback_restore_frontend) echo "frontend →" ;;
        en:upd_rollback_would_restore) echo "The backup above will be restored with rsync -a (--delete is NOT used)" ;;
        en:upd_rollback_would_restart) echo "Related services will be stopped and restarted" ;;
        en:upd_rollback_confirm) echo "Restore this backup? Current backend/frontend files will be overwritten with the backup version." ;;
        en:upd_rollback_cancelled) echo "Rollback cancelled" ;;
        en:upd_rollback_restoring_backend) echo "Restoring backend backup (rsync -a, no --delete)..." ;;
        en:upd_rollback_restored_backend) echo "Backend backup restored" ;;
        en:upd_rollback_restoring_frontend) echo "Restoring frontend backup (rsync -a, no --delete)..." ;;
        en:upd_rollback_restored_frontend) echo "Frontend backup restored" ;;
        en:upd_rollback_done) echo "Rollback completed." ;;
        en:upd_status_running) echo "running" ;;
        en:upd_status_failed) echo "failed to start" ;;

        *) echo "$fallback" ;;
    esac
}
