import gi
import subprocess
import os
import threading
import time

gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')

from gi.repository import Gtk, Adw, GLib, Gdk


def _parse_env_value(raw: str) -> str:
    """backend.env değeri — install.sh çift tırnaklı (\"…\") yazımını açar."""
    val = raw.strip()
    if len(val) >= 2 and val[0] == val[-1] == '"':
        val = val[1:-1]
        val = val.replace(r'\"', '"').replace(r'\\', '\\')
    elif len(val) >= 2 and val[0] == val[-1] == "'":
        val = val[1:-1]
    return val


def _quote_pg_ident(name: str) -> str:
    """PostgreSQL tanımlayıcısını güvenli biçimde tırnaklar."""
    return '"' + name.replace('"', '""') + '"'


def _is_safe_db_name(name: str) -> bool:
    return bool(name) and name.replace("_", "").isalnum() and not name[0].isdigit()


class MaintenanceActionRow(Adw.ActionRow):
    def __init__(self, title, subtitle, icon_name, action_callback):
        super().__init__(title=title, subtitle=subtitle)
        self.action_callback = action_callback
        
        icon = Gtk.Image.new_from_icon_name(icon_name)
        self.add_prefix(icon)
        
        self.button = Gtk.Button(label="Çalıştır")
        self.button.add_css_class("suggested-action")
        self.button.set_valign(Gtk.Align.CENTER)
        self.button.connect("clicked", self.on_button_clicked)
        self.add_suffix(self.button)

    def on_button_clicked(self, btn):
        self.action_callback(self)

class DBMaintenanceApp(Adw.Application):
    def __init__(self, **kwargs):
        super().__init__(application_id='com.ramis.DBMaintenance', **kwargs)
        self.connect('activate', self.on_activate)
        self.db_config = {}
        self.db_name = "ramis"
        self.is_processing = False

    def load_config(self):
        env_file = "/etc/ramis/backend.env"
        try:
            res = subprocess.run(["pkexec", "cat", env_file], capture_output=True, text=True)
            if res.returncode == 0:
                for line in res.stdout.splitlines():
                    if "=" in line and not line.startswith("#"):
                        key, val = line.split("=", 1)
                        self.db_config[key.strip()] = _parse_env_value(val)
                
                self.db_name = self.db_config.get("POSTGRES_DB", "ramis")
                if not _is_safe_db_name(self.db_name):
                    print(f"Geçersiz POSTGRES_DB değeri: {self.db_name!r}")
                    return False
                return True
        except Exception as e:
            print(f"Konfigürasyon okuma hatası: {e}")
        return False

    def on_activate(self, app):
        self.load_config()
        self.window = Adw.ApplicationWindow(application=app)
        self.window.set_title("Ramis ERP Veritabanı Bakımı")
        self.window.set_default_size(1000, 700)
        
        self.toast_overlay = Adw.ToastOverlay()
        self.window.set_content(self.toast_overlay)
        
        main_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        self.toast_overlay.set_child(main_box)
        
        header = Adw.HeaderBar()
        main_box.append(header)
        
        # Yatay içerik kutusu
        content_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL)
        content_box.set_vexpand(True)
        main_box.append(content_box)
        
        # Sol taraf: Aksiyonlar
        left_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        left_box.set_hexpand(True)
        content_box.append(left_box)
        
        page = Adw.StatusPage(
            title="Veritabanı Sağlığı",
            description="Sistem performansını korumak için düzenli bakım işlemlerini yapın",
            icon_name="view-refresh-symbolic"
        )
        left_box.append(page)

        clamp = Adw.Clamp()
        left_box.append(clamp)
        
        list_box = Gtk.ListBox()
        list_box.add_css_class("boxed-list")
        list_box.set_margin_bottom(32)
        clamp.set_child(list_box)
        
        # Actions
        list_box.append(MaintenanceActionRow(
            "Vakum ve Analiz (VACUUM ANALYZE)",
            "Ölü satırları temizler ve istatistikleri günceller.",
            "edit-clear-all-symbolic",
            self.run_vacuum
        ))
        
        list_box.append(MaintenanceActionRow(
            "İndeksleri Yenile (REINDEX)",
            "Tüm indeksleri yeniden oluşturur. Sorgu hızını artırır.",
            "view-list-symbolic",
            self.run_reindex
        ))
        
        list_box.append(MaintenanceActionRow(
            "İstatistikleri Güncelle (ANALYZE)",
            "Sadece istatistikleri günceller. Planlayıcı için gereklidir.",
            "view-sort-ascending-symbolic",
            self.run_analyze
        ))

        self.progress_bar = Gtk.ProgressBar()
        self.progress_bar.set_margin_start(24)
        self.progress_bar.set_margin_end(24)
        self.progress_bar.set_visible(False)
        left_box.append(self.progress_bar)

        # Sağ taraf: Log ekranı
        right_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
        right_box.set_margin_top(12)
        right_box.set_margin_bottom(12)
        right_box.set_margin_start(12)
        right_box.set_margin_end(12)
        right_box.set_size_request(400, -1)
        content_box.append(right_box)
        
        log_label = Gtk.Label(label="İşlem Kayıtları")
        log_label.add_css_class("title-4")
        log_label.set_halign(Gtk.Align.START)
        right_box.append(log_label)

        self.log_view = Gtk.TextView()
        self.log_view.set_editable(False)
        self.log_view.set_cursor_visible(False)
        self.log_view.set_margin_top(6)
        self.log_view.set_margin_bottom(6)
        self.log_view.set_margin_start(6)
        self.log_view.set_margin_end(6)
        self.log_view.add_css_class("card")
        
        log_scroll = Gtk.ScrolledWindow()
        log_scroll.set_vexpand(True)
        log_scroll.set_child(self.log_view)
        right_box.append(log_scroll)

        self.window.present()

    def append_log(self, text):
        buffer = self.log_view.get_buffer()
        end_iter = buffer.get_end_iter()
        buffer.insert(end_iter, f"[{time.strftime('%H:%M:%S')}] {text}\n")
        # Scroll to end
        adj = self.log_view.get_parent().get_vadjustment()
        adj.set_value(adj.get_upper())

    def set_busy(self, busy):
        self.is_processing = busy
        self.progress_bar.set_visible(busy)
        if busy:
            self.progress_bar.pulse()
            GLib.timeout_add(100, self.pulse_progress)

    def pulse_progress(self):
        if self.is_processing:
            self.progress_bar.pulse()
            return True
        return False

    def run_psql_command(self, sql, title):
        env = os.environ.copy()
        env["PGPASSWORD"] = self.db_config.get("POSTGRES_PASSWORD", "")
        
        cmd = ["psql", 
               "-h", self.db_config.get("POSTGRES_HOST", "localhost"),
               "-p", self.db_config.get("POSTGRES_PORT", "5432"),
               "-U", self.db_config.get("POSTGRES_USER", "postgres"),
               "-d", self.db_name, 
               "-c", sql]
        
        GLib.idle_add(self.append_log, f"İşlem başlatıldı: {title}...")
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        
        success = result.returncode == 0
        GLib.idle_add(self.append_log, f"Sonuç: {'BAŞARILI' if success else 'HATA'}")
        if not success:
            GLib.idle_add(self.append_log, f"Hata detayı: {result.stderr}")
            
        GLib.idle_add(self.on_operation_complete, success, title)

    def on_operation_complete(self, success, title):
        self.set_busy(False)
        toast = Adw.Toast(title=f"{title} {'tamamlandı' if success else 'başarısız oldu'}")
        self.toast_overlay.add_toast(toast)

    def run_vacuum(self, row):
        if self.is_processing: return
        self.set_busy(True)
        threading.Thread(target=self.run_psql_command, args=("VACUUM ANALYZE;", "VACUUM ANALYZE"), daemon=True).start()

    def run_reindex(self, row):
        if self.is_processing:
            return
        if not _is_safe_db_name(self.db_name):
            toast = Adw.Toast(title="Geçersiz veritabanı adı — REINDEX iptal")
            self.toast_overlay.add_toast(toast)
            return

        dialog = Adw.MessageDialog(
            transient_for=self.window,
            heading="REINDEX DATABASE — uyarı",
            body=(
                f"'{self.db_name}' veritabanındaki tüm indeksler yenilenecek.\n\n"
                "Bu işlem canlı trafikte uzun süreli kilitlere yol açabilir (POS/KDS etkilenebilir). "
                "Mümkünse bakım penceresinde çalıştırın.\n\nDevam edilsin mi?"
            ),
        )
        dialog.add_response("cancel", "Vazgeç")
        dialog.add_response("ok", "Evet, REINDEX")
        dialog.set_response_appearance("ok", Adw.ResponseAppearance.DESTRUCTIVE)

        def on_response(_dialog, response):
            if response != "ok":
                return
            self.set_busy(True)
            sql = f"REINDEX DATABASE {_quote_pg_ident(self.db_name)};"
            threading.Thread(
                target=self.run_psql_command,
                args=(sql, "REINDEX"),
                daemon=True,
            ).start()

        dialog.connect("response", on_response)
        dialog.present()

    def run_analyze(self, row):
        if self.is_processing: return
        self.set_busy(True)
        threading.Thread(target=self.run_psql_command, args=("ANALYZE;", "ANALYZE"), daemon=True).start()

if __name__ == "__main__":
    app = DBMaintenanceApp()
    app.run(None)
