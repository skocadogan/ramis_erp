import json
import os
import subprocess
import tempfile
import threading
import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")

from gi.repository import Gtk, Adw, Gdk, GLib


def get_lang():
    try:
        if os.path.exists("/etc/ramis/lang"):
            with open("/etc/ramis/lang", "r") as f:
                return f.read().strip()
    except:
        pass
    return "tr"


LANG = get_lang()

TRANSLATIONS = {
    "tr": {
        "app_title": "Ramis Acil Kullanıcı Yönetimi",
        "users_tab": "Kullanıcılar",
        "create_tab": "Yeni Süper Kullanıcı",
        "superuser_flag": "Yönetici",
        "inactive_flag": "Pasif",
        "auth_error": "Yetkilendirme iptal edildi veya hata oluştu",
        "empty_error": "Beklenmeyen mesaj gönderildi",
        "json_error": "Beklenmeyen JSON formatı",
        "timeout_error": "İşlem zaman aşımına uğradı",
        "list_error": "Liste alınamadı",
        "db_info": "Veritabanı",
        "emergency_desc": (
            "Bu uygulama acil durumlarda kullanılır. Veritabanındaki kayıtları doğrudan değiştirir. "
            "Pasifleştirme işlemi hesabı dondurur (yumuşak silme). Parola değişiklikleri kullanıcıya bildirilmez. "
            "Bu yüzden yalnızca ne yaptığınızı biliyorsanız kullanınız."
        ),
        "refresh_tooltip": "Listeyi yenile",
        "toggle_active_tooltip": "Durumu değiştir (Aktif/Pasif)",
        "password_tooltip": "Seçili kullanıcının parolasını değiştir",
        "create_page_title": "Süper Kullanıcı Oluştur",
        "create_page_desc": "RAMIS'in en üst yetkili kullanıcısını oluşturur.",
        "new_account_group": "Yeni Hesap Bilgileri",
        "username_label": "Kullanıcı adı",
        "email_label": "E-posta adresi",
        "password_label": "Parola",
        "password_repeat_label": "Parola (Tekrar)",
        "create_btn": "Süper Kullanıcı Oluştur",
        "select_user_first": "Önce listeden bir kullanıcı seçmelisiniz",
        "deactivate": "pasifleştirilecek",
        "activate": "aktif edilecek",
        "toggle_heading": "Durum Değiştir",
        "toggle_body": "'{username}' hesabı {status_text}. Devam etmek istiyor musunuz?",
        "cancel": "Vazgeç",
        "ok": "Tamam",
        "success": "İşlem başarılı",
        "password_heading": "Parola — {username}",
        "password_body": "Yeni parolayı iki kez giriniz.",
        "new_password": "Yeni parola",
        "save": "Kaydet",
        "password_mismatch": "Parolalar eşleşmiyor veya boş bırakıldı",
        "password_updated": "'{username}' parolası güncellendi",
        "password_fail": "Parola güncellenemedi",
        "search_placeholder": "Kullanıcı adı veya e-posta ile ara...",
        "no_users_found": "Kullanıcı bulunamadı",
        "no_users_desc": "Sistemde kayıtlı kullanıcı bulunmuyor veya arama kriterine uygun sonuç yok.",
        "login_lock_tab": "Login Kilidi",
        "login_lock_title": "Giriş Rate Limit Kilidi",
        "login_lock_desc": (
            "Yoğun load test veya çok sayıda başarısız giriş denemesinden sonra istemci IP'si "
            "geçici olarak kilitlenebilir. Tarayıcıda genelde CORS hatası görünür; asıl neden "
            "429 (login throttle — 5 deneme/dk/IP) olabilir. Bu işlem Redis/cache üzerindeki "
            "throttle_login_* kayıtlarını temizler."
        ),
        "login_lock_ip_label": "İstemci IP (isteğe bağlı)",
        "login_lock_ip_placeholder": "Örn. 192.168.1.50 — boş bırakılırsa tüm IP'ler",
        "login_lock_clear_all": "Tüm IP'lerin login kilidini kaldır",
        "login_lock_btn": "Login Kilidini Kaldır",
        "login_lock_confirm_heading": "Login Kilidi Kaldır",
        "login_lock_confirm_body_ip": "'{ip}' adresi için login throttle kayıtları silinecek.",
        "login_lock_confirm_body_all": "Tüm login throttle kayıtları silinecek.",
        "login_lock_success": "{count} kayıt silindi",
        "login_lock_empty": "Silinecek kayıt bulunamadı",
        "login_lock_need_choice": "IP girin veya 'Tüm IP'ler' seçeneğini işaretleyin",
    },
    "en": {
        "app_title": "Ramis Emergency User Admin",
        "users_tab": "Users",
        "create_tab": "New Superuser",
        "superuser_flag": "Admin",
        "inactive_flag": "Inactive",
        "auth_error": "Authorization cancelled or error occurred",
        "empty_error": "Unexpected message received",
        "json_error": "Unexpected JSON format",
        "timeout_error": "Operation timed out",
        "list_error": "Could not retrieve list",
        "db_info": "Database",
        "emergency_desc": (
            "This application is used in emergencies. It modifies database records directly. "
            "Deactivating freezes the account (soft delete). Password changes are not notified to the user. "
            "Therefore, use only if you know what you are doing."
        ),
        "refresh_tooltip": "Refresh list",
        "toggle_active_tooltip": "Toggle status (Active/Inactive)",
        "password_tooltip": "Change password for selected user",
        "create_page_title": "Create Superuser",
        "create_page_desc": "Creates the highest authorized user of RAMIS.",
        "new_account_group": "New Account Details",
        "username_label": "Username",
        "email_label": "Email address",
        "password_label": "Password",
        "password_repeat_label": "Repeat Password",
        "create_btn": "Create Superuser",
        "select_user_first": "You must select a user from the list first",
        "deactivate": "will be deactivated",
        "activate": "will be activated",
        "toggle_heading": "Change Status",
        "toggle_body": "Account '{username}' {status_text}. Do you want to continue?",
        "cancel": "Cancel",
        "ok": "OK",
        "success": "Operation successful",
        "password_heading": "Password — {username}",
        "password_body": "Enter new password twice.",
        "new_password": "New password",
        "save": "Save",
        "password_mismatch": "Passwords do not match or are empty",
        "password_updated": "Password for '{username}' updated",
        "password_fail": "Password could not be updated",
        "search_placeholder": "Search username or email...",
        "no_users_found": "No users found",
        "no_users_desc": "There are no registered users in the system or no matches for your query.",
        "login_lock_tab": "Login Lock",
        "login_lock_title": "Login Rate Limit Lock",
        "login_lock_desc": (
            "After heavy load tests or many failed login attempts, a client IP may be temporarily "
            "blocked. Browsers often show a CORS error; the real cause is usually 429 login throttle "
            "(5 attempts/min/IP). This clears throttle_login_* entries from Redis/cache."
        ),
        "login_lock_ip_label": "Client IP (optional)",
        "login_lock_ip_placeholder": "e.g. 192.168.1.50 — leave empty when clearing all",
        "login_lock_clear_all": "Clear login lock for all IPs",
        "login_lock_btn": "Clear Login Lock",
        "login_lock_confirm_heading": "Clear Login Lock",
        "login_lock_confirm_body_ip": "Login throttle entries for '{ip}' will be deleted.",
        "login_lock_confirm_body_all": "All login throttle entries will be deleted.",
        "login_lock_success": "{count} record(s) deleted",
        "login_lock_empty": "No records found to delete",
        "login_lock_need_choice": "Enter an IP or enable 'Clear all IPs'",
    }
}

# Fallback to English if language is not supported
if LANG not in TRANSLATIONS:
    LANG = "en"


def _(key):
    return TRANSLATIONS[LANG].get(key, key)


def _script_dir() -> str:
    return os.environ.get(
        "RAMIS_USER_ADMIN_SCRIPT_DIR",
        os.path.dirname(os.path.abspath(__file__)),
    )


class UserRow(Gtk.ListBoxRow):
    def __init__(self, user: dict):
        super().__init__()
        self.user_id = user["id"]
        self.user = user
        self.search_text = f"{user['username']} {user.get('email') or ''}".lower()

        main_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=14)
        main_box.set_margin_start(14)
        main_box.set_margin_end(14)
        main_box.set_margin_top(10)
        main_box.set_margin_bottom(10)

        # Status Icon (visual indicator for active/inactive status)
        is_active = user.get("is_active", True)
        self.status_icon = Gtk.Image()
        if is_active:
            self.status_icon.set_from_icon_name("emblem-ok-symbolic")
            self.status_icon.add_css_class("success")
        else:
            self.status_icon.set_from_icon_name("changes-prevent-symbolic")
            self.status_icon.add_css_class("error")
        self.status_icon.set_pixel_size(20)
        self.status_icon.set_valign(Gtk.Align.CENTER)
        main_box.append(self.status_icon)

        # Content Box
        info_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2)
        info_box.set_hexpand(True)

        title = Gtk.Label(label=user["username"], xalign=0.0)
        title.add_css_class("title-4")
        if not is_active:
            title.add_css_class("dim-label")

        email_str = user.get("email") or "—"
        sub = Gtk.Label(label=email_str, xalign=0.0)
        sub.add_css_class("dim-label")
        sub.set_wrap(True)

        info_box.append(title)
        info_box.append(sub)
        main_box.append(info_box)

        # Badges Area
        badge_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        badge_box.set_valign(Gtk.Align.CENTER)

        if user.get("is_superuser"):
            su_badge = Gtk.Label(label=_("superuser_flag").upper())
            su_badge.add_css_class("badge-superuser")
            badge_box.append(su_badge)
        elif user.get("is_staff"):
            staff_badge = Gtk.Label(label="STAFF")
            staff_badge.add_css_class("badge-staff")
            badge_box.append(staff_badge)

        if not is_active:
            inactive_badge = Gtk.Label(label=_("inactive_flag").upper())
            inactive_badge.add_css_class("badge-inactive")
            badge_box.append(inactive_badge)

        main_box.append(badge_box)
        self.set_child(main_box)


class RamisUserEmergencyApp(Adw.Application):
    def __init__(self, **kwargs):
        super().__init__(application_id="com.ramis.UserEmergencyAdmin", **kwargs)
        self.connect("activate", self.on_activate)
        self._helper = os.path.join(_script_dir(), "run_as_ramis.sh")
        self._list_box = None
        self._toast_overlay = None
        self._spinner = None
        self._main_content = None
        self._footer_label = None
        self._search_entry = None
        self._empty_state = None

    def _use_pkexec(self) -> bool:
        v = os.environ.get("RAMIS_USER_ADMIN_NO_PKEXEC", "").lower()
        if v in ("1", "true", "yes"):
            return False
        if v in ("0", "false", "no"):
            return True

        if os.path.isdir("/etc/ramis"):
            return True

        try:
            path = _script_dir()
            if path.startswith("/home/"):
                if os.stat(path).st_uid == os.getuid():
                    return False
        except (OSError, AttributeError):
            pass

        return True

    def _invoke_async(self, payload: dict, callback):
        """Asenkron olarak subprocess.run çağırır ve spinner'ı bloklamaz."""
        if self._spinner:
            self._spinner.set_visible(True)
            self._spinner.start()
        if self._main_content:
            self._main_content.set_sensitive(False)

        def worker():
            # Parolayı argv/base64 ile taşımamak için güvenli temp dosya kullan
            payload_path = None
            res = None
            try:
                fd, payload_path = tempfile.mkstemp(prefix="ramis_ua_", suffix=".json")
                with os.fdopen(fd, "w", encoding="utf-8") as handle:
                    json.dump(payload, handle, ensure_ascii=False)
                os.chmod(payload_path, 0o600)

                cmd = (
                    ["pkexec", self._helper, "--payload-file", payload_path]
                    if self._use_pkexec()
                    else [self._helper, "--payload-file", payload_path]
                )

                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                out = (proc.stdout or "").strip()
                if not out:
                    err = (proc.stderr or "").strip()
                    if proc.returncode != 0 and self._use_pkexec():
                        res = {
                            "ok": False,
                            "error": "pkexec",
                            "message": err or _("auth_error"),
                        }
                    else:
                        res = {"ok": False, "error": "empty", "message": err or _("empty_error")}
                else:
                    try:
                        res = json.loads(out)
                    except json.JSONDecodeError:
                        res = {"ok": False, "error": "json", "message": out[:500] or _("json_error")}
            except subprocess.TimeoutExpired:
                res = {"ok": False, "error": "timeout", "message": _("timeout_error")}
            except OSError as e:
                res = {"ok": False, "error": "os", "message": str(e)}
            finally:
                if payload_path:
                    try:
                        os.unlink(payload_path)
                    except OSError:
                        pass

            # GLib.idle_add ile UI thread'ine dönüş yapıp callback tetikliyoruz
            GLib.idle_add(self._on_invoke_complete, res, callback)

        threading.Thread(target=worker, daemon=True).start()

    def _on_invoke_complete(self, res, callback):
        if self._spinner:
            self._spinner.stop()
            self._spinner.set_visible(False)
        if self._main_content:
            self._main_content.set_sensitive(True)
        callback(res and res.get("ok", False), res)

    def _toast(self, msg: str, timeout: int = 4):
        if self._toast_overlay:
            self._toast_overlay.add_toast(Adw.Toast(title=msg, timeout=timeout))

    def _refresh_list(self):
        if not self._list_box:
            return

        def on_list_loaded(success, res):
            while True:
                row = self._list_box.get_row_at_index(0)
                if row is None:
                    break
                self._list_box.remove(row)

            if not success:
                msg = res.get("message") if res else _("list_error")
                if res and res.get("messages"):
                    msg = "\n".join(res["messages"])
                self._toast(msg, 6)
                self._empty_state.set_visible(True)
                self._list_box.set_visible(False)
                return

            users = res.get("users", [])
            if not users:
                self._empty_state.set_visible(True)
                self._list_box.set_visible(False)
            else:
                self._empty_state.set_visible(False)
                self._list_box.set_visible(True)
                for u in users:
                    self._list_box.append(UserRow(u))

            if self._footer_label and "db" in res:
                db = res["db"].get("default", {})
                engine = db.get("engine", "").split(".")[-1]
                name = os.path.basename(db.get("name", "unknown"))
                self._footer_label.set_label(_("db_info") + f": {engine} ({name}) — " + _("app_title"))

        self._invoke_async({"op": "list"}, on_list_loaded)

    def _filter_list_box(self, row):
        if not self._search_entry:
            return True
        query = self._search_entry.get_text().strip().lower()
        if not query:
            return True
        return query in row.search_text

    def on_activate(self, app):
        self.window = Adw.ApplicationWindow(application=app)
        self.window.set_title(_("app_title"))
        self.window.set_default_size(650, 750)

        self._toast_overlay = Adw.ToastOverlay()
        self.window.set_content(self._toast_overlay)

        overlay = Gtk.Overlay()
        self._toast_overlay.set_child(overlay)

        # Loader Spinner
        self._spinner = Gtk.Spinner()
        self._spinner.set_size_request(48, 48)
        self._spinner.set_halign(Gtk.Align.CENTER)
        self._spinner.set_valign(Gtk.Align.CENTER)
        self._spinner.set_visible(False)
        overlay.add_overlay(self._spinner)

        self._main_content = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        overlay.set_child(self._main_content)

        self._load_css()

        header = Adw.HeaderBar()
        stack = Adw.ViewStack()
        switcher_title = Adw.ViewSwitcherTitle(stack=stack)
        header.set_title_widget(switcher_title)
        self._main_content.append(header)
        self._main_content.append(stack)

        # —— Users Tab ——
        users_page = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        users_page.set_margin_top(12)
        users_page.set_margin_bottom(12)
        users_page.set_margin_start(16)
        users_page.set_margin_end(16)

        desc = Gtk.Label(
            label=_("emergency_desc"),
            xalign=0.0,
            wrap=True,
        )
        desc.add_css_class("dim-label")
        users_page.append(desc)

        # Toolbar & Filter Row
        toolbar = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        
        self._search_entry = Gtk.SearchEntry()
        self._search_entry.set_placeholder_text(_("search_placeholder"))
        self._search_entry.set_hexpand(True)
        self._search_entry.connect("search-changed", lambda e: self._list_box.invalidate_filter())
        toolbar.append(self._search_entry)

        refresh_btn = Gtk.Button.new_from_icon_name("view-refresh-symbolic")
        refresh_btn.set_tooltip_text(_("refresh_tooltip"))
        refresh_btn.connect("clicked", lambda _b: self._refresh_list())
        toolbar.append(refresh_btn)

        del_btn = Gtk.Button.new_from_icon_name("user-status-symbolic")
        del_btn.set_tooltip_text(_("toggle_active_tooltip"))
        del_btn.connect("clicked", self._on_toggle_active_clicked)
        toolbar.append(del_btn)

        pw_btn = Gtk.Button.new_from_icon_name("dialog-password-symbolic")
        pw_btn.set_tooltip_text(_("password_tooltip"))
        pw_btn.connect("clicked", self._on_password_clicked)
        toolbar.append(pw_btn)

        users_page.append(toolbar)

        scroll = Gtk.ScrolledWindow()
        scroll.set_vexpand(True)

        # Empty State
        self._empty_state = Adw.StatusPage(
            title=_("no_users_found"),
            description=_("no_users_desc"),
            icon_name="system-users-symbolic"
        )
        self._empty_state.set_vexpand(True)
        self._empty_state.set_visible(False)

        list_overlay = Gtk.Overlay()
        list_overlay.set_child(scroll)
        list_overlay.add_overlay(self._empty_state)

        self._list_box = Gtk.ListBox()
        self._list_box.add_css_class("boxed-list")
        self._list_box.set_selection_mode(Gtk.SelectionMode.BROWSE)
        self._list_box.set_filter_func(self._filter_list_box)
        scroll.set_child(self._list_box)
        
        users_page.append(list_overlay)

        stack.add_titled_with_icon(users_page, "users", _("users_tab"), "system-users-symbolic")

        # —— New Superuser Tab ——
        create_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=18)
        create_box.set_margin_top(18)
        create_box.set_margin_bottom(18)
        create_box.set_margin_start(18)
        create_box.set_margin_end(18)

        scrolled_create = Gtk.ScrolledWindow()
        scrolled_create.set_vexpand(True)
        scrolled_create.set_child(create_box)

        st = Adw.StatusPage(
            title=_("create_page_title"),
            description=_("create_page_desc"),
            icon_name="avatar-default-symbolic",
        )
        create_box.append(st)

        group = Adw.PreferencesGroup(title=_("new_account_group"))
        self._entry_username = Adw.EntryRow(title=_("username_label"))
        self._entry_email = Adw.EntryRow(title=_("email_label"))
        
        # Modern PasswordEntryRows inside PreferencesGroup
        self._create_pw1 = Adw.PasswordEntryRow(title=_("password_label"))
        self._create_pw2 = Adw.PasswordEntryRow(title=_("password_repeat_label"))
        
        group.add(self._entry_username)
        group.add(self._entry_email)
        group.add(self._create_pw1)
        group.add(self._create_pw2)
        create_box.append(group)

        create_btn = Gtk.Button(label=_("create_btn"))
        create_btn.add_css_class("suggested-action")
        create_btn.add_css_class("pill")
        create_btn.set_size_request(200, 46)
        create_btn.set_halign(Gtk.Align.CENTER)
        create_btn.connect("clicked", self._on_create_superuser)
        create_box.append(create_btn)

        stack.add_titled_with_icon(
            scrolled_create,
            "create",
            _("create_tab"),
            "emblem-important-symbolic",
        )

        # —— Login throttle tab ——
        lock_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=18)
        lock_box.set_margin_top(18)
        lock_box.set_margin_bottom(18)
        lock_box.set_margin_start(18)
        lock_box.set_margin_end(18)

        lock_scroll = Gtk.ScrolledWindow()
        lock_scroll.set_vexpand(True)
        lock_scroll.set_child(lock_box)

        lock_st = Adw.StatusPage(
            title=_("login_lock_title"),
            description=_("login_lock_desc"),
            icon_name="network-offline-symbolic",
        )
        lock_box.append(lock_st)

        lock_group = Adw.PreferencesGroup()
        self._login_lock_clear_all = Adw.SwitchRow(title=_("login_lock_clear_all"))
        self._login_lock_clear_all.connect("notify::active", self._on_login_lock_clear_all_changed)
        lock_group.add(self._login_lock_clear_all)

        self._login_lock_ip = Adw.EntryRow(title=_("login_lock_ip_label"))
        self._login_lock_ip.set_show_apply_button(False)
        lock_group.add(self._login_lock_ip)
        lock_box.append(lock_group)

        lock_btn = Gtk.Button(label=_("login_lock_btn"))
        lock_btn.add_css_class("destructive-action")
        lock_btn.add_css_class("pill")
        lock_btn.set_size_request(240, 46)
        lock_btn.set_halign(Gtk.Align.CENTER)
        lock_btn.connect("clicked", self._on_clear_login_throttle_clicked)
        lock_box.append(lock_btn)

        stack.add_titled_with_icon(
            lock_scroll,
            "login_lock",
            _("login_lock_tab"),
            "network-offline-symbolic",
        )

        self._footer_label = Gtk.Label(label=_("app_title"))
        self._footer_label.add_css_class("dim-label")
        self._footer_label.set_margin_bottom(12)
        self._main_content.append(self._footer_label)

        self.window.present()
        self._refresh_list()

    def _selected_row(self):
        row = self._list_box.get_selected_row()
        return row if isinstance(row, UserRow) else None

    def _on_toggle_active_clicked(self, _btn):
        row = self._selected_row()
        if not row:
            self._toast(_("select_user_first"))
            return

        status_text = _("deactivate") if row.user.get("is_active", True) else _("activate")
        dialog = Adw.MessageDialog(
            transient_for=self.window,
            heading=_("toggle_heading"),
            body=_("toggle_body").format(username=row.user['username'], status_text=status_text),
        )
        dialog.add_response("cancel", _("cancel"))
        dialog.add_response("ok", _("ok"))
        dialog.set_response_appearance("ok", Adw.ResponseAppearance.DESTRUCTIVE if row.user.get("is_active", True) else Adw.ResponseAppearance.SUGGESTED)
        dialog.connect("response", self._on_toggle_active_confirm, row.user_id, row.user["username"])
        dialog.present()

    def _on_toggle_active_confirm(self, dialog, response, user_id, username):
        if response != "ok":
            return
            
        def on_complete(success, res):
            if success:
                self._toast(res.get("message", _("success")))
                self._refresh_list()
            elif res:
                msg = res.get("message") or res.get("error", _("password_fail"))
                if res.get("messages"):
                    msg = "\n".join(res["messages"])
                self._toast(msg, 8)

        self._invoke_async({"op": "toggle_active", "user_id": user_id}, on_complete)

    def _on_password_clicked(self, _btn):
        row = self._selected_row()
        if not row:
            self._toast(_("select_user_first"))
            return

        dlg = Adw.MessageDialog(
            transient_for=self.window,
            heading=_("password_heading").format(username=row.user['username']),
            body=_("password_body"),
        )
        
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
        box.set_margin_start(6)
        box.set_margin_end(6)
        
        pref_group = Adw.PreferencesGroup()
        pw1 = Adw.PasswordEntryRow(title=_("new_password"))
        pw2 = Adw.PasswordEntryRow(title=_("password_repeat_label"))
        pref_group.add(pw1)
        pref_group.add(pw2)
        box.append(pref_group)
        
        dlg.set_extra_child(box)

        dlg.add_response("cancel", _("cancel"))
        dlg.add_response("ok", _("save"))
        dlg.set_response_appearance("ok", Adw.ResponseAppearance.SUGGESTED)
        dlg.set_default_response("ok")
        dlg.connect("response", self._on_password_dialog_response, row.user_id, row.user["username"], pw1, pw2)
        dlg.present()

    def _on_password_dialog_response(self, dlg, response, user_id, username, pw1, pw2):
        if response == "ok":
            a, b = pw1.get_text(), pw2.get_text()
            if not a or a != b:
                self._toast(_("password_mismatch"))
                dlg.destroy()
                return
                
            def on_complete(success, res):
                if success:
                    self._toast(_("password_updated").format(username=username))
                else:
                    msg = res.get("message") or _("password_fail")
                    if res.get("messages"):
                        msg = "\n".join(res["messages"])
                    self._toast(msg, 8)
                    
            self._invoke_async({"op": "set_password", "user_id": user_id, "password": a}, on_complete)
        dlg.destroy()

    def _on_create_superuser(self, _btn):
        username = self._entry_username.get_text().strip()
        email = self._entry_email.get_text().strip()
        pw = self._create_pw1.get_text()
        pw2 = self._create_pw2.get_text()
        if not pw or pw != pw2:
            self._toast(_("password_mismatch"))
            return
            
        def on_complete(success, res):
            if success:
                self._toast(res.get("message", "Oluşturuldu"))
                self._entry_username.set_text("")
                self._entry_email.set_text("")
                self._create_pw1.set_text("")
                self._create_pw2.set_text("")
                self._refresh_list()
            else:
                msg = res.get("message") or res.get("error", "Oluşturulamadı")
                if res.get("messages"):
                    msg = "\n".join(res["messages"])
                self._toast(msg, 8)

        self._invoke_async(
            {
                "op": "create_superuser",
                "username": username,
                "email": email,
                "password": pw,
            },
            on_complete
        )

    def _on_login_lock_clear_all_changed(self, switch, _pspec):
        active = switch.get_active()
        self._login_lock_ip.set_sensitive(not active)
        if active:
            self._login_lock_ip.set_text("")

    def _on_clear_login_throttle_clicked(self, _btn):
        clear_all = self._login_lock_clear_all.get_active()
        ip = self._login_lock_ip.get_text().strip()

        if not clear_all and not ip:
            self._toast(_("login_lock_need_choice"))
            return

        if clear_all:
            body = _("login_lock_confirm_body_all")
        else:
            body = _("login_lock_confirm_body_ip").format(ip=ip)

        dialog = Adw.MessageDialog(
            transient_for=self.window,
            heading=_("login_lock_confirm_heading"),
            body=body,
        )
        dialog.add_response("cancel", _("cancel"))
        dialog.add_response("ok", _("ok"))
        dialog.set_response_appearance("ok", Adw.ResponseAppearance.DESTRUCTIVE)
        dialog.connect("response", self._on_clear_login_throttle_confirm, ip, clear_all)
        dialog.present()

    def _on_clear_login_throttle_confirm(self, dialog, response, ip, clear_all):
        if response != "ok":
            return

        payload = {"op": "clear_login_throttle", "clear_all": clear_all}
        if not clear_all:
            payload["ip"] = ip

        def on_complete(success, res):
            if not success:
                msg = res.get("message") if res else _("password_fail")
                if res and res.get("messages"):
                    msg = "\n".join(res["messages"])
                self._toast(msg, 8)
                return
            count = res.get("count", 0)
            if count:
                self._toast(_("login_lock_success").format(count=count))
            else:
                self._toast(_("login_lock_empty"))

        self._invoke_async(payload, on_complete)

    def _load_css(self):
        css = """
        .boxed-list { border-radius: 12px; }
        .success { color: #2ec27e; }
        .error { color: #e01b24; }
        
        .badge-superuser {
            background-color: #e01b24;
            color: white;
            font-weight: bold;
            font-size: 8pt;
            padding: 4px 8px;
            border-radius: 10px;
        }
        .badge-staff {
            background-color: #3584e4;
            color: white;
            font-weight: bold;
            font-size: 8pt;
            padding: 4px 8px;
            border-radius: 10px;
        }
        .badge-inactive {
            background-color: #77767b;
            color: white;
            font-weight: bold;
            font-size: 8pt;
            padding: 4px 8px;
            border-radius: 10px;
        }
        """
        provider = Gtk.CssProvider()
        provider.load_from_data(css.encode())
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
        )


def main():
    RamisUserEmergencyApp().run(None)


if __name__ == "__main__":
    main()
