import gi
import subprocess
import os
import sys

gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')

from gi.repository import Gtk, Adw, GLib, Gdk

_MONITOR_DIR = os.path.dirname(os.path.abspath(__file__))
_SYSTEM_UTILS = os.path.dirname(_MONITOR_DIR)
if _SYSTEM_UTILS not in sys.path:
    sys.path.insert(0, _SYSTEM_UTILS)

from beat_jobs_catalog import BEAT_JOBS, format_job_schedule, job_description, job_title

# Uvicorn env anahtarı
UVICORN_ENV_KEY = "UVICORN_INSTANCES"
UVICORN_MAX_INSTANCES = 8

def get_lang():
    try:
        if os.path.exists("/etc/ramis/lang"):
            with open("/etc/ramis/lang", "r") as f:
                return f.read().strip()
    except Exception:
        pass
    return "tr"

LANG = get_lang()

TRANSLATIONS = {
    "tr": {
        "loading": "Yükleniyor...",
        "active": "Aktif",
        "activating": "Başlatılıyor...",
        "inactive": "Pasif",
        "disabled": "Devre Dışı",
        "error": "Hata",
        "start": "Başlat",
        "stop": "Durdur",
        "restart": "Yeniden Başlat",
        "refresh_status": "Durumunu Güncelle",
        "clear": "Temizle",
        "status_page_title": "Sistem Durumu",
        "status_page_desc": "Ramis ERP kritik servislerinin anlık durumu",
        "status_page_daphne_hint": "Daphne (WS): {daphne_count} süreç ({daphne_ports}) — Uvicorn (HTTP): {uvicorn_count} süreç ({uvicorn_ports})",
        "logs_tab": "Loglar",
        "status_tab": "Durum",
        "scheduled_tab": "Zamanlanmış görevler",
        "scheduled_tab_desc": "ramis-beat.service — DatabaseScheduler (env: /etc/ramis/backend.env)",
        "scheduled_group_title": "Celery Beat görevleri",
        "scheduled_group_desc": "Saatler Europe/Istanbul. Değişiklik sonrası: sync_celery_beat_schedule",
        "scheduled_beat_hint": "Beat servisi: ramis-beat.service · Bakım kuyruğu: ramis-worker-maintenance.service",
        "start_all": "Tümünü Başlat",
        "stop_all": "Tümünü Durdur",
        "restart_all": "Tümünü Yeniden Başlat",
        "refresh_all": "Durumları Yenile",
        "footer": "Ramis Sistem İzleyicisi V1.2",
        "db_engine": "Veritabanı",
        "backend_engine": "Backend",
        "worker_printing_engine": "Celery Worker (baskı)",
        "worker_maintenance_engine": "Celery Worker (bakım)",
        "beat_engine": "Beat",
        "frontend_engine": "Frontend",
        "nginx_engine": "Nginx",
        "redis_engine": "Redis",
        "app_title": "Ramis Servis İzleyici",
        "svc_pg": "PostgreSQL 16 Engine",
        "svc_redis": "Broker / cache / channels (db 0–2)",
        "svc_nginx": "HTTP reverse proxy :80 → /ws/ → Daphne, /api/ → Uvicorn",
        "svc_daphne": "Django Daphne ASGI (WS)",
        "svc_daphne_extra": "Django Daphne ASGI — port {port}",
        "svc_uvicorn": "Uvicorn ASGI (HTTP API)",
        "svc_uvicorn_extra": "Uvicorn ASGI — port {port}",
        "svc_worker_printing": "Kuyruk: printing — termal fiş baskısı",
        "svc_worker_maintenance": "Kuyruk: maintenance — gece işleri, Redis temizliği, yazıcı sync",
        "svc_worker_broadcast": "Kuyruk: broadcast — KDS/POS gerçek zamanlı WS yayınları",
        "svc_beat": "Zamanlanmış görevler (DatabaseScheduler)",
        "svc_frontend": "Next.js (localhost:3000, Nginx üzerinden)",
        "svc_nginx_api_desc": "Split: /ws/ → Daphne, /api/ + /admin/ → Uvicorn",
    },
    "en": {
        "loading": "Loading...",
        "active": "Active",
        "activating": "Activating...",
        "inactive": "Inactive",
        "disabled": "Disabled",
        "error": "Error",
        "start": "Start",
        "stop": "Stop",
        "restart": "Restart",
        "refresh_status": "Refresh Status",
        "clear": "Clear",
        "status_page_title": "System Status",
        "status_page_desc": "Instant status of Ramis ERP critical services",
        "status_page_daphne_hint": "Daphne (WS): {daphne_count} process(es) ({daphne_ports}) — Uvicorn (HTTP): {uvicorn_count} process(es) ({uvicorn_ports})",
        "logs_tab": "Logs",
        "status_tab": "Status",
        "scheduled_tab": "Scheduled jobs",
        "scheduled_tab_desc": "ramis-beat.service — DatabaseScheduler (env: /etc/ramis/backend.env)",
        "scheduled_group_title": "Celery Beat jobs",
        "scheduled_group_desc": "Times in Europe/Istanbul. After changes: sync_celery_beat_schedule",
        "scheduled_beat_hint": "Beat service: ramis-beat.service · Maintenance queue: ramis-worker-maintenance.service",
        "start_all": "Start All",
        "stop_all": "Stop All",
        "restart_all": "Restart All",
        "refresh_all": "Refresh All",
        "footer": "Ramis System Monitor V1.2",
        "db_engine": "Database",
        "backend_engine": "Backend",
        "worker_printing_engine": "Celery Worker (printing)",
        "worker_maintenance_engine": "Celery Worker (maintenance)",
        "beat_engine": "Beat",
        "frontend_engine": "Frontend",
        "nginx_engine": "Nginx",
        "redis_engine": "Redis",
        "app_title": "Ramis Service Monitor",
        "svc_pg": "PostgreSQL 16 Engine",
        "svc_redis": "Broker / cache / channels (db 0–2)",
        "svc_nginx": "HTTP reverse proxy :80 → /ws/ → Daphne, /api/ → Uvicorn",
        "svc_daphne": "Django Daphne ASGI (WS)",
        "svc_daphne_extra": "Django Daphne ASGI — port {port}",
        "svc_uvicorn": "Uvicorn ASGI (HTTP API)",
        "svc_uvicorn_extra": "Uvicorn ASGI — port {port}",
        "svc_worker_printing": "Queue: printing — thermal receipt jobs",
        "svc_worker_maintenance": "Queue: maintenance — nightly tasks, Redis cleanup, printer sync",
        "svc_worker_broadcast": "Queue: broadcast — KDS/POS real-time WS broadcasts",
        "svc_beat": "Scheduled tasks (DatabaseScheduler)",
        "svc_frontend": "Next.js (localhost:3000, via Nginx)",
        "svc_nginx_api_desc": "Split: /ws/ → Daphne, /api/ + /admin/ → Uvicorn",
    },
    "bg": {
        "loading": "Зареждане...",
        "active": "Активен",
        "activating": "Активира се...",
        "inactive": "Неактивен",
        "disabled": "Изключен",
        "error": "Грешка",
        "start": "Старт",
        "stop": "Стоп",
        "restart": "Рестарт",
        "refresh_status": "Обнови статуса",
        "clear": "Изчисти",
        "status_page_title": "Системен статус",
        "status_page_desc": "Текущо състояние на критичните услуги на Ramis ERP",
        "status_page_daphne_hint": "Daphne (WS): {daphne_count} процес(а) ({daphne_ports}) — Uvicorn (HTTP): {uvicorn_count} процес(а) ({uvicorn_ports})",
        "logs_tab": "Логове",
        "status_tab": "Статус",
        "scheduled_tab": "Планирани задачи",
        "scheduled_tab_desc": "ramis-beat.service — DatabaseScheduler (env: /etc/ramis/backend.env)",
        "scheduled_group_title": "Celery Beat задачи",
        "scheduled_group_desc": "Часове в Europe/Istanbul. След промени: sync_celery_beat_schedule",
        "scheduled_beat_hint": "Beat услуга: ramis-beat.service · Опашка за поддръжка: ramis-worker-maintenance.service",
        "start_all": "Старт на всички",
        "stop_all": "Стоп на всички",
        "restart_all": "Рестарт на всички",
        "refresh_all": "Обнови всички",
        "footer": "Ramis Системен Монитор V1.2",
        "db_engine": "База данни",
        "backend_engine": "Backend",
        "worker_printing_engine": "Celery Worker (печат)",
        "worker_maintenance_engine": "Celery Worker (поддръжка)",
        "beat_engine": "Beat",
        "frontend_engine": "Frontend",
        "nginx_engine": "Nginx",
        "redis_engine": "Redis",
        "app_title": "Ramis Монитор на услуги",
        "svc_pg": "PostgreSQL 16 Engine",
        "svc_redis": "Broker / кеш / канали (db 0–2)",
        "svc_nginx": "HTTP reverse proxy :80 → /ws/ → Daphne, /api/ → Uvicorn",
        "svc_daphne": "Django Daphne ASGI (WS)",
        "svc_daphne_extra": "Django Daphne ASGI — порт {port}",
        "svc_uvicorn": "Uvicorn ASGI (HTTP API)",
        "svc_uvicorn_extra": "Uvicorn ASGI — порт {port}",
        "svc_worker_printing": "Опашка: printing — задачи за термални фишове",
        "svc_worker_maintenance": "Опашка: maintenance — нощни задачи, почистване на Redis, синхронизация на принтер",
        "svc_worker_broadcast": "Опашка: broadcast — KDS/POS реално-времеви WS излъчвания",
        "svc_beat": "Планирани задачи (DatabaseScheduler)",
        "svc_frontend": "Next.js (localhost:3000, през Nginx)",
        "svc_nginx_api_desc": "Разделение: /ws/ → Daphne, /api/ + /admin/ → Uvicorn",
    },
    "sq": {
        "loading": "Duke u ngarkuar...",
        "active": "Aktiv",
        "activating": "Duke u aktivizuar...",
        "inactive": "Joaktiv",
        "disabled": "Çaktivizuar",
        "error": "Gabim",
        "start": "Nis",
        "stop": "Ndal",
        "restart": "Rinis",
        "refresh_status": "Rifresko statusin",
        "clear": "Pastro",
        "status_page_title": "Statusi i Sistemit",
        "status_page_desc": "Gjendja e menjëhershme e shërbimeve kritike të Ramis ERP",
        "status_page_daphne_hint": "Daphne (WS): {daphne_count} proces(е) ({daphne_ports}) — Uvicorn (HTTP): {uvicorn_count} proces(е) ({uvicorn_ports})",
        "logs_tab": "Regjistra",
        "status_tab": "Statusi",
        "scheduled_tab": "Detyra të planifikuara",
        "scheduled_tab_desc": "ramis-beat.service — DatabaseScheduler (env: /etc/ramis/backend.env)",
        "scheduled_group_title": "Detyra Celery Beat",
        "scheduled_group_desc": "Oraret në Europe/Istanbul. Pas ndryshimeve: sync_celery_beat_schedule",
        "scheduled_beat_hint": "Shërbimi Beat: ramis-beat.service · Radha e mirëmbajtjes: ramis-worker-maintenance.service",
        "start_all": "Nis të gjitha",
        "stop_all": "Ndal të gjitha",
        "restart_all": "Rinis të gjitha",
        "refresh_all": "Rifresko të gjitha",
        "footer": "Monitorues i Sistemit Ramis V1.2",
        "db_engine": "Baza e të dhënave",
        "backend_engine": "Backend",
        "worker_printing_engine": "Celery Worker (printim)",
        "worker_maintenance_engine": "Celery Worker (mirëmbajtje)",
        "beat_engine": "Beat",
        "frontend_engine": "Frontend",
        "nginx_engine": "Nginx",
        "redis_engine": "Redis",
        "app_title": "Monitorues i Shërbimeve Ramis",
        "svc_pg": "PostgreSQL 16 Engine",
        "svc_redis": "Broker / cache / kanale (db 0–2)",
        "svc_nginx": "HTTP reverse proxy :80 → /ws/ → Daphne, /api/ → Uvicorn",
        "svc_daphne": "Django Daphne ASGI (WS)",
        "svc_daphne_extra": "Django Daphne ASGI — porti {port}",
        "svc_uvicorn": "Uvicorn ASGI (HTTP API)",
        "svc_uvicorn_extra": "Uvicorn ASGI — porti {port}",
        "svc_worker_printing": "Radha: printing — punë për fatura termike",
        "svc_worker_maintenance": "Radha: maintenance — detyra nate, pastrim Redis, sinkronizim printeri",
        "svc_worker_broadcast": "Radha: broadcast — transmetime në kohë reale KDS/POS përmes WS",
        "svc_beat": "Detyra të planifikuara (DatabaseScheduler)",
        "svc_frontend": "Next.js (localhost:3000, përmes Nginx)",
        "svc_nginx_api_desc": "Ndarje: /ws/ → Daphne, /api/ + /admin/ → Uvicorn",
    },
}

DAPHNE_ENV_PATH = "/etc/ramis/backend.env"
DAPHNE_MAX_INSTANCES = 4


def parse_env_file(path):
    """backend.env — son tanım geçerli (yinelenen anahtarlarda)."""
    values = {}
    if not os.path.exists(path):
        return values
    try:
        with open(path, "r", encoding="utf-8-sig") as env_file:
            for raw_line in env_file:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("export "):
                    line = line[7:].strip()
                if "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                    value = value[1:-1]
                else:
                    value = value.split("#", 1)[0].strip()
                values[key] = value
    except OSError:
        return values
    return values


def detect_daphne_instances_from_systemd_units():
    """Env anahtarı yoksa yüklü ramis-daphne*.service birimlerinden say."""
    count = 0
    for index in range(DAPHNE_MAX_INSTANCES):
        port = 8000 + index
        if index == 0:
            unit_path = "/etc/systemd/system/ramis-daphne.service"
        else:
            unit_path = f"/etc/systemd/system/ramis-daphne-{port}.service"
        if os.path.isfile(unit_path):
            count += 1
        elif index > 0:
            break
    return count


def daphne_systemd_units():
    """(unit_name, port) — daphne_units.sh adlandırması."""
    units = []
    for index in range(read_daphne_instance_count()):
        port = 8000 + index
        if index == 0:
            units.append(("ramis-daphne.service", port))
        else:
            units.append((f"ramis-daphne-{port}.service", port))
    return units


def read_daphne_instance_count():
    """install.sh / daphne_units.sh ile aynı sınırlar (1–4)."""
    values = parse_env_file(DAPHNE_ENV_PATH)
    if "DAPHNE_INSTANCES" in values:
        try:
            count = int(values["DAPHNE_INSTANCES"])
        except ValueError:
            count = 1
    else:
        systemd_count = detect_daphne_instances_from_systemd_units()
        count = systemd_count if systemd_count > 0 else 1
    return max(1, min(DAPHNE_MAX_INSTANCES, count))


def daphne_env_source_hint():
    """Durum metninde env okuma kaynağını göster."""
    if not os.path.exists(DAPHNE_ENV_PATH):
        return f"{DAPHNE_ENV_PATH} (yok — varsayılan 1)"
    values = parse_env_file(DAPHNE_ENV_PATH)
    if "DAPHNE_INSTANCES" in values:
        return f"{DAPHNE_ENV_PATH} → DAPHNE_INSTANCES={values['DAPHNE_INSTANCES']}"
    systemd_count = detect_daphne_instances_from_systemd_units()
    if systemd_count > 0:
        return f"{DAPHNE_ENV_PATH} (anahtar yok) + systemd birimleri → {systemd_count}"
    return f"{DAPHNE_ENV_PATH} (DAPHNE_INSTANCES tanımsız — varsayılan 1)"


# ── Uvicorn detection ─────────────────────────────────────────────

def detect_uvicorn_instances_from_systemd_units() -> int:
    count = 0
    for index in range(UVICORN_MAX_INSTANCES):
        port = 9000 + index
        if index == 0:
            unit_path = "/etc/systemd/system/ramis-uvicorn.service"
        else:
            unit_path = f"/etc/systemd/system/ramis-uvicorn-{port}.service"
        if os.path.isfile(unit_path):
            count += 1
        elif index > 0:
            break
    return count


def read_uvicorn_instance_count() -> int:
    values = parse_env_file(DAPHNE_ENV_PATH)
    if UVICORN_ENV_KEY in values:
        try:
            count = int(values[UVICORN_ENV_KEY])
        except ValueError:
            count = 4
    else:
        systemd_count = detect_uvicorn_instances_from_systemd_units()
        count = systemd_count if systemd_count > 0 else 4
    return max(1, min(UVICORN_MAX_INSTANCES, count))


def uvicorn_systemd_units():
    """(unit_name, port) — uvicorn_units.sh adlandırması."""
    units = []
    for index in range(read_uvicorn_instance_count()):
        port = 9000 + index
        if index == 0:
            units.append(("ramis-uvicorn.service", port))
        else:
            units.append((f"ramis-uvicorn-{port}.service", port))
    return units


def uvicorn_port_list():
    return [9000 + i for i in range(read_uvicorn_instance_count())]


# ── Static service lists ──────────────────────────────────────────

_STATIC_SERVICES_HEAD = (
    ("postgresql.service", "db_engine", "svc_pg"),
    ("redis.service", "redis_engine", "svc_redis"),
    ("nginx.service", "nginx_engine", "svc_nginx"),
)

_STATIC_SERVICES_TAIL = (
    ("ramis-worker.service", "worker_printing_engine", "svc_worker_printing"),
    ("ramis-worker-maintenance.service", "worker_maintenance_engine", "svc_worker_maintenance"),
    ("ramis-worker-broadcast.service", "worker_broadcast_engine", "svc_worker_broadcast"),
    ("ramis-beat.service", "beat_engine", "svc_beat"),
    ("ramis-frontend.service", "frontend_engine", "svc_frontend"),
)


def _(key):
    return TRANSLATIONS[LANG].get(key, key)


def daphne_port_list():
    return [8000 + i for i in range(read_daphne_instance_count())]


def build_monitored_services():
    """Durum sekmesi, log seçici ve toplu systemctl bu listeyi kullanır."""
    entries = []
    # PostgreSQL, Redis, Nginx
    for unit, title_key, subtitle_key in _STATIC_SERVICES_HEAD:
        entries.append((unit, _(title_key), _(subtitle_key)))
    # Daphne instances
    for unit, port in daphne_systemd_units():
        entries.append((
            unit,
            f"{_('backend_engine')} :{port}",
            _("svc_daphne_extra").format(port=port),
        ))
    # Uvicorn instances
    for unit, port in uvicorn_systemd_units():
        entries.append((
            unit,
            f"{_('backend_engine')} :{port}",
            _("svc_uvicorn_extra").format(port=port),
        ))
    # Workers, Beat, Frontend
    for unit, title_key, subtitle_key in _STATIC_SERVICES_TAIL:
        entries.append((unit, _(title_key), _(subtitle_key)))
    return tuple(entries)


def monitored_service_names():
    return [entry[0] for entry in build_monitored_services()]


def get_backend_ips():
    ips = []
    try:
        import subprocess
        res = subprocess.run(["hostname", "-I"], capture_output=True, text=True, timeout=2)
        if res.returncode == 0:
            for ip in res.stdout.strip().split():
                if ip and "." in ip and ip != "127.0.0.1":
                    ips.append(ip)
    except Exception:
        pass

    if not ips:
        try:
            import socket
            hostname = socket.gethostname()
            for ip in socket.gethostbyname_ex(hostname)[2]:
                if ip != "127.0.0.1" and "." in ip:
                    ips.append(ip)
        except Exception:
            pass

    try:
        import json
        config_path = "/etc/ramis/runtime-config.json"
        if os.path.exists(config_path):
            with open(config_path, "r") as f:
                data = json.load(f)
                url = data.get("apiBaseUrl", "")
                from urllib.parse import urlparse
                parsed = urlparse(url)
                if parsed.hostname and parsed.hostname != "localhost" and parsed.hostname != "127.0.0.1":
                    if parsed.hostname not in ips:
                        ips.append(parsed.hostname)
    except Exception:
        pass

    return list(dict.fromkeys(ips))


def build_status_description():
    ips = get_backend_ips()
    ip_label = ", ".join(ips) if ips else "127.0.0.1"
    
    label = "Backend Ulaşım IP: "
    if LANG == "en":
        label = "Backend Access IP: "
    elif LANG == "bg":
        label = "Backend IP за достъп: "
    elif LANG == "sq":
        label = "Backend IP i qasjes: "
        
    return f"{label}{ip_label}"


def compact_icon_button(icon_name, tooltip, on_click):
    """Satır içi aksiyonlar — GTK varsayılan dev ikon boyutunu engeller."""
    btn = Gtk.Button()
    btn.set_has_frame(False)
    btn.add_css_class("flat")
    btn.add_css_class("service-action-btn")
    btn.set_tooltip_text(tooltip)
    icon = Gtk.Image.new_from_icon_name(icon_name)
    icon.set_pixel_size(16)
    btn.set_child(icon)
    btn.connect("clicked", on_click)
    return btn


class ServiceRow(Adw.ActionRow):
    def __init__(self, service_name, title, subtitle):
        super().__init__(title=title, subtitle=subtitle)
        self.service_name = service_name
        self.base_subtitle = subtitle

        self.status_dot = Gtk.Image.new_from_icon_name("media-record-symbolic")
        self.status_dot.set_pixel_size(12)
        self.status_dot.set_valign(Gtk.Align.CENTER)
        self.status_dot.set_margin_end(8)

        self.status_label = Gtk.Label(label=_("loading"))
        self.status_label.set_valign(Gtk.Align.CENTER)
        self.status_label.set_width_chars(8)
        self.status_label.set_xalign(0)
        self.status_label.add_css_class("dim-label")

        self.add_prefix(self.status_dot)

        status_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=4)
        status_box.set_valign(Gtk.Align.CENTER)
        status_box.append(self.status_label)
        self.add_suffix(status_box)

        actions_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=2)
        actions_box.set_valign(Gtk.Align.CENTER)
        actions_box.add_css_class("service-row-actions")
        self.add_suffix(actions_box)

        self.start_btn = compact_icon_button(
            "media-playback-start-symbolic",
            f"{title} {_('start')}",
            lambda *_: self.run_systemctl("start"),
        )
        actions_box.append(self.start_btn)

        self.stop_btn = compact_icon_button(
            "media-playback-stop-symbolic",
            f"{title} {_('stop')}",
            lambda *_: self.run_systemctl("stop"),
        )
        actions_box.append(self.stop_btn)

        self.restart_btn = compact_icon_button(
            "system-reboot-symbolic",
            f"{title} {_('restart')}",
            lambda *_: self.run_systemctl("restart"),
        )
        actions_box.append(self.restart_btn)

        self.refresh_btn = compact_icon_button(
            "view-refresh-symbolic",
            f"{title} {_('refresh_status')}",
            lambda *_: self.update_status(),
        )
        actions_box.append(self.refresh_btn)

    def run_systemctl(self, action):
        cmd = ["pkexec", "systemctl", action, self.service_name]
        try:
            subprocess.Popen(cmd)
            GLib.timeout_add_seconds(2, self.update_status)
        except Exception as e:
            print(f"Systemctl error ({action}): {e}")

    def update_status(self):
        try:
            result = subprocess.run(
                ['systemctl', 'is-active', self.service_name],
                capture_output=True,
                text=True,
            )
            status = result.stdout.strip()

            enabled_res = subprocess.run(
                ['systemctl', 'is-enabled', self.service_name],
                capture_output=True,
                text=True,
            )
            enabled = enabled_res.returncode == 0

            self.set_subtitle(self.base_subtitle)

            if status == 'active':
                self.status_dot.set_css_classes(["success-dot"])
                self.status_label.set_text(_("active"))
                self.status_label.set_css_classes(["success-text"])
            elif status == 'activating':
                self.status_dot.set_css_classes(["warning-dot"])
                self.status_label.set_text(_("activating"))
                self.status_label.set_css_classes(["warning-text"])
            else:
                self.status_dot.set_css_classes(["error-dot"])
                self.status_label.set_text(_("inactive"))
                self.status_label.set_css_classes(["error-text"])

            if not enabled:
                self.set_subtitle(f"{self.base_subtitle} (" + _("disabled") + ")")

        except Exception:
            self.status_label.set_text(_("error"))
            self.status_dot.set_css_classes(["error-dot"])


class LogView(Gtk.Box):
    _MAX_LOG_CHARS = 400_000  # ~ birkaç bin satır; bellek şişmesini önler

    def __init__(self):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.current_proc = None
        self.service_name = None

        toolbar = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        toolbar.set_margin_start(12)
        toolbar.set_margin_end(12)
        toolbar.set_margin_top(6)
        toolbar.set_margin_bottom(6)

        self.service_selector = Gtk.DropDown.new_from_strings(monitored_service_names())
        self.service_selector.connect("notify::selected-item", self.on_service_changed)
        toolbar.append(self.service_selector)

        spacer = Gtk.Box()
        spacer.set_hexpand(True)
        toolbar.append(spacer)

        clear_btn = Gtk.Button.new_from_icon_name("edit-clear-all-symbolic")
        clear_btn.set_tooltip_text(_("clear"))
        clear_btn.connect("clicked", self.clear_logs)
        toolbar.append(clear_btn)

        self.append(toolbar)

        scrolled = Gtk.ScrolledWindow()
        scrolled.set_vexpand(True)
        scrolled.add_css_class("card")
        scrolled.set_margin_start(12)
        scrolled.set_margin_end(12)
        scrolled.set_margin_bottom(12)

        self.text_view = Gtk.TextView()
        self.text_view.set_editable(False)
        self.text_view.set_monospace(True)
        self.text_view.set_left_margin(10)
        self.text_view.set_top_margin(10)
        self.text_view.set_wrap_mode(Gtk.WrapMode.WORD_CHAR)
        self.buffer = self.text_view.get_buffer()

        scrolled.set_child(self.text_view)
        self.append(scrolled)

        GLib.idle_add(self.on_service_changed, None, None)

    def on_service_changed(self, widget, pspec):
        selected_item = self.service_selector.get_selected_item()
        if not selected_item:
            return

        new_service = selected_item.get_string()
        if new_service == self.service_name:
            return

        self.stop_current_stream()
        self.service_name = new_service
        self.clear_logs()
        self.start_stream(new_service)

    def start_stream(self, service):
        cmd = ["journalctl", "-u", service, "-f", "-n", "50", "--no-hostname"]
        try:
            self.current_proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
            )
            GLib.io_add_watch(self.current_proc.stdout, GLib.IO_IN | GLib.IO_HUP, self.on_logs_ready)
        except Exception as e:
            self.append_text(_("error") + f": Loglar başlatılamadı - {str(e)}\n")

    def on_logs_ready(self, source, condition):
        if condition & GLib.IO_HUP:
            return False

        line = source.readline()
        if line:
            self.append_text(line)
            return True
        return False

    def append_text(self, text):
        end_iter = self.buffer.get_end_iter()
        self.buffer.insert(end_iter, text)

        # Eski satırları budayarak bellek kullanımını sınırla
        char_count = self.buffer.get_char_count()
        if char_count > self._MAX_LOG_CHARS:
            start = self.buffer.get_start_iter()
            trim_at = self.buffer.get_iter_at_offset(char_count - self._MAX_LOG_CHARS)
            # Satır başından kes
            if not trim_at.starts_line():
                trim_at.set_line_offset(0)
            self.buffer.delete(start, trim_at)

        mark = self.buffer.get_insert()
        self.text_view.scroll_to_mark(mark, 0.0, True, 0.5, 1.0)

    def clear_logs(self, btn=None):
        self.buffer.set_text("", 0)

    def stop_current_stream(self):
        if self.current_proc:
            self.current_proc.terminate()
            self.current_proc = None


class ScheduledJobsView(Gtk.Box):
    """Celery Beat görev kataloğu — env'den çözümlenen zamanlamalar."""

    def __init__(self):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.job_rows: list[tuple] = []

        scroll = Gtk.ScrolledWindow()
        scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        scroll.set_vexpand(True)

        content = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
        content.set_margin_top(12)
        content.set_margin_bottom(12)
        content.set_margin_start(12)
        content.set_margin_end(12)

        header_icon = Gtk.Image.new_from_icon_name("alarm-symbolic")
        header_icon.set_pixel_size(40)
        header_icon.set_halign(Gtk.Align.CENTER)
        content.append(header_icon)

        title_label = Gtk.Label(label=_("scheduled_tab"))
        title_label.add_css_class("title-3")
        title_label.set_halign(Gtk.Align.CENTER)
        content.append(title_label)

        desc_label = Gtk.Label(label=_("scheduled_tab_desc"))
        desc_label.add_css_class("dim-label")
        desc_label.set_halign(Gtk.Align.CENTER)
        desc_label.set_wrap(True)
        desc_label.set_justify(Gtk.Justification.CENTER)
        desc_label.set_max_width_chars(52)
        content.append(desc_label)

        hint_label = Gtk.Label(label=_("scheduled_beat_hint"))
        hint_label.add_css_class("caption")
        hint_label.set_halign(Gtk.Align.CENTER)
        hint_label.set_wrap(True)
        hint_label.set_justify(Gtk.Justification.CENTER)
        hint_label.set_max_width_chars(52)
        content.append(hint_label)

        clamp = Adw.Clamp()
        clamp.set_maximum_size(640)
        clamp.set_tightening_threshold(560)

        group = Adw.PreferencesGroup(
            title=_("scheduled_group_title"),
            description=_("scheduled_group_desc"),
        )

        for spec in BEAT_JOBS:
            row = Adw.ActionRow(title=job_title(spec, lang=LANG))
            group.add(row)
            self.job_rows.append((spec, row))

        clamp.set_child(group)
        content.append(clamp)
        scroll.set_child(content)
        self.append(scroll)
        self.refresh()

    def refresh(self):
        values = parse_env_file(DAPHNE_ENV_PATH)
        for spec, row in self.job_rows:
            schedule = format_job_schedule(spec, values, lang=LANG)
            desc = job_description(spec, lang=LANG)
            row.set_subtitle(f"{schedule}\n{spec.task_name}\n{desc}")


class RamisMonitorApp(Adw.Application):
    def __init__(self, **kwargs):
        super().__init__(application_id='com.ramis.ServiceMonitor', **kwargs)
        self.connect('activate', self.on_activate)

    def on_activate(self, app):
        self.window = Adw.ApplicationWindow(application=app)
        self.window.set_title(_("app_title"))
        self.window.set_default_size(560, 820)

        self.load_css()

        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        self.window.set_content(box)

        header = Adw.HeaderBar()

        stack = Adw.ViewStack()
        view_switcher_title = Adw.ViewSwitcherTitle(stack=stack)
        header.set_title_widget(view_switcher_title)

        box.append(header)

        status_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)

        bulk_actions = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=2)
        header.pack_start(bulk_actions)

        start_all_btn = compact_icon_button(
            "media-playback-start-symbolic", _("start_all"), lambda *_: self.run_bulk_action("start")
        )
        bulk_actions.append(start_all_btn)

        stop_all_btn = compact_icon_button(
            "media-playback-stop-symbolic", _("stop_all"), lambda *_: self.run_bulk_action("stop")
        )
        bulk_actions.append(stop_all_btn)

        restart_all_btn = compact_icon_button(
            "system-reboot-symbolic", _("restart_all"), lambda *_: self.run_bulk_action("restart")
        )
        bulk_actions.append(restart_all_btn)

        refresh_all_btn = compact_icon_button(
            "view-refresh-symbolic", _("refresh_all"), lambda *_: self.refresh_all()
        )
        bulk_actions.append(refresh_all_btn)

        status_desc = build_status_description()

        status_scroll = Gtk.ScrolledWindow()
        status_scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        status_scroll.set_vexpand(True)

        status_content = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
        status_content.set_margin_top(12)
        status_content.set_margin_bottom(12)
        status_content.set_margin_start(12)
        status_content.set_margin_end(12)

        header_icon = Gtk.Image.new_from_icon_name("utilities-system-monitor-symbolic")
        header_icon.set_pixel_size(48)
        header_icon.set_halign(Gtk.Align.CENTER)
        header_icon.add_css_class("status-header-icon")
        status_content.append(header_icon)

        title_label = Gtk.Label(label=_("status_page_title"))
        title_label.add_css_class("title-2")
        title_label.set_halign(Gtk.Align.CENTER)
        status_content.append(title_label)

        desc_label = Gtk.Label(label=status_desc)
        desc_label.add_css_class("dim-label")
        desc_label.set_halign(Gtk.Align.CENTER)
        desc_label.set_wrap(True)
        desc_label.set_justify(Gtk.Justification.CENTER)
        desc_label.set_max_width_chars(52)
        status_content.append(desc_label)
        self.status_desc_label = desc_label

        clamp = Adw.Clamp()
        clamp.set_maximum_size(640)
        clamp.set_tightening_threshold(560)

        list_box = Gtk.ListBox()
        list_box.add_css_class("boxed-list")
        clamp.set_child(list_box)

        self.rows = [
            ServiceRow(unit, title, subtitle)
            for unit, title, subtitle in build_monitored_services()
        ]

        for row in self.rows:
            list_box.append(row)

        status_content.append(clamp)
        status_scroll.set_child(status_content)
        status_box.append(status_scroll)

        stack.add_titled_with_icon(status_box, "status", _("status_tab"), "network-transmit-receive-symbolic")

        self.scheduled_view = ScheduledJobsView()
        stack.add_titled_with_icon(
            self.scheduled_view,
            "scheduled",
            _("scheduled_tab"),
            "alarm-symbolic",
        )

        self.log_view = LogView()
        stack.add_titled_with_icon(self.log_view, "logs", _("logs_tab"), "view-list-bullet-symbolic")

        box.append(stack)

        footer = Gtk.Label(label=_("footer"))
        footer.add_css_class("dim-label")
        footer.set_margin_bottom(12)
        box.append(footer)

        self.window.present()

        self.refresh_all()
        GLib.timeout_add_seconds(10, self.refresh_all)

    def run_bulk_action(self, action):
        cmd = ["pkexec", "systemctl", action] + monitored_service_names()
        try:
            subprocess.Popen(cmd)
            GLib.timeout_add_seconds(3, self.refresh_all)
        except Exception as e:
            print(f"Bulk action error ({action}): {e}")

    def load_css(self):
        css = """
        .status-header-icon {
            opacity: 0.85;
        }
        .service-row-actions button,
        .service-action-btn {
            min-width: 28px;
            min-height: 28px;
            padding: 2px;
        }
        .success-dot { color: #26a269; }
        .error-dot { color: #c01c28; }
        .warning-dot { color: #e66100; }
        .success-text { color: #26a269; font-weight: bold; }
        .error-text { color: #c01c28; font-weight: bold; }
        .warning-text { color: #e66100; font-weight: bold; }
        .card { background-color: alpha(@window_bg_color, 0.5); border-radius: 8px; border: 1px solid @borders; }
        """
        provider = Gtk.CssProvider()
        provider.load_from_data(css, len(css))
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )

    def refresh_all(self):
        if hasattr(self, "status_desc_label"):
            self.status_desc_label.set_text(build_status_description())
        if hasattr(self, "scheduled_view"):
            self.scheduled_view.refresh()
        for row in self.rows:
            row.update_status()
        return True


if __name__ == "__main__":
    app = RamisMonitorApp()
    app.run(None)
