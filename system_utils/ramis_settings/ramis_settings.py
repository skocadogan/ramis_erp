#!/usr/bin/env python3
"""Ramis ERP — /etc/ramis ortam ayarları GTK4 yöneticisi."""

from __future__ import annotations

import base64
import json
import os
import subprocess
import sys

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")

from gi.repository import Adw, GLib, Gdk, Gtk

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_SYSTEM_UTILS_DIR = os.path.dirname(_SCRIPT_DIR)
for _path in (_SCRIPT_DIR, _SYSTEM_UTILS_DIR):
    if _path not in sys.path:
        sys.path.insert(0, _path)

from beat_jobs_catalog import BEAT_JOBS, format_job_schedule, job_description, job_title  # noqa: E402

from env_io import EnvDocument, merge_values, parse_env_text
from settings_schema import (
    BACKEND_CORE_FIELDS,
    BACKEND_FIELDS,
    BACKEND_GROUP_DESCRIPTIONS,
    BACKEND_GROUPS,
    BEAT_FIELDS,
    BEAT_GROUPS,
    FRONTEND_FIELDS,
    FRONTEND_GROUPS,
    FieldSpec,
    collect_restart_units,
    daphne_units,
    uvicorn_units,
    env_keys_for_field,
    format_time_of_day,
    parse_time_of_day,
)

BACKEND_ENV = os.environ.get("RAMIS_SETTINGS_BACKEND_ENV", "/etc/ramis/backend.env")
FRONTEND_ENV = os.environ.get("RAMIS_SETTINGS_FRONTEND_ENV", "/etc/ramis/frontend.env")
PRIV_HELPER = os.path.join(_SCRIPT_DIR, "run_privileged.sh")


def get_lang() -> str:
    try:
        if os.path.exists("/etc/ramis/lang"):
            with open("/etc/ramis/lang", "r", encoding="utf-8") as handle:
                return handle.read().strip() or "tr"
    except OSError:
        pass
    return "tr"


LANG = get_lang()

TRANSLATIONS = {
    "tr": {
        "app_title": "Ramis Ayar Yöneticisi",
        "backend_tab": "Backend",
        "frontend_tab": "Frontend",
        "backend_tab_desc": "Django API, PostgreSQL, Redis ve WebSocket ayarları",
        "scheduled_tab": "Zamanlanmış görevler",
        "scheduled_tab_desc": "Gece taramaları, yazıcı kontrolü, masa rezervasyonu hatırlatmaları",
        "scheduled_jobs_group": "Görev listesi",
        "scheduled_jobs_group_desc": "Zamanı gelmeden manuel çalıştırma — ramis-worker-maintenance kuyruğu",
        "scheduled_run": "Çalıştır",
        "scheduled_run_confirm_heading": "Görevi şimdi çalıştır?",
        "scheduled_run_confirm_body": "{title}\n\n{schedule}\n\nGörev Celery kuyruğuna eklenir; worker işler.",
        "scheduled_run_now": "Kuyruğa ekle",
        "scheduled_run_success": "Görev kuyruğa eklendi",
        "scheduled_run_error": "Görev başlatılamadı",
        "frontend_tab_desc": "Next.js istemci ve NEXT_PUBLIC_* değişkenleri",
        "services_tab": "Servisler",
        "save": "Kaydet",
        "reload": "Yeniden yükle",
        "loading": "Ayarlar yükleniyor…",
        "load_error": "Ayar dosyaları okunamadı",
        "save_success": "Ayarlar kaydedildi",
        "save_error": "Kaydetme başarısız",
        "unsaved": "Kaydedilmemiş değişiklikler var",
        "restart_heading": "Servisleri yeniden başlat?",
        "restart_body": "Değişikliklerin etkili olması için şu servisler önerilir:\n\n{units}",
        "restart_runtime_note": "\n\nAyrıca runtime-config.json senkronu yapılacak.",
        "restart_beat_sync_note": "\n\nZamanlanmış arka plan işlerinin yeni saatleri sisteme uygulanacak.",
        "restart_printing_worker_sync_note": "\n\nPrinting ve PDF export worker birimlerindeki --concurrency değerleri backend.env ile eşitlenecek.",
        "time_input_label": "Saat (SS:DD)",
        "restart_now": "Yeniden başlat",
        "restart_later": "Sonra",
        "cancel": "Vazgeç",
        "validation_error": "Doğrulama hatası",
        "daphne_invalid": "DAPHNE_INSTANCES 1 ile 4 arasında olmalıdır",
        "int_invalid": "{key} geçerli bir tam sayı olmalıdır",
        "int_range_invalid": "{key} {min_val} ile {max_val} arasında olmalıdır",
        "time_invalid": "Geçerli saat girin (SS:DD, örn. 03:00 veya 3:15)",
        "api_url_invalid": "NEXT_PUBLIC_API_URL /api/v1 ile bitmelidir",
        "extra_backend_group": "Diğer backend anahtarları",
        "extra_frontend_group": "Diğer frontend anahtarları",
        "extra_hint": "Arayüzde tanımlı olmayan anahtarlar",
        "footer": "Ramis Ayar Yöneticisi — /etc/ramis/backend.env & frontend.env",
        "service_restart": "Yeniden başlat",
        "service_status": "Durum",
        "service_loading": "Yükleniyor…",
        "service_active": "Aktif",
        "service_activating": "Başlatılıyor…",
        "service_inactive": "Pasif",
        "service_disabled": "Devre dışı",
        "service_error": "Hata",
        "service_unknown": "Bilinmiyor",
        "all_restart": "Önerilenleri yeniden başlat",
        "auth_cancelled": "Yetkilendirme iptal edildi",
        "access_denied": "Erişim engellendi — yönetici parolası gerekli",
        "apply_error": "Ayarlar kaydedildi ancak servisler uygulanamadı",
        "save_apply_heading": "Servisleri yeniden başlat?",
        "save_apply_body": "Değişikliklerin etkili olması için şu servisler önerilir:\n\n{units}{notes}",
        "save_only": "Sadece kaydet",
        "save_and_apply": "Kaydet ve uygula",
        "no_changes": "Kaydedilecek değişiklik yok",
        "pkexec_required": "Üretim ortamında pkexec gerekli (/etc/ramis)",
        "unsaved_banner": "Kaydedilmemiş değişiklikler var — Kaydet düğmesine basın",
        "status_ready": "Hazır",
        "status_unsaved": "Kaydedilmemiş değişiklikler",
        "sidebar_brand": "Ramis ERP",
        "services_desc": "Değişikliklerden sonra servisleri buradan yeniden başlatabilirsiniz",
        "services_restart_all_title": "Toplu yeniden başlat",
        "services_restart_all_desc": "Önerilen tüm servisleri tek seferde yeniden başlatır",
        "services_list_title": "Sistem servisleri",
        "services_list_desc": "Anlık durum ve birim bazında yeniden başlatma",
    },
    "en": {
        "app_title": "Ramis Settings Manager",
        "backend_tab": "Backend",
        "frontend_tab": "Frontend",
        "backend_tab_desc": "Django API, PostgreSQL, Redis and WebSocket settings",
        "scheduled_tab": "Scheduled jobs",
        "scheduled_tab_desc": "Nightly scans, printer checks, reservation reminders",
        "scheduled_jobs_group": "Job list",
        "scheduled_jobs_group_desc": "Run manually before schedule — ramis-worker-maintenance queue",
        "scheduled_run": "Run",
        "scheduled_run_confirm_heading": "Run this job now?",
        "scheduled_run_confirm_body": "{title}\n\n{schedule}\n\nThe task will be queued for the Celery worker.",
        "scheduled_run_now": "Queue now",
        "scheduled_run_success": "Task queued",
        "scheduled_run_error": "Could not queue task",
        "frontend_tab_desc": "Next.js client and NEXT_PUBLIC_* variables",
        "services_tab": "Services",
        "save": "Save",
        "reload": "Reload",
        "loading": "Loading settings…",
        "load_error": "Could not read env files",
        "save_success": "Settings saved",
        "save_error": "Save failed",
        "unsaved": "You have unsaved changes",
        "restart_heading": "Restart services?",
        "restart_body": "Recommended services for changes to take effect:\n\n{units}",
        "restart_runtime_note": "\n\nruntime-config.json will also be synced.",
        "restart_beat_sync_note": "\n\nThe new schedule for background jobs will be applied to the system.",
        "restart_printing_worker_sync_note": "\n\nThe printing and PDF export worker unit --concurrency values will be synced from backend.env.",
        "time_input_label": "Time (HH:MM)",
        "restart_now": "Restart now",
        "restart_later": "Later",
        "cancel": "Cancel",
        "validation_error": "Validation error",
        "daphne_invalid": "DAPHNE_INSTANCES must be between 1 and 4",
        "int_invalid": "{key} must be a valid integer",
        "int_range_invalid": "{key} must be between {min_val} and {max_val}",
        "time_invalid": "Enter a valid time (HH:MM, e.g. 03:00 or 3:15)",
        "api_url_invalid": "NEXT_PUBLIC_API_URL must end with /api/v1",
        "extra_backend_group": "Other backend keys",
        "extra_frontend_group": "Other frontend keys",
        "extra_hint": "Keys not listed in the form",
        "footer": "Ramis Settings — /etc/ramis/backend.env & frontend.env",
        "service_restart": "Restart",
        "service_status": "Status",
        "service_loading": "Loading…",
        "service_active": "Active",
        "service_activating": "Activating…",
        "service_inactive": "Inactive",
        "service_disabled": "Disabled",
        "service_error": "Error",
        "service_unknown": "Unknown",
        "all_restart": "Restart recommended",
        "auth_cancelled": "Authorization cancelled",
        "access_denied": "Access denied — administrator password required",
        "apply_error": "Settings saved but services could not be applied",
        "save_apply_heading": "Restart services?",
        "save_apply_body": "Recommended services for changes to take effect:\n\n{units}{notes}",
        "save_only": "Save only",
        "save_and_apply": "Save and apply",
        "no_changes": "No changes to save",
        "pkexec_required": "pkexec required in production (/etc/ramis)",
        "unsaved_banner": "You have unsaved changes — press Save",
        "status_ready": "Ready",
        "status_unsaved": "Unsaved changes",
        "sidebar_brand": "Ramis ERP",
        "services_desc": "Restart services here after configuration changes",
        "services_restart_all_title": "Restart all recommended",
        "services_restart_all_desc": "Restarts all recommended services at once",
        "services_list_title": "System services",
        "services_list_desc": "Live status and per-unit restart",
    },
}

SERVICE_LABELS = {
    "ramis-daphne.service": ("Backend Daphne :8000 (WS)", "Backend Daphne :8000 (WS)"),
    "ramis-uvicorn.service": ("Backend Uvicorn :9000 (HTTP)", "Backend Uvicorn :9000 (HTTP)"),
    "ramis-worker.service": ("Celery worker (printing)", "Celery worker (printing)"),
    "ramis-worker-maintenance.service": ("Celery worker (maintenance)", "Celery worker (maintenance)"),
    "ramis-worker-broadcast.service": ("Celery worker (broadcast)", "Celery worker (broadcast)"),
    "ramis-beat.service": ("Zamanlanmış görevler", "Scheduled jobs"),
    "ramis-frontend.service": ("Next.js frontend", "Next.js frontend"),
    "nginx.service": ("Nginx", "Nginx"),
}


def _(key: str) -> str:
    return TRANSLATIONS[LANG].get(key, key)


def _use_pkexec() -> bool:
    flag = os.environ.get("RAMIS_SETTINGS_NO_PKEXEC", "").lower()
    if flag in ("1", "true", "yes"):
        return False
    if os.path.isdir("/etc/ramis"):
        return True
    return False


def _can_read_env_files() -> bool:
    return (
        os.path.isfile(BACKEND_ENV)
        and os.path.isfile(FRONTEND_ENV)
        and os.access(BACKEND_ENV, os.R_OK)
        and os.access(FRONTEND_ENV, os.R_OK)
    )


def _can_write_env_files() -> bool:
    return (
        os.path.isfile(BACKEND_ENV)
        and os.path.isfile(FRONTEND_ENV)
        and os.access(BACKEND_ENV, os.W_OK)
        and os.access(FRONTEND_ENV, os.W_OK)
    )


def _payload_needs_pkexec(payload: dict) -> bool:
    action = payload.get("action")
    if not _use_pkexec():
        return False
    if action == "read":
        return not _can_read_env_files()
    if action == "write":
        if payload.get("apply"):
            return True
        return not _can_write_env_files()
    return True


def _parse_privileged_output(proc: subprocess.CompletedProcess) -> dict:
    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()

    for blob in (stdout, stderr):
        if not blob:
            continue
        try:
            return json.loads(blob)
        except json.JSONDecodeError:
            for line in reversed(blob.splitlines()):
                line = line.strip()
                if line.startswith("{") and line.endswith("}"):
                    try:
                        return json.loads(line)
                    except json.JSONDecodeError:
                        continue

    combined = f"{stderr}\n{stdout}".lower()
    auth_markers = (
        "access denied",
        "erişim engellendi",
        "not authorized",
        "authentication failed",
        "authorization failed",
        "yetki",
    )
    if proc.returncode in (126, 127) or any(marker in combined for marker in auth_markers):
        return {"ok": False, "error": "auth", "message": _("access_denied")}

    if proc.returncode != 0:
        return {
            "ok": False,
            "error": "helper_failed",
            "message": stderr or stdout or _("load_error"),
        }

    return {"ok": False, "error": "bad_response", "message": stderr or stdout or _("load_error")}


def _invoke_privileged(payload: dict) -> dict:
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()
    if _payload_needs_pkexec(payload):
        cmd = ["pkexec", PRIV_HELPER, encoded]
    else:
        cmd = [PRIV_HELPER, encoded]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "timeout", "message": "İşlem zaman aşımı"}
    except FileNotFoundError:
        return {"ok": False, "error": "helper_missing", "message": PRIV_HELPER}

    return _parse_privileged_output(proc)


def _load_env_local(path: str) -> str:
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8-sig") as handle:
            return handle.read()
    return ""


def _read_env_files() -> dict:
    if not _payload_needs_pkexec({"action": "read"}):
        return {
            "ok": True,
            "backend": _load_env_local(BACKEND_ENV),
            "frontend": _load_env_local(FRONTEND_ENV),
            "backend_path": BACKEND_ENV,
            "frontend_path": FRONTEND_ENV,
        }
    return _invoke_privileged({"action": "read"})


def _field_label(spec: FieldSpec) -> str:
    return spec.label_tr if LANG == "tr" else spec.label_en


def _group_description(group_id: str) -> str | None:
    desc = BACKEND_GROUP_DESCRIPTIONS.get(group_id)
    if not desc:
        return None
    return desc[0] if LANG == "tr" else desc[1]


def _show_env_key(spec: FieldSpec) -> bool:
    """Son kullanıcı gruplarında teknik env anahtarı gösterme."""
    return spec.group != "beat"


def _group_label(groups: dict[str, tuple[str, str]], group_id: str) -> str:
    pair = groups.get(group_id, (group_id, group_id))
    return pair[0] if LANG == "tr" else pair[1]


class FieldBinding:
    def __init__(self, spec: FieldSpec, widget: Gtk.Widget, getter, setter):
        self.spec = spec
        self.widget = widget
        self.getter = getter
        self.setter = setter

    def load(self, values: dict[str, str]) -> None:
        raw = values.get(self.spec.key, "")
        if not raw and self.spec.default:
            raw = self.spec.default
        self.setter(raw)

    def collect(self) -> tuple[str, str]:
        return self.spec.key, self.getter()

    def collect_entries(self) -> list[tuple[str, str]]:
        key, value = self.collect()
        return [(key, value)]


class TimeFieldBinding:
    """Tek SS:DD alanı → hour/minute env anahtarları."""

    def __init__(self, spec: FieldSpec, entry: Gtk.Entry, getter, setter):
        self.spec = spec
        self.widget = entry
        self.getter = getter
        self.setter = setter

    def load(self, values: dict[str, str]) -> None:
        default_parsed = parse_time_of_day(self.spec.default_time or "0:00")
        default_hour, default_minute = default_parsed if default_parsed else (0, 0)
        try:
            hour = int(values.get(self.spec.hour_key, str(default_hour)))
            minute = int(values.get(self.spec.minute_key, str(default_minute)))
        except ValueError:
            hour, minute = default_hour, default_minute
        hour = max(0, min(23, hour))
        minute = max(0, min(59, minute))
        self.setter(format_time_of_day(hour, minute))

    def collect(self) -> tuple[str, str]:
        raise NotImplementedError

    def collect_entries(self) -> list[tuple[str, str]]:
        parsed = parse_time_of_day(self.getter())
        if parsed is None:
            return [
                (self.spec.hour_key, self.getter()),
                (self.spec.minute_key, ""),
            ]
        hour, minute = parsed
        return [
            (self.spec.hour_key, str(hour)),
            (self.spec.minute_key, str(minute)),
        ]


class ServiceStatusRow(Adw.ActionRow):
    """systemd birimi — durum simgesi + yeniden başlat."""

    _STATUS_ICONS = {
        "loading": ("content-loading-symbolic", "service-status-loading"),
        "active": ("emblem-ok-symbolic", "service-status-active"),
        "activating": ("process-working-symbolic", "service-status-activating"),
        "inactive": ("process-stop-symbolic", "service-status-inactive"),
        "failed": ("dialog-error-symbolic", "service-status-inactive"),
        "disabled": ("changes-prevent-symbolic", "service-status-disabled"),
        "unknown": ("help-about-symbolic", "service-status-unknown"),
    }

    def __init__(self, unit: str, title: str, on_restart):
        super().__init__(title=title, subtitle=unit)
        self.unit = unit
        self.base_subtitle = unit
        self.on_restart = on_restart

        self.status_icon = Gtk.Image.new_from_icon_name("content-loading-symbolic")
        self.status_icon.set_pixel_size(20)
        self.status_icon.set_valign(Gtk.Align.CENTER)
        self.status_icon.set_margin_end(10)
        self.add_prefix(self.status_icon)

        self.status_label = Gtk.Label(label=_("service_loading"))
        self.status_label.set_valign(Gtk.Align.CENTER)
        self.status_label.set_xalign(0)
        self.status_label.add_css_class("service-status-label")

        status_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        status_box.set_valign(Gtk.Align.CENTER)
        status_box.append(self.status_label)
        self.add_suffix(status_box)

        restart_btn = Gtk.Button.new_from_icon_name("system-reboot-symbolic")
        restart_btn.set_tooltip_text(_("service_restart"))
        restart_btn.add_css_class("flat")
        restart_btn.connect("clicked", lambda *_: on_restart(unit))
        self.add_suffix(restart_btn)

        self.set_status("loading")

    def set_status(self, state: str, enabled: bool = True) -> None:
        icon_name, css_class = self._STATUS_ICONS.get(state, self._STATUS_ICONS["unknown"])
        self.status_icon.set_from_icon_name(icon_name)
        self.status_icon.set_css_classes([css_class])

        label_key = {
            "loading": "service_loading",
            "active": "service_active",
            "activating": "service_activating",
            "inactive": "service_inactive",
            "failed": "service_inactive",
            "disabled": "service_disabled",
            "unknown": "service_unknown",
        }.get(state, "service_unknown")
        self.status_label.set_text(_(label_key))
        self.status_label.set_css_classes(["service-status-label", "service-status-pill", css_class])

        subtitle = self.base_subtitle
        if not enabled:
            subtitle = f"{self.base_subtitle} ({_('service_disabled')})"
        self.set_subtitle(subtitle)

    def refresh(self) -> None:
        try:
            active_proc = subprocess.run(
                ["systemctl", "is-active", self.unit],
                capture_output=True,
                text=True,
            )
            status = active_proc.stdout.strip() or "unknown"

            enabled_proc = subprocess.run(
                ["systemctl", "is-enabled", self.unit],
                capture_output=True,
                text=True,
            )
            enabled = enabled_proc.returncode == 0

            if not enabled:
                self.set_status("disabled", enabled=False)
            elif status == "active":
                self.set_status("active", enabled=True)
            elif status == "activating":
                self.set_status("activating", enabled=True)
            elif status in ("failed", "error"):
                self.set_status("failed", enabled=True)
            elif status == "inactive":
                self.set_status("inactive", enabled=True)
            else:
                self.set_status("unknown", enabled=enabled)
        except OSError:
            self.set_status("unknown")


class RamisSettingsApp(Adw.Application):
    def __init__(self, **kwargs):
        super().__init__(application_id="com.ramis.SettingsManager", **kwargs)
        self.connect("activate", self.on_activate)
        self.backend_doc = EnvDocument(path=BACKEND_ENV)
        self.frontend_doc = EnvDocument(path=FRONTEND_ENV)
        self.backend_before: dict[str, str] = {}
        self.frontend_before: dict[str, str] = {}
        self.backend_bindings: list[FieldBinding] = []
        self.beat_bindings: list[FieldBinding] = []
        self.beat_job_rows: list[tuple] = []
        self.frontend_bindings: list[FieldBinding] = []
        self.extra_backend_rows: dict[str, Adw.EntryRow] = {}
        self.extra_frontend_rows: dict[str, Adw.EntryRow] = {}
        self.service_rows: dict[str, ServiceStatusRow] = {}
        self.dirty = False
        self.toast_overlay: Adw.ToastOverlay | None = None
        self.spinner: Gtk.Spinner | None = None
        self._extra_group_backend: Adw.PreferencesGroup | None = None
        self._extra_group_frontend: Adw.PreferencesGroup | None = None
        self._known_backend_keys: set[str] = set()
        self._known_frontend_keys: set[str] = set()
        self.view_stack: Adw.ViewStack | None = None
        self.sidebar: Gtk.ListBox | None = None
        self.nav_rows: dict[str, Gtk.ListBoxRow] = {}
        self.unsaved_banner: Adw.Banner | None = None
        self.status_label: Gtk.Label | None = None

    def on_activate(self, app):
        self.window = Adw.ApplicationWindow(application=app)
        self.window.set_title(_("app_title"))
        self.window.set_default_size(1040, 780)
        self.window.set_size_request(880, 640)

        self.toast_overlay = Adw.ToastOverlay()
        self.window.set_content(self.toast_overlay)

        toolbar_view = Adw.ToolbarView()
        self.toast_overlay.set_child(toolbar_view)

        header = Adw.HeaderBar()
        header.set_show_title(False)

        self.spinner = Gtk.Spinner()
        self.spinner.set_margin_end(4)
        header.pack_end(self.spinner)

        reload_btn = Gtk.Button.new_from_icon_name("view-refresh-symbolic")
        reload_btn.set_tooltip_text(_("reload"))
        reload_btn.add_css_class("flat")
        reload_btn.connect("clicked", lambda *_: self.load_settings())
        header.pack_end(reload_btn)

        save_btn = Gtk.Button(label=_("save"))
        save_btn.add_css_class("suggested-action")
        save_btn.connect("clicked", self.on_save_clicked)
        header.pack_end(save_btn)

        toolbar_view.add_top_bar(header)

        self.unsaved_banner = Adw.Banner(title=_("unsaved_banner"))
        self.unsaved_banner.set_button_label(_("save"))
        self.unsaved_banner.connect("button-clicked", self.on_save_clicked)
        toolbar_view.add_top_bar(self.unsaved_banner)

        self.backend_page = self._build_env_page(
            BACKEND_CORE_FIELDS,
            BACKEND_GROUPS,
            self.backend_bindings,
            is_backend=True,
            include_extra=True,
        )
        self.beat_page = self._build_beat_tab_page()
        self.frontend_page = self._build_env_page(
            FRONTEND_FIELDS,
            FRONTEND_GROUPS,
            self.frontend_bindings,
            is_backend=False,
            include_extra=True,
        )
        self.services_page = self._build_services_page()

        self.view_stack = Adw.ViewStack()
        self.view_stack.set_vexpand(True)
        self.view_stack.connect("notify::visible-child-name", self._on_stack_page_changed)

        sidebar_panel = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        sidebar_panel.add_css_class("sidebar-panel")
        sidebar_panel.set_size_request(240, -1)

        brand_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2)
        brand_box.add_css_class("sidebar-header")
        brand_title = Gtk.Label(label=_("sidebar_brand"), xalign=0.0)
        brand_title.add_css_class("sidebar-brand")
        brand_box.append(brand_title)
        brand_sub = Gtk.Label(label=_("app_title"), xalign=0.0)
        brand_sub.add_css_class("sidebar-tagline")
        brand_box.append(brand_sub)
        sidebar_panel.append(brand_box)

        self.sidebar = Gtk.ListBox()
        self.sidebar.add_css_class("navigation-sidebar")
        self.sidebar.set_selection_mode(Gtk.SelectionMode.SINGLE)
        sidebar_scroll = Gtk.ScrolledWindow()
        sidebar_scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        sidebar_scroll.set_vexpand(True)
        sidebar_scroll.set_child(self.sidebar)
        sidebar_panel.append(sidebar_scroll)

        nav_pages = (
            ("backend", _("backend_tab"), _("backend_tab_desc"), BACKEND_ENV, "application-x-executable-symbolic", self.backend_page),
            ("scheduled", _("scheduled_tab"), _("scheduled_tab_desc"), BACKEND_ENV, "alarm-symbolic", self.beat_page),
            ("frontend", _("frontend_tab"), _("frontend_tab_desc"), FRONTEND_ENV, "applications-internet-symbolic", self.frontend_page),
            ("services", _("services_tab"), _("services_desc"), "", "system-run-symbolic", self.services_page),
        )
        for page_id, title, description, env_path, icon_name, content in nav_pages:
            shell = self._wrap_page_shell(title, description, env_path, content)
            self.view_stack.add_titled(shell, page_id, title)
            self._add_sidebar_row(page_id, title, icon_name)

        split = Adw.NavigationSplitView()
        sidebar_page = Adw.NavigationPage.new(sidebar_panel, "Sidebar")
        content_page = Adw.NavigationPage.new(self.view_stack, "Content")
        split.set_sidebar(sidebar_page)
        split.set_content(content_page)
        split.set_vexpand(True)

        content_root = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        content_root.set_vexpand(True)
        content_root.append(split)

        self.status_label = Gtk.Label(label=_("status_ready"), xalign=0.0)
        self.status_label.add_css_class("settings-statusbar")
        content_root.append(self.status_label)

        toolbar_view.set_content(content_root)

        first_row = self.sidebar.get_row_at_index(0)
        if first_row:
            self.sidebar.select_row(first_row)
            self.view_stack.set_visible_child_name("backend")

        self.load_css()
        self.load_settings()
        self.window.present()

    def load_css(self):
        css_path = os.path.join(_SCRIPT_DIR, "settings.css")
        provider = Gtk.CssProvider()
        try:
            provider.load_from_path(css_path)
        except GLib.Error:
            provider.load_from_data(b".settings-hero { padding: 24px; }")
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
        )

    def _wrap_page_shell(
        self,
        title: str,
        description: str,
        env_path: str,
        content: Gtk.Widget,
    ) -> Gtk.Widget:
        outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        outer.set_vexpand(True)

        hero = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        hero.add_css_class("settings-hero")

        title_label = Gtk.Label(label=title, xalign=0.0)
        title_label.add_css_class("settings-hero-title")
        hero.append(title_label)

        if description:
            desc_label = Gtk.Label(label=description, xalign=0.0, wrap=True)
            desc_label.add_css_class("settings-hero-desc")
            hero.append(desc_label)

        if env_path:
            chip = Gtk.Label(label=env_path, xalign=0.0)
            chip.add_css_class("settings-env-chip")
            chip.set_selectable(True)
            hero.append(chip)

        outer.append(hero)

        scroll = Gtk.ScrolledWindow()
        scroll.add_css_class("settings-scroll")
        scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        scroll.set_vexpand(True)

        clamp = Adw.Clamp(maximum_size=820)
        clamp.add_css_class("settings-clamp")
        clamp.set_child(content)
        scroll.set_child(clamp)
        outer.append(scroll)
        return outer

    def _add_sidebar_row(self, page_id: str, title: str, icon_name: str) -> None:
        row = Adw.ActionRow(title=title)
        row.set_activatable(True)
        icon = Gtk.Image.new_from_icon_name(icon_name)
        icon.set_pixel_size(18)
        row.add_prefix(icon)
        row.connect("activated", lambda *_args, pid=page_id: self._navigate_to(pid))
        self.sidebar.append(row)
        self.nav_rows[page_id] = row

    def _navigate_to(self, page_id: str) -> None:
        if self.view_stack:
            self.view_stack.set_visible_child_name(page_id)

    def _on_stack_page_changed(self, stack: Adw.ViewStack, _pspec) -> None:
        page_id = stack.get_visible_child_name()
        if not page_id or not self.sidebar:
            return
        row = self.nav_rows.get(page_id)
        if row:
            self.sidebar.select_row(row)

    def _update_dirty_state(self) -> None:
        if self.unsaved_banner:
            self.unsaved_banner.set_revealed(self.dirty)
        if self.status_label:
            if self.dirty:
                self.status_label.set_label(_("status_unsaved"))
                self.status_label.set_css_classes(["settings-statusbar", "settings-statusbar-dirty"])
            else:
                self.status_label.set_label(_("status_ready"))
                self.status_label.set_css_classes(["settings-statusbar"])

    def _build_env_page(
        self,
        fields: tuple[FieldSpec, ...],
        groups: dict[str, tuple[str, str]],
        bindings: list[FieldBinding],
        is_backend: bool,
        include_extra: bool = True,
    ) -> Gtk.Widget:
        page = Adw.PreferencesPage()
        grouped: dict[str, list[FieldSpec]] = {}
        known_keys: set[str] = set()
        for spec in fields:
            grouped.setdefault(spec.group, []).append(spec)
            known_keys.update(env_keys_for_field(spec))

        for group_id in groups:
            specs = grouped.get(group_id, [])
            if not specs:
                continue
            group_desc = _group_description(group_id)
            group_title = _group_label(groups, group_id)
            group = Adw.PreferencesGroup(
                title=group_title if group_title else None,
                description=group_desc,
            )
            page.add(group)
            for spec in specs:
                row, binding = self._make_field_row(spec)
                group.add(row)
                bindings.append(binding)

        if include_extra:
            if is_backend:
                for spec in BEAT_FIELDS:
                    known_keys.update(env_keys_for_field(spec))
            extra_group = Adw.PreferencesGroup(
                title=_("extra_backend_group") if is_backend else _("extra_frontend_group"),
                description=_("extra_hint"),
            )
            page.add(extra_group)
            if is_backend:
                self._extra_group_backend = extra_group
                self._known_backend_keys = known_keys
            else:
                self._extra_group_frontend = extra_group
                self._known_frontend_keys = known_keys
        return page

    def _field_subtitle(self, spec: FieldSpec, hint: str) -> str | None:
        parts: list[str] = []
        if hint:
            parts.append(hint)
        if _show_env_key(spec):
            parts.append(spec.key)
        if not parts:
            return None
        return "\n".join(parts)

    def _make_field_row(self, spec: FieldSpec) -> tuple[Gtk.Widget, FieldBinding | TimeFieldBinding]:
        hint = spec.hint_tr if LANG == "tr" else spec.hint_en

        if spec.field_type == "bool":
            row = Adw.SwitchRow(title=_field_label(spec), subtitle=hint or None)

            def getter() -> str:
                return "true" if row.get_active() else "false"

            def setter(value: str) -> None:
                row.set_active(str(value).lower() in ("1", "true", "yes"))

            row.connect("notify::active", self._mark_dirty)
            return row, FieldBinding(spec, row, getter, setter)

        if spec.field_type == "time":
            return self._make_time_field_row(spec, hint)

        subtitle = self._field_subtitle(spec, hint)
        if spec.field_type == "password":
            row = Adw.PasswordEntryRow(title=_field_label(spec))
            if hasattr(row, "set_show_peek_icon"):
                row.set_show_peek_icon(True)
        else:
            row = Adw.EntryRow(title=_field_label(spec))

        row.add_css_class("settings-entry-row")
        if subtitle:
            if hasattr(row, "set_subtitle"):
                row.set_subtitle(subtitle)
            else:
                row.set_tooltip_text(subtitle)

        def getter() -> str:
            return row.get_text().strip()

        def setter(value: str) -> None:
            row.set_text(value)

        row.connect("changed", self._mark_dirty)
        return row, FieldBinding(spec, row, getter, setter)

    def _build_beat_tab_page(self) -> Gtk.Widget:
        page = Adw.PreferencesPage()
        page.add(self._build_scheduled_jobs_group())

        grouped: dict[str, list[FieldSpec]] = {}
        for spec in BEAT_FIELDS:
            grouped.setdefault(spec.group, []).append(spec)

        for group_id in BEAT_GROUPS:
            specs = grouped.get(group_id, [])
            if not specs:
                continue
            group_desc = _group_description(group_id)
            group_title = _group_label(BEAT_GROUPS, group_id)
            group = Adw.PreferencesGroup(
                title=group_title if group_title else None,
                description=group_desc,
            )
            page.add(group)
            for spec in specs:
                row, binding = self._make_field_row(spec)
                group.add(row)
                self.beat_bindings.append(binding)
        return page

    def _build_scheduled_jobs_group(self) -> Adw.PreferencesGroup:
        group = Adw.PreferencesGroup(
            title=_("scheduled_jobs_group"),
            description=_("scheduled_jobs_group_desc"),
        )
        self.beat_job_rows = []
        for spec in BEAT_JOBS:
            row = Adw.ActionRow(title=job_title(spec, lang=LANG))
            run_btn = Gtk.Button(label=_("scheduled_run"))
            run_btn.add_css_class("suggested-action")
            run_btn.connect("clicked", lambda *_args, job=spec: self._confirm_run_beat_job(job))
            row.add_suffix(run_btn)
            group.add(row)
            self.beat_job_rows.append((spec, row))
        self._refresh_beat_job_rows()
        return group

    def _refresh_beat_job_rows(self) -> None:
        values = self.backend_before or {}
        for spec, row in self.beat_job_rows:
            schedule = format_job_schedule(spec, values, lang=LANG)
            desc = job_description(spec, lang=LANG)
            row.set_subtitle(f"{schedule}\n{desc}")

    def _confirm_run_beat_job(self, spec) -> None:
        values = self.backend_before or {}
        schedule = format_job_schedule(spec, values, lang=LANG)
        title = job_title(spec, lang=LANG)
        dialog = Adw.MessageDialog(
            transient_for=self.window,
            heading=_("scheduled_run_confirm_heading"),
            body=_("scheduled_run_confirm_body").format(title=title, schedule=schedule),
        )
        dialog.add_response("cancel", _("cancel"))
        dialog.add_response("run", _("scheduled_run_now"))
        dialog.set_response_appearance("run", Adw.ResponseAppearance.SUGGESTED)
        dialog.connect(
            "response",
            lambda d, response, job=spec: response == "run" and self._dispatch_beat_job(job),
        )
        dialog.present()

    def _dispatch_beat_job(self, spec) -> None:
        self._set_busy(True)
        result = _invoke_privileged({"action": "run_beat_task", "beat_key": spec.beat_key})
        self._set_busy(False)
        if result.get("ok"):
            message = result.get("message") or _("scheduled_run_success")
            self.toast(message)
            return
        self.toast(result.get("message") or _("scheduled_run_error"))

    def _make_time_field_row(
        self,
        spec: FieldSpec,
        hint: str,
    ) -> tuple[Gtk.Widget, TimeFieldBinding]:
        subtitle = hint or _("time_input_label")
        row = Adw.EntryRow(title=_field_label(spec))
        if hasattr(row, "set_subtitle"):
            row.set_subtitle(subtitle)
        else:
            row.set_tooltip_text(subtitle)
        row.add_css_class("settings-entry-row")
        row.add_css_class("settings-time-row")
        if hasattr(row, "set_placeholder_text"):
            row.set_placeholder_text(spec.default_time or "03:00")

        def getter() -> str:
            return row.get_text().strip()

        def setter(value: str) -> None:
            row.set_text(value)

        row.connect("changed", self._mark_dirty)
        return row, TimeFieldBinding(spec, row, getter, setter)

    def _build_services_page(self) -> Gtk.Widget:
        page = Adw.PreferencesPage()

        actions = Adw.PreferencesGroup()
        action_row = Adw.ActionRow(
            title=_("services_restart_all_title"),
            subtitle=_("services_restart_all_desc"),
        )
        restart_all = Gtk.Button(label=_("all_restart"))
        restart_all.add_css_class("suggested-action")
        restart_all.connect("clicked", self.on_restart_recommended)
        action_row.add_suffix(restart_all)
        actions.add(action_row)
        page.add(actions)

        group = Adw.PreferencesGroup(
            title=_("services_list_title"),
            description=_("services_list_desc"),
        )
        page.add(group)

        units = (
            daphne_units(4)
            + uvicorn_units(8)
            + [
                "ramis-worker.service",
                "ramis-worker-maintenance.service",
                "ramis-worker-broadcast.service",
                "ramis-beat.service",
                "ramis-frontend.service",
                "nginx.service",
            ]
        )
        seen = set()
        for unit in units:
            if unit in seen:
                continue
            seen.add(unit)
            labels = SERVICE_LABELS.get(unit, (unit, unit))
            title = labels[0] if LANG == "tr" else labels[1]
            row = ServiceStatusRow(
                unit,
                title,
                lambda u: self.restart_units([u], set()),
            )
            group.add(row)
            self.service_rows[unit] = row

        GLib.timeout_add_seconds(5, self._poll_service_status)
        return page

    def _mark_dirty(self, *_args):
        self.dirty = True
        self._update_dirty_state()

    def toast(self, message: str):
        if self.toast_overlay:
            self.toast_overlay.add_toast(Adw.Toast.new(message))

    def _set_busy(self, busy: bool):
        if self.spinner:
            if busy:
                self.spinner.start()
            else:
                self.spinner.stop()
        if self.window:
            self.window.set_sensitive(not busy)

    def load_settings(self, *_args):
        self._set_busy(True)
        ctx = GLib.MainContext.default()
        while ctx.pending():
            ctx.iteration(False)

        result = _read_env_files()
        self._set_busy(False)

        if not result.get("ok"):
            self.toast(result.get("message") or _("load_error"))
            return

        self.backend_doc = parse_env_text(result.get("backend", ""), BACKEND_ENV)
        self.frontend_doc = parse_env_text(result.get("frontend", ""), FRONTEND_ENV)
        self.backend_before = self.backend_doc.values()
        self.frontend_before = self.frontend_doc.values()

        for binding in self.backend_bindings:
            binding.load(self.backend_before)
        for binding in self.beat_bindings:
            binding.load(self.backend_before)
        self._refresh_beat_job_rows()
        for binding in self.frontend_bindings:
            binding.load(self.frontend_before)

        self._rebuild_extra_rows(
            True,
            self.backend_before,
            self._extra_group_backend,
            self.extra_backend_rows,
            self._known_backend_keys,
        )
        self._rebuild_extra_rows(
            False,
            self.frontend_before,
            self._extra_group_frontend,
            self.extra_frontend_rows,
            self._known_frontend_keys,
        )
        self.dirty = False
        self._update_dirty_state()

    def _rebuild_extra_rows(self, _is_backend, values, group, row_map, known_keys):
        if group is None:
            return
        for row in row_map.values():
            group.remove(row)
        row_map.clear()
        for key in sorted(values):
            if key in known_keys:
                continue
            row = Adw.EntryRow(title=key)
            row.set_text(values[key])
            row.connect("changed", self._mark_dirty)
            group.add(row)
            row_map[key] = row

    def _collect_values(self) -> tuple[dict[str, str], dict[str, str]]:
        backend = dict(self.backend_before)
        frontend = dict(self.frontend_before)

        for binding in self.backend_bindings:
            for key, value in binding.collect_entries():
                if value != "" or key in backend:
                    backend[key] = value
        for binding in self.beat_bindings:
            for key, value in binding.collect_entries():
                if value != "" or key in backend:
                    backend[key] = value
        for binding in self.frontend_bindings:
            for key, value in binding.collect_entries():
                if value != "" or key in frontend:
                    frontend[key] = value

        for key, row in self.extra_backend_rows.items():
            backend[key] = row.get_text().strip()
        for key, row in self.extra_frontend_rows.items():
            frontend[key] = row.get_text().strip()

        return backend, frontend

    def _validate(self, backend: dict[str, str], frontend: dict[str, str]) -> str | None:
        if "DAPHNE_INSTANCES" in backend and backend["DAPHNE_INSTANCES"]:
            try:
                count = int(backend["DAPHNE_INSTANCES"])
                if count < 1 or count > 4:
                    return _("daphne_invalid")
            except ValueError:
                return _("daphne_invalid")

        for spec in BACKEND_FIELDS:
            if spec.field_type == "time":
                hour_raw = backend.get(spec.hour_key, "").strip()
                minute_raw = backend.get(spec.minute_key, "").strip()
                combined = f"{hour_raw}:{minute_raw}" if hour_raw or minute_raw else ""
                if not combined.strip(":"):
                    continue
                if parse_time_of_day(combined) is None:
                    return _("time_invalid")
                continue
            if spec.field_type != "int":
                continue
            raw = backend.get(spec.key, "").strip()
            if not raw:
                continue
            try:
                value = int(raw)
            except ValueError:
                return _("int_invalid").format(key=spec.key)
            if spec.min_value is not None and value < spec.min_value:
                return _("int_range_invalid").format(
                    key=spec.key,
                    min_val=spec.min_value,
                    max_val=spec.max_value or spec.min_value,
                )
            if spec.max_value is not None and value > spec.max_value:
                return _("int_range_invalid").format(
                    key=spec.key,
                    min_val=spec.min_value or spec.max_value,
                    max_val=spec.max_value,
                )

        api_url = frontend.get("NEXT_PUBLIC_API_URL", "").strip()
        if api_url and not api_url.rstrip("/").endswith("/api/v1"):
            return _("api_url_invalid")
        return None

    def on_save_clicked(self, *_args):
        backend_vals, frontend_vals = self._collect_values()
        if backend_vals == self.backend_before and frontend_vals == self.frontend_before:
            self.toast(_("no_changes"))
            return

        error = self._validate(backend_vals, frontend_vals)
        if error:
            dialog = Adw.MessageDialog(
                transient_for=self.window,
                heading=_("validation_error"),
                body=error,
            )
            dialog.add_response("ok", "OK")
            dialog.present()
            return

        units, special = collect_restart_units(
            self.backend_before, backend_vals, self.frontend_before, frontend_vals
        )
        apply_plan = None
        if units or special:
            choice = self._ask_save_with_apply(units, special)
            if choice == "cancel":
                return
            if choice == "save_and_apply":
                apply_plan = {"units": units, "special": list(special)}

        merge_values(self.backend_doc, backend_vals)
        merge_values(self.frontend_doc, frontend_vals)

        payload = {
            "action": "write",
            "backend": self.backend_doc.to_text(),
            "frontend": self.frontend_doc.to_text(),
        }
        if apply_plan:
            payload["apply"] = apply_plan

        self._set_busy(True)
        result = _invoke_privileged(payload)
        self._set_busy(False)

        if not result.get("ok"):
            if result.get("saved"):
                self.backend_before = backend_vals
                self.frontend_before = frontend_vals
                self.dirty = False
                self._update_dirty_state()
                self._refresh_beat_job_rows()
                self.toast(_("save_success"))
                self.toast(result.get("message") or _("apply_error"))
            else:
                self.toast(result.get("message") or _("save_error"))
            return

        self.backend_before = backend_vals
        self.frontend_before = frontend_vals
        self.dirty = False
        self._update_dirty_state()
        self._refresh_beat_job_rows()
        self.toast(result.get("message") or _("save_success"))
        if apply_plan:
            GLib.timeout_add_seconds(2, self.refresh_service_status)

    def _restart_notes(self, special: set[str]) -> str:
        notes = ""
        if "runtime_sync" in special:
            notes += _("restart_runtime_note")
        if "beat_sync" in special:
            notes += _("restart_beat_sync_note")
        if "printing_worker_sync" in special:
            notes += _("restart_printing_worker_sync_note")
        return notes

    def _ask_save_with_apply(self, units: list[str], special: set[str]) -> str:
        unit_lines = "\n".join(f"• {unit}" for unit in units) if units else "—"
        body = _("save_apply_body").format(
            units=unit_lines,
            notes=self._restart_notes(special),
        )
        dialog = Adw.MessageDialog(
            transient_for=self.window,
            heading=_("save_apply_heading"),
            body=body,
        )
        dialog.add_response("cancel", _("cancel"))
        dialog.add_response("save_only", _("save_only"))
        dialog.add_response("save_and_apply", _("save_and_apply"))
        dialog.set_response_appearance("save_and_apply", Adw.ResponseAppearance.SUGGESTED)
        dialog.set_default_response("save_and_apply")
        dialog.set_close_response("cancel")

        choice = {"value": "cancel"}

        def on_response(_dialog, response: str) -> None:
            choice["value"] = response
            loop.quit()

        loop = GLib.MainLoop()
        dialog.connect("response", on_response)
        dialog.present()
        loop.run()
        return choice["value"]

    def _prompt_restart(self, units: list[str], special: set[str]):
        unit_lines = "\n".join(f"• {unit}" for unit in units) if units else "—"
        body = _("restart_body").format(units=unit_lines)
        body += self._restart_notes(special)

        dialog = Adw.MessageDialog(
            transient_for=self.window,
            heading=_("restart_heading"),
            body=body,
        )
        dialog.add_response("later", _("restart_later"))
        dialog.add_response("restart", _("restart_now"))
        dialog.set_response_appearance("restart", Adw.ResponseAppearance.SUGGESTED)
        dialog.connect("response", lambda d, r: r == "restart" and self.restart_units(units, special))
        dialog.present()

    def on_restart_recommended(self, *_args):
        backend_vals, frontend_vals = self._collect_values()
        units, special = collect_restart_units(
            self.backend_before, backend_vals, self.frontend_before, frontend_vals
        )
        if not units and not special:
            units = daphne_units(int(backend_vals.get("DAPHNE_INSTANCES", "1") or "1"))
            units += [
                "ramis-worker.service",
                "ramis-worker-maintenance.service",
                "ramis-worker-broadcast.service",
                "ramis-beat.service",
                "ramis-frontend.service",
            ]
        self.restart_units(units, special)

    def restart_units(self, units: list[str], special: set[str]):
        self._set_busy(True)
        result = _invoke_privileged({"action": "restart", "units": units, "special": list(special)})
        self._set_busy(False)
        if result.get("ok"):
            self.toast(result.get("message") or "OK")
            GLib.timeout_add_seconds(2, self.refresh_service_status)
        else:
            self.toast(result.get("message") or _("save_error"))

    def _poll_service_status(self):
        for row in self.service_rows.values():
            row.refresh()
        return True

    def refresh_service_status(self):
        for row in self.service_rows.values():
            row.refresh()
        return False


def main():
    app = RamisSettingsApp()
    return app.run(sys.argv)


if __name__ == "__main__":
    raise SystemExit(main())
