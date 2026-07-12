import gi
import subprocess
import os
import datetime
import threading
import sys
import tempfile
import shutil
import tarfile
import json
import re

gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')

from gi.repository import Gtk, Adw, GLib, Gdk

# ----------------- PATH & SETTINGS -----------------
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
# Projenin kök dizini (iki seviye yukarı: system_utils/backup_restore -> ramis_erp)
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
MEDIA_DIR = os.path.join(PROJECT_ROOT, "backend", "media")
BACKUP_DIR = os.path.expanduser("~/ramis_backups")
os.makedirs(BACKUP_DIR, exist_ok=True)

RAMIS_SERVICES = [
    "ramis-daphne.service",
    "ramis-frontend.service",
    "ramis-worker.service",
    "ramis-worker-maintenance.service",
    "ramis-worker-broadcast.service",
    "ramis-beat.service",
]
ALLOWED_BACKUP_SUFFIXES = (".dump", ".sql", ".tar.gz")
BACKUP_FILENAME_RE = re.compile(
    r"^ramis_(?:auto_)?backup_\d{8}(?:_\d{6})?(?:\.dump|\.sql|\.tar\.gz)$"
)


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
    """PostgreSQL tanımlayıcısını güvenli biçimde tırnaklar (SQL enjeksiyonunu önler)."""
    return '"' + name.replace('"', '""') + '"'


def _is_allowed_backup_filename(filename: str) -> bool:
    """Yedek dosya adının beklenen desene uyup uymadığını doğrular."""
    if not filename or os.path.basename(filename) != filename:
        return False
    if ".." in filename or filename.startswith("."):
        return False
    if not filename.endswith(ALLOWED_BACKUP_SUFFIXES):
        return False
    return bool(BACKUP_FILENAME_RE.match(filename))


def _resolve_backup_path(filepath: str, *, allow_external: bool = False) -> str:
    """Yedek dosya yolunu doğrular; GUI yalnızca BACKUP_DIR içindeki dosyaları kabul eder."""
    resolved = os.path.realpath(os.path.abspath(filepath))
    if not os.path.isfile(resolved):
        raise FileNotFoundError(f"Yedek dosyası bulunamadı: {filepath}")

    basename = os.path.basename(resolved)
    if ".." in basename or basename.startswith("."):
        raise ValueError(f"Geçersiz yedek dosya adı: {basename}")
    if not basename.endswith(ALLOWED_BACKUP_SUFFIXES):
        raise ValueError(f"Desteklenmeyen yedek uzantısı: {basename}")

    backup_root = os.path.realpath(BACKUP_DIR)
    if not allow_external:
        if not resolved.startswith(backup_root + os.sep):
            raise ValueError(
                f"Güvenlik: yedek dosyası yalnızca {backup_root} dizininden seçilebilir."
            )
        if not _is_allowed_backup_filename(basename):
            raise ValueError(f"Geçersiz yedek dosya adı: {basename}")
    return resolved


def _safe_tar_extract(tar: tarfile.TarFile, dest_dir: str) -> None:
    """Tar arşivini path traversal ve sembolik bağlantı saldırılarına karşı güvenli açar."""
    dest_dir = os.path.realpath(dest_dir)
    for member in tar.getmembers():
        if member.issym() or member.islnk():
            raise tarfile.TarError(
                f"Güvenlik: arşivde sembolik/bağlantılı girdi reddedildi: {member.name}"
            )
        target = os.path.realpath(os.path.join(dest_dir, member.name))
        if target != dest_dir and not target.startswith(dest_dir + os.sep):
            raise tarfile.TarError(
                f"Güvenlik: arşiv dışına yazma girişimi reddedildi: {member.name}"
            )
    if hasattr(tarfile, "data_filter"):
        tar.extractall(path=dest_dir, filter="data")
    else:
        tar.extractall(path=dest_dir)


def _read_crontab_lines() -> list[str]:
    result = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
    if result.returncode != 0:
        return []
    return [line for line in result.stdout.splitlines() if line.strip()]


def _write_crontab_lines(lines: list[str]) -> None:
    payload = "\n".join(lines)
    if payload:
        payload += "\n"
    result = subprocess.run(
        ["crontab", "-"],
        input=payload,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "crontab güncellenemedi")


def _pg_env(db_config: dict) -> dict:
    env = os.environ.copy()
    env["PGPASSWORD"] = db_config.get("POSTGRES_PASSWORD", "")
    return env


def _pg_common_args(db_config: dict, db_name: str) -> list[str]:
    return [
        "-h", db_config.get("POSTGRES_HOST", "localhost"),
        "-p", str(db_config.get("POSTGRES_PORT", "5432")),
        "-U", db_config.get("POSTGRES_USER", "postgres"),
        "-d", db_name,
    ]


def _stop_ramis_services(log_fn) -> bool:
    log_fn("Canlı sistem servisleri (Daphne, Celery vb.) durduruluyor...")
    result = subprocess.run(
        ["pkexec", "systemctl", "stop", *RAMIS_SERVICES],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log_fn(f"UYARI: Servis durdurma uyarısı: {result.stderr.strip()}")
    else:
        log_fn("Servisler durduruldu.")
    return result.returncode == 0


def _start_ramis_services(log_fn) -> bool:
    log_fn("Canlı sistem servisleri (Daphne, Celery vb.) yeniden başlatılıyor...")
    result = subprocess.run(
        ["pkexec", "systemctl", "start", *RAMIS_SERVICES],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log_fn(f"UYARI: Servis başlatma uyarısı: {result.stderr.strip()}")
    else:
        log_fn("Servisler başlatıldı.")
    return result.returncode == 0


def _create_emergency_db_backup(db_config: dict, db_name: str, log_fn) -> str | None:
    """DROP SCHEMA öncesi acil DB yedeği — restore başarısız olursa kurtarma imkânı."""
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    emergency_path = os.path.join(BACKUP_DIR, f"pre_restore_emergency_{stamp}.dump")
    log_fn(f"Güvenlik: acil ön-yedek alınıyor → {os.path.basename(emergency_path)}")
    cmd = [
        "pg_dump",
        *_pg_common_args(db_config, db_name),
        "-Fc",
        "-f", emergency_path,
    ]
    result = subprocess.run(cmd, env=_pg_env(db_config), capture_output=True, text=True)
    if result.returncode != 0:
        log_fn(f"Acil ön-yedek ALINAMADI: {result.stderr.strip()}")
        return None
    log_fn("Acil ön-yedek başarıyla alındı.")
    return emergency_path


def _extract_backup_archive(filepath: str, log_fn) -> tuple[str | None, str, bool, bool, str | None]:
    """
    Yedek arşivini veya düz DB dosyasını hazırlar.
    Dönüş: (temp_dir, db_restore_file, db_format_is_sql, has_media, error_msg)
    """
    is_tar = filepath.endswith(".tar.gz")
    is_sql = filepath.endswith(".sql")
    temp_dir = None

    if not is_tar:
        return None, filepath, is_sql, False, None

    log_fn("Yedek arşivi açılıyor...")
    temp_dir = tempfile.mkdtemp(prefix="ramis_restore_")
    try:
        with tarfile.open(filepath, "r:gz") as tar:
            _safe_tar_extract(tar, temp_dir)

        metadata_path = os.path.join(temp_dir, "metadata.json")
        db_format = "dump"
        has_media = False
        if os.path.exists(metadata_path):
            with open(metadata_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            db_format = meta.get("db_format", "dump")
            has_media = bool(meta.get("has_media", False))
            backup_db_name = meta.get("db_name")
            if backup_db_name:
                log_fn(f"Yedek metadata: db_name={backup_db_name}, format={db_format}")
        else:
            if os.path.exists(os.path.join(temp_dir, "db.sql")):
                db_format = "sql"
            has_media = os.path.isdir(os.path.join(temp_dir, "media"))

        db_ext = ".sql" if db_format == "sql" else ".dump"
        db_restore_file = os.path.join(temp_dir, f"db{db_ext}")
        db_format_is_sql = db_format == "sql"

        if not os.path.isfile(db_restore_file):
            candidates = [
                os.path.join(temp_dir, f)
                for f in os.listdir(temp_dir)
                if f.endswith((".dump", ".sql"))
            ]
            if not candidates:
                raise FileNotFoundError("Arşivde veritabanı yedeği bulunamadı.")
            db_restore_file = candidates[0]
            db_format_is_sql = db_restore_file.endswith(".sql")

        log_fn("Arşiv başarıyla ayıklandı.")
        return temp_dir, db_restore_file, db_format_is_sql, has_media, None
    except Exception as exc:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)
        return None, "", False, False, str(exc)


def _perform_db_backup(
    filepath: str,
    *,
    is_sql: bool,
    include_media: bool,
    db_config: dict,
    db_name: str,
    log_fn,
) -> bool:
    format_arg = "-Fp" if is_sql else "-Fc"
    db_ext = ".sql" if is_sql else ".dump"
    temp_dir = tempfile.mkdtemp(prefix="ramis_backup_")
    temp_db_path = os.path.join(temp_dir, f"db{db_ext}")
    partial_path = filepath + ".partial"

    try:
        log_fn(f"Veritabanı yedekleniyor: {db_name} ...")
        cmd = [
            "pg_dump",
            *_pg_common_args(db_config, db_name),
            format_arg,
            "-f", temp_db_path,
        ]
        result = subprocess.run(cmd, env=_pg_env(db_config), capture_output=True, text=True)
        if result.returncode != 0:
            log_fn(f"Veritabanı yedekleme HATASI: {result.stderr.strip()}")
            return False

        log_fn("Veritabanı yedeği başarıyla alındı.")

        if not include_media:
            shutil.move(temp_db_path, partial_path)
            os.replace(partial_path, filepath)
            log_fn(f"Yedek dosyası kaydedildi: {os.path.basename(filepath)}")
            return True

        log_fn("Medya dosyaları paketleniyor ve sıkıştırılıyor...")
        metadata = {
            "version": "1.1",
            "created_at": datetime.datetime.now().isoformat(),
            "db_format": "sql" if is_sql else "dump",
            "has_media": True,
            "db_name": db_name,
        }
        metadata_path = os.path.join(temp_dir, "metadata.json")
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=4)

        with tarfile.open(partial_path, "w:gz") as tar:
            tar.add(temp_db_path, arcname=f"db{db_ext}")
            tar.add(metadata_path, arcname="metadata.json")
            if os.path.isdir(MEDIA_DIR):
                log_fn(f"Medya dizini sıkıştırılıyor: {MEDIA_DIR}")
                tar.add(MEDIA_DIR, arcname="media")
            else:
                log_fn("UYARI: Medya klasörü bulunamadı, arşivde boş kalacaktır.")

        os.replace(partial_path, filepath)
        log_fn(f"Yedek paketi başarıyla oluşturuldu: {os.path.basename(filepath)}")
        return True
    except Exception as exc:
        log_fn(f"Yedekleme HATASI: {exc}")
        if os.path.exists(partial_path):
            try:
                os.remove(partial_path)
            except OSError:
                pass
        return False
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def _drop_public_schema(db_config: dict, db_name: str, log_fn) -> bool:
    db_user = db_config.get("POSTGRES_USER", "postgres")
    quoted_user = _quote_pg_ident(db_user)
    cleanup_sql = (
        "DROP SCHEMA IF EXISTS public CASCADE; "
        "CREATE SCHEMA public; "
        "GRANT ALL ON SCHEMA public TO public; "
        f"GRANT ALL ON SCHEMA public TO {quoted_user};"
    )
    log_fn("Veritabanı şeması temizleniyor (public schema drop cascade)...")
    result = subprocess.run(
        ["psql", *_pg_common_args(db_config, db_name), "-v", "ON_ERROR_STOP=1", "-c", cleanup_sql],
        env=_pg_env(db_config),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log_fn(f"Şema temizleme HATASI: {result.stderr.strip()}")
        return False
    return True


def _restore_database(db_restore_file: str, db_format_is_sql: bool, db_config: dict, db_name: str, log_fn) -> bool:
    log_fn("Veritabanı geri yükleniyor...")
    if db_format_is_sql:
        cmd = [
            "psql",
            *_pg_common_args(db_config, db_name),
            "-v", "ON_ERROR_STOP=1",
            "-f", db_restore_file,
        ]
    else:
        cmd = [
            "pg_restore",
            *_pg_common_args(db_config, db_name),
            "--no-owner",
            "--no-privileges",
            "--exit-on-error",
            db_restore_file,
        ]

    result = subprocess.run(cmd, env=_pg_env(db_config), capture_output=True, text=True)
    stderr = (result.stderr or "").strip()
    if result.returncode != 0:
        log_fn(f"Veritabanı geri yükleme HATASI: {stderr}")
        return False
    if stderr:
        log_fn(f"Veritabanı geri yükleme uyarıları: {stderr}")
    log_fn("Veritabanı başarıyla geri yüklendi.")
    return True


def _clear_media_dir(log_fn) -> None:
    if not os.path.isdir(MEDIA_DIR):
        os.makedirs(MEDIA_DIR, exist_ok=True)
        return
    log_fn("Mevcut medya klasörü temizleniyor...")
    try:
        for item in os.listdir(MEDIA_DIR):
            item_path = os.path.join(MEDIA_DIR, item)
            if os.path.isdir(item_path):
                shutil.rmtree(item_path)
            else:
                os.remove(item_path)
    except OSError as exc:
        log_fn(f"Medya temizleme izin hatası ({exc}). pkexec kullanılıyor...")
        subprocess.run(["pkexec", "rm", "-rf", MEDIA_DIR], check=False)
        os.makedirs(MEDIA_DIR, exist_ok=True)


def _restore_media_from_dir(temp_media_dir: str, log_fn) -> bool:
    if not os.path.isdir(temp_media_dir):
        log_fn("UYARI: Yedek arşivi içinde medya dosyası bulunamadı.")
        return True

    log_fn("Medya dosyaları geri yükleniyor...")
    try:
        _clear_media_dir(log_fn)
        log_fn(f"Medya dosyaları şuraya yazılıyor: {MEDIA_DIR}")
        for item in os.listdir(temp_media_dir):
            src_item = os.path.join(temp_media_dir, item)
            dst_item = os.path.join(MEDIA_DIR, item)
            if os.path.isdir(src_item):
                shutil.copytree(src_item, dst_item)
            else:
                shutil.copy2(src_item, dst_item)
        log_fn("Medya dosyaları başarıyla geri yüklendi.")
        return True
    except Exception as exc:
        log_fn(f"Medya geri yükleme HATASI: {exc}")
        return False


def _perform_restore(filepath: str, db_config: dict, db_name: str, log_fn, *, allow_external: bool = False) -> bool:
    log_fn("Geri yükleme işlemi başlatıldı...")
    temp_dir = None
    services_stopped = False
    success = False

    try:
        resolved = _resolve_backup_path(filepath, allow_external=allow_external)
        temp_dir, db_restore_file, db_format_is_sql, has_media, extract_error = _extract_backup_archive(
            resolved, log_fn
        )
        if extract_error:
            log_fn(f"Arşiv ayıklama HATASI: {extract_error}")
            return False

        if not os.path.isfile(db_restore_file):
            log_fn("HATA: Geri yüklenecek veritabanı dosyası bulunamadı.")
            return False

        _stop_ramis_services(log_fn)
        services_stopped = True

        emergency_path = _create_emergency_db_backup(db_config, db_name, log_fn)
        if emergency_path is None:
            log_fn("HATA: Acil ön-yedek alınamadı; güvenlik nedeniyle geri yükleme iptal edildi.")
            return False

        if not _drop_public_schema(db_config, db_name, log_fn):
            log_fn(f"HATA: Şema temizlenemedi. Acil yedek: {emergency_path}")
            return False

        db_success = _restore_database(db_restore_file, db_format_is_sql, db_config, db_name, log_fn)
        media_success = True
        if db_success and has_media and temp_dir:
            temp_media_dir = os.path.join(temp_dir, "media")
            media_success = _restore_media_from_dir(temp_media_dir, log_fn)

        success = db_success and media_success
        if success:
            log_fn("Geri yükleme işlemi başarıyla tamamlandı.")
        else:
            log_fn(f"Geri yükleme BAŞARISIZ OLDU. Acil kurtarma yedeği: {emergency_path}")
        return success
    finally:
        if services_stopped:
            _start_ramis_services(log_fn)
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)


def _perform_backup(
    filepath: str,
    *,
    is_sql: bool,
    include_media: bool,
    db_config: dict,
    db_name: str,
    log_fn,
) -> bool:
    log_fn("Yedekleme işlemi başlatıldı...")
    basename = os.path.basename(filepath)
    if not _is_allowed_backup_filename(basename):
        log_fn(f"HATA: Geçersiz hedef dosya adı: {basename}")
        return False
    return _perform_db_backup(
        filepath,
        is_sql=is_sql,
        include_media=include_media,
        db_config=db_config,
        db_name=db_name,
        log_fn=log_fn,
    )


def get_dir_size_mb(path) -> float:
    """Belirtilen dizinin toplam boyutunu MB olarak döndürür."""
    if not os.path.exists(path):
        return 0.0
    total_size = 0
    for dirpath, dirnames, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            if not os.path.islink(fp):
                try:
                    total_size += os.path.getsize(fp)
                except OSError:
                    pass
    return total_size / (1024 * 1024)


def parse_backup_filename(filename):
    """Yedek dosya adından tarih, tür ve biçimlendirilmiş bilgi çıkarır."""
    is_auto = "auto" in filename
    is_media = filename.endswith(".tar.gz")
    is_sql = filename.endswith(".sql")
    is_dump = filename.endswith(".dump")
    
    # Desen: ramis_(auto_)?backup_YYYYMMDD_HHMMSS
    m = re.search(r"ramis_(?:auto_)?backup_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})", filename)
    
    if m:
        year, month, day, hour, minute, second = m.groups()
        months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
        month_name = months[int(month) - 1]
        date_str = f"{day} {month_name} {year}, {hour}:{minute}:{second}"
    else:
        # ramis_auto_backup_YYYYMMDD.dump vb. (eski cron adları)
        m2 = re.search(r"ramis_(?:auto_)?backup_(\d{4})(\d{2})(\d{2})", filename)
        if m2:
            year, month, day = m2.groups()
            months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
            month_name = months[int(month) - 1]
            date_str = f"{day} {month_name} {year}"
        else:
            date_str = "Özel Yedek"
            
    type_str = "DB + Medya Klasörü" if is_media else ("Sadece DB (.sql)" if is_sql else "Sadece DB (.dump)")
    if is_auto:
        type_str += " (Otomatik)"
        
    return date_str, type_str, is_media


# ----------------- UI COMPONENTS -----------------

class BackupRow(Adw.ActionRow):
    def __init__(self, filename, parent):
        super().__init__()
        self.filename = filename
        self.parent = parent
        self.filepath = os.path.join(BACKUP_DIR, filename)
        
        # Parse backup info
        date_str, type_str, is_media = parse_backup_filename(filename)
        self.set_title(date_str)
        
        # Stats & Info
        size_mb = os.path.getsize(self.filepath) / (1024 * 1024)
        self.set_subtitle(f"{size_mb:.2f} MB • {type_str}")
        
        # Icon
        icon_name = "package-x-generic-symbolic" if is_media else ("folder-saved-search-symbolic" if filename.endswith(".dump") else "text-x-generic-symbolic")
        icon = Gtk.Image.new_from_icon_name(icon_name)
        self.add_prefix(icon)
        
        # Actions Box
        actions_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        self.add_suffix(actions_box)
        
        restore_btn = Gtk.Button.new_from_icon_name("document-revert-symbolic")
        restore_btn.set_tooltip_text("Bu Yedeği Geri Yükle")
        restore_btn.add_css_class("flat")
        restore_btn.connect("clicked", self.on_restore_clicked)
        actions_box.append(restore_btn)
        
        delete_btn = Gtk.Button.new_from_icon_name("user-trash-symbolic")
        delete_btn.set_tooltip_text("Yedeği Sil")
        delete_btn.add_css_class("flat")
        delete_btn.connect("clicked", self.on_delete_clicked)
        actions_box.append(delete_btn)

    def on_restore_clicked(self, btn):
        dialog = Adw.MessageDialog(
            transient_for=self.get_root(),
            heading="Yedeği Geri Yükle",
            body=f"'{self.filename}' yedeği geri yüklenecektir.\n\n"
                 "UYARI: Canlı sistem servisleri (Daphne, Celery vb.) geçici olarak durdurulacak, "
                 "mevcut veritabanınız tamamen silinecek ve seçilen yedekteki veriler ile medya dosyaları geri yüklenecektir.\n\n"
                 "Devam etmek istediğinize emin misiniz?"
        )
        dialog.add_response("cancel", "Vazgeç")
        dialog.add_response("restore", "Evet, Geri Yükle")
        dialog.set_response_appearance("restore", Adw.ResponseAppearance.DESTRUCTIVE)
        dialog.connect("response", self.on_restore_confirmed)
        dialog.present()

    def on_restore_confirmed(self, dialog, response):
        if response == "restore":
            self.parent.start_restore(self.filepath)

    def on_delete_clicked(self, btn):
        dialog = Adw.MessageDialog(
            transient_for=self.get_root(),
            heading="Yedeği Sil",
            body=f"'{self.filename}' yedek dosyası kalıcı olarak silinecektir. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?"
        )
        dialog.add_response("cancel", "Vazgeç")
        dialog.add_response("delete", "Sil")
        dialog.set_response_appearance("delete", Adw.ResponseAppearance.DESTRUCTIVE)
        dialog.connect("response", self.on_delete_confirmed)
        dialog.present()

    def on_delete_confirmed(self, dialog, response):
        if response == "delete":
            try:
                os.remove(self.filepath)
                self.parent.refresh_list()
                self.parent.update_status_cards()
            except Exception as e:
                self.parent.show_toast(f"Yedek silinirken hata oluştu: {e}")


class RamisBackupApp(Adw.Application):
    def __init__(self, **kwargs):
        super().__init__(application_id='com.ramis.BackupManager', **kwargs)
        self.connect('activate', self.on_activate)
        self.db_config = {}
        self.db_name = "ramis"
        self.is_processing = False

    def load_config(self):
        env_file = "/etc/ramis/backend.env"
        dev_env = os.path.abspath(os.path.join(PROJECT_ROOT, "backend", ".env"))

        # Üretim ortamı ayarları geliştirme .env dosyasından önce okunur
        paths_to_try = []
        if os.path.exists(env_file):
            paths_to_try.append(env_file)
        if os.path.exists(dev_env):
            paths_to_try.append(dev_env)
            
        for path in paths_to_try:
            try:
                with open(path, "r") as f:
                    content = f.read()
                    self._parse_config_content(content)
                    print(f"Konfigürasyon şuradan yüklendi: {path}")
                    return True
            except PermissionError:
                continue
            except Exception as e:
                print(f"Konfigürasyon okuma hatası ({path}): {e}")
                
        # Eğer okunamadıysa pkexec dene (GUI modunda)
        try:
            res = subprocess.run(["pkexec", "cat", env_file], capture_output=True, text=True)
            if res.returncode == 0:
                self._parse_config_content(res.stdout)
                print(f"Konfigürasyon pkexec ile {env_file} dosyasından yüklendi.")
                return True
        except Exception as e:
            print(f"pkexec ile konfigürasyon okunamadı: {e}")
            
        # Varsayılan değerler
        self.db_name = "ramis"
        return False

    def _parse_config_content(self, content):
        for line in content.splitlines():
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                key, val = line.split("=", 1)
                self.db_config[key.strip()] = _parse_env_value(val)
        self.db_name = self.db_config.get("POSTGRES_DB", "ramis")

    def on_activate(self, app):
        self.load_config()
        
        self.window = Adw.ApplicationWindow(application=app)
        self.window.set_title("Ramis ERP Yedekleme Yönetimi")
        self.window.set_default_size(680, 720)
        
        self.toast_overlay = Adw.ToastOverlay()
        self.window.set_content(self.toast_overlay)
        
        main_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        self.toast_overlay.set_child(main_box)
        
        # Header bar with view switcher
        header = Adw.HeaderBar()
        stack = Adw.ViewStack()
        switcher_title = Adw.ViewSwitcherTitle(stack=stack)
        header.set_title_widget(switcher_title)
        
        main_box.append(header)
        
        # --- System Status Group (Corporate Top Banner) ---
        status_group = Adw.PreferencesGroup()
        status_group.set_margin_start(18)
        status_group.set_margin_end(18)
        status_group.set_margin_top(12)
        main_box.append(status_group)
        
        # Row layout for status cards
        status_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
        status_box.set_homogeneous(True)
        status_group.add(status_box)
        
        # DB Status Row
        self.db_row = Adw.ActionRow(title="Veritabanı")
        self.db_row.add_prefix(Gtk.Image.new_from_icon_name("network-server-symbolic"))
        status_box.append(self.db_row)
        
        # Media Size Row
        self.media_row = Adw.ActionRow(title="Medya Klasörü")
        self.media_row.add_prefix(Gtk.Image.new_from_icon_name("folder-pictures-symbolic"))
        status_box.append(self.media_row)
        
        # Backup Storage Row
        self.storage_row = Adw.ActionRow(title="Yedekleme Deposu")
        self.storage_row.add_prefix(Gtk.Image.new_from_icon_name("drive-harddisk-symbolic"))
        status_box.append(self.storage_row)
        
        # --- Backup Page ---
        backup_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=18)
        backup_box.set_margin_top(12)
        backup_box.set_margin_bottom(18)
        backup_box.set_margin_start(18)
        backup_box.set_margin_end(18)
        
        scrolled_backup = Gtk.ScrolledWindow()
        scrolled_backup.set_vexpand(True)
        scrolled_backup.set_child(backup_box)
        
        status_page = Adw.StatusPage(
            title="Sistem Yedekleme",
            description="Veritabanı ve medya dosyalarını tek bir pakette güvenle yedekleyin",
            icon_name="document-save-symbolic"
        )
        backup_box.append(status_page)
        
        group = Adw.PreferencesGroup(title="Yedekleme Tercihleri")
        backup_box.append(group)
        
        # Format Selector
        self.format_row = Adw.ComboRow(title="Veritabanı Yedek Formatı")
        self.format_row.set_model(Gtk.StringList.new(["Sıkıştırılmış (.dump) - Önerilen", "SQL Plain Text (.sql)"]))
        self.format_row.connect("notify::selected", lambda r, p: self.update_preview_filename())
        group.add(self.format_row)
        
        # Media Switch
        self.media_switch = Adw.SwitchRow(title="Medya Dosyalarını Dahil Et", subtitle="Görseller, yüklemeler ve diğer medya dosyaları yedek paketine eklenir")
        self.media_switch.set_active(True)
        self.media_switch.connect("notify::active", lambda r, p: self.update_preview_filename())
        group.add(self.media_switch)
        
        # Preview Row
        self.filename_preview_row = Adw.ActionRow(title="Oluşturulacak Dosya Adı Önizleme")
        self.filename_preview_row.add_prefix(Gtk.Image.new_from_icon_name("document-properties-symbolic"))
        group.add(self.filename_preview_row)
        
        # Action Buttons Box
        action_btn_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
        action_btn_box.set_halign(Gtk.Align.CENTER)
        backup_box.append(action_btn_box)
        
        # Backup Button
        self.backup_btn = Gtk.Button(label="Şimdi Yedek Al")
        self.backup_btn.add_css_class("suggested-action")
        self.backup_btn.add_css_class("pill")
        self.backup_btn.set_size_request(220, 48)
        self.backup_btn.connect("clicked", self.on_backup_clicked)
        action_btn_box.append(self.backup_btn)
        
        # Progress Bar
        self.progress_bar = Gtk.ProgressBar()
        self.progress_bar.set_margin_top(6)
        self.progress_bar.set_visible(False)
        backup_box.append(self.progress_bar)
        
        # --- Expander for Console Logs ---
        self.log_expander = Gtk.Expander(label="İşlem Günlüğü (Konsol Çıktısı)")
        self.log_expander.set_margin_top(6)
        
        # Console Log View
        self.log_scrolled = Gtk.ScrolledWindow()
        self.log_scrolled.set_min_content_height(140)
        self.log_scrolled.set_max_content_height(250)
        self.log_scrolled.set_vexpand(True)
        
        self.log_view = Gtk.TextView()
        self.log_view.set_editable(False)
        self.log_view.set_cursor_visible(False)
        self.log_view.set_monospace(True)
        self.log_view.set_margin_top(6)
        self.log_view.set_margin_bottom(6)
        self.log_view.set_margin_start(6)
        self.log_view.set_margin_end(6)
        
        # Dark style for logs (like a terminal)
        self.log_view.add_css_class("log-console")
        display = Gdk.Display.get_default()
        if display:
            css_provider = Gtk.CssProvider()
            css_provider.load_from_data(b"""
                .log-console text {
                    background-color: #1e1e1e;
                    color: #00ff00;
                    font-family: monospace;
                    font-size: 11pt;
                }
            """)
            Gtk.StyleContext.add_provider_for_display(
                display,
                css_provider,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
            )
        
        self.log_scrolled.set_child(self.log_view)
        self.log_expander.set_child(self.log_scrolled)
        backup_box.append(self.log_expander)
        
        # --- Backups List Page ---
        list_page = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        
        # Toolbar
        toolbar = Gtk.HeaderBar()
        toolbar.add_css_class("flat")
        
        refresh_btn = Gtk.Button.new_from_icon_name("view-refresh-symbolic")
        refresh_btn.set_tooltip_text("Yedek Listesini Yenile")
        refresh_btn.connect("clicked", lambda x: self.refresh_list())
        toolbar.pack_start(refresh_btn)
        
        list_page.append(toolbar)
        
        # Scrolled Box List
        scrolled_list = Gtk.ScrolledWindow()
        scrolled_list.set_vexpand(True)
        
        self.list_box = Gtk.ListBox()
        self.list_box.add_css_class("boxed-list")
        self.list_box.set_margin_top(18)
        self.list_box.set_margin_bottom(18)
        self.list_box.set_margin_start(18)
        self.list_box.set_margin_end(18)
        
        # Empty State
        self.empty_status = Adw.StatusPage(
            title="Yedek Bulunmuyor",
            description="Henüz oluşturulmuş bir yedek dosyası yok.",
            icon_name="document-open-recent-symbolic"
        )
        self.empty_status.set_vexpand(True)
        self.empty_status.set_visible(False)
        
        overlay = Gtk.Overlay()
        overlay.set_child(scrolled_list)
        overlay.add_overlay(self.empty_status)
        
        scrolled_list.set_child(self.list_box)
        list_page.append(overlay)
        
        # --- Automation Page ---
        auto_page_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=18)
        auto_page_box.set_margin_top(24)
        auto_page_box.set_margin_bottom(24)
        auto_page_box.set_margin_start(24)
        auto_page_box.set_margin_end(24)
        
        scrolled_auto = Gtk.ScrolledWindow()
        scrolled_auto.set_vexpand(True)
        scrolled_auto.set_child(auto_page_box)
        
        auto_status_page = Adw.StatusPage(
            title="Otomatik Yedekleme",
            description="Arka planda periyodik yedeklemeler zamanlayın",
            icon_name="alarm-symbolic"
        )
        auto_page_box.append(auto_status_page)
        
        auto_group = Adw.PreferencesGroup(title="Otomasyon Ayarları")
        auto_page_box.append(auto_group)
        
        self.auto_switch = Adw.SwitchRow(title="Günlük Otomatik Yedekleme", subtitle="Her gece saat 03:00'da sistem yedeği otomatik olarak alınır")
        self.auto_switch.connect("notify::active", lambda r, p: self.update_cron_job())
        auto_group.add(self.auto_switch)
        
        self.auto_include_media = Adw.SwitchRow(title="Otomatik Yedeklemeye Medya Dosyalarını Dahil Et", subtitle="Otomatik yedek paketine medya dosyaları da dahil edilir")
        self.auto_include_media.set_active(True)
        self.auto_include_media.connect("notify::active", lambda r, p: self.update_cron_job())
        auto_group.add(self.auto_include_media)
        
        self.auto_format = Adw.ComboRow(title="Otomatik Yedekleme Veritabanı Formatı")
        self.auto_format.set_model(Gtk.StringList.new(["Sıkıştırılmış (.dump)", "SQL Plain Text (.sql)"]))
        self.auto_format.connect("notify::selected", lambda r, p: self.update_cron_job())
        auto_group.add(self.auto_format)
        
        # Add pages to View Stack
        stack.add_titled_with_icon(scrolled_backup, "backup", "Yedekle", "document-save-symbolic")
        stack.add_titled_with_icon(list_page, "list", "Yedekler", "format-justify-fill-symbolic")
        stack.add_titled_with_icon(scrolled_auto, "auto", "Otomasyon", "alarm-symbolic")
        
        main_box.append(stack)
        
        # Initialize UI status
        self.update_preview_filename()
        self.update_status_cards()
        self.refresh_list()
        self.check_auto_status()
        
        self.window.present()

    def update_preview_filename(self):
        is_sql = self.format_row.get_selected() == 1
        include_media = self.media_switch.get_active()
        ext = ".tar.gz" if include_media else (".sql" if is_sql else ".dump")
        self.filename_preview_row.set_subtitle(f"ramis_backup_YYYYMMDD_HHMMSS{ext}")

    def update_status_cards(self):
        # DB Status
        db_user = self.db_config.get("POSTGRES_USER", "postgres")
        db_host = self.db_config.get("POSTGRES_HOST", "localhost")
        db_port = self.db_config.get("POSTGRES_PORT", "5432")
        self.db_row.set_subtitle(f"{db_user}@{db_host}:{db_port}/{self.db_name}")
        
        # Media Size
        media_size = get_dir_size_mb(MEDIA_DIR)
        self.media_row.set_subtitle(f"{media_size:.2f} MB ({MEDIA_DIR})")
        
        # Backup Storage Stats
        try:
            backup_files = [
                f for f in os.listdir(BACKUP_DIR)
                if _is_allowed_backup_filename(f)
            ]
            total_size = sum(os.path.getsize(os.path.join(BACKUP_DIR, f)) for f in backup_files) / (1024 * 1024)
            self.storage_row.set_subtitle(f"{len(backup_files)} yedek • {total_size:.2f} MB")
        except Exception:
            self.storage_row.set_subtitle("0 yedek • 0.00 MB")

    def refresh_list(self):
        while (child := self.list_box.get_first_child()):
            self.list_box.remove(child)
            
        try:
            files = sorted(
                [
                    f for f in os.listdir(BACKUP_DIR)
                    if _is_allowed_backup_filename(f)
                ],
                reverse=True,
            )
        except Exception:
            files = []
            
        if not files:
            self.empty_status.set_visible(True)
            self.list_box.set_visible(False)
        else:
            self.empty_status.set_visible(False)
            self.list_box.set_visible(True)
            for f in files:
                self.list_box.append(BackupRow(f, self))

    def show_toast(self, message):
        toast = Adw.Toast(title=message)
        self.toast_overlay.add_toast(toast)

    def append_log(self, text):
        buffer = self.log_view.get_buffer()
        end_iter = buffer.get_end_iter()
        buffer.insert(end_iter, text + "\n")
        # Scroll to bottom
        adj = self.log_scrolled.get_vadjustment()
        adj.set_value(adj.get_upper() - adj.get_page_size())

    def log_message(self, text):
        GLib.idle_add(self.append_log, text)

    def set_busy(self, busy):
        self.is_processing = busy
        self.progress_bar.set_visible(busy)
        self.backup_btn.set_sensitive(not busy)
        if busy:
            self.progress_bar.pulse()
            GLib.timeout_add(100, self.pulse_progress)

    def pulse_progress(self):
        if self.is_processing:
            self.progress_bar.pulse()
            return True
        return False

    def on_backup_clicked(self, btn):
        if self.is_processing:
            return
        
        is_sql = self.format_row.get_selected() == 1
        include_media = self.media_switch.get_active()
        
        ext = ".tar.gz" if include_media else (".sql" if is_sql else ".dump")
        filename = f"ramis_backup_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}{ext}"
        filepath = os.path.join(BACKUP_DIR, filename)
        
        self.set_busy(True)
        self.log_expander.set_expanded(True)
        self.log_view.get_buffer().set_text("")
        
        threading.Thread(target=self.do_backup, args=(filepath, is_sql, include_media), daemon=True).start()

    def do_backup(self, filepath, is_sql, include_media):
        success = _perform_backup(
            filepath,
            is_sql=is_sql,
            include_media=include_media,
            db_config=self.db_config,
            db_name=self.db_name,
            log_fn=self.log_message,
        )
        GLib.idle_add(self.on_operation_complete, success, "Yedekleme")

    def start_restore(self, filepath):
        self.set_busy(True)
        self.log_expander.set_expanded(True)
        self.log_view.get_buffer().set_text("")
        threading.Thread(target=self.do_restore, args=(filepath,), daemon=True).start()

    def do_restore(self, filepath):
        try:
            success = _perform_restore(
                filepath,
                self.db_config,
                self.db_name,
                self.log_message,
                allow_external=False,
            )
        except (FileNotFoundError, ValueError) as exc:
            self.log_message(f"Geri yükleme iptal edildi: {exc}")
            success = False
        GLib.idle_add(self.on_operation_complete, success, "Geri Yükleme")

    def on_operation_complete(self, success, op_name):
        self.set_busy(False)
        self.update_status_cards()
        self.refresh_list()
        
        msg = f"{op_name} {'başarıyla tamamlandı' if success else 'başarısız oldu'}"
        self.show_toast(msg)

    def check_auto_status(self):
        script_path = os.path.abspath(__file__)
        try:
            matched_line = None
            for line in _read_crontab_lines():
                if script_path in line:
                    matched_line = line
                    break
            if matched_line:
                self.auto_switch.set_active(True)
                self.auto_include_media.set_active("--include-media" in matched_line)
                self.auto_format.set_selected(1 if "--sql" in matched_line else 0)
            else:
                self.auto_switch.set_active(False)
        except Exception as e:
            print(f"Otomasyon durumu kontrol edilemedi: {e}")

    def update_cron_job(self):
        active = self.auto_switch.get_active()
        include_media = self.auto_include_media.get_active()
        is_sql = self.auto_format.get_selected() == 1

        script_path = os.path.abspath(__file__)
        media_flag = " --include-media" if include_media else ""
        sql_flag = " --sql" if is_sql else ""
        cron_job = f"0 3 * * * python3 {script_path} --auto-backup{media_flag}{sql_flag}"

        try:
            lines = [line for line in _read_crontab_lines() if script_path not in line]
            if active:
                lines.append(cron_job)
            _write_crontab_lines(lines)
        except Exception as e:
            self.show_toast(f"Otomasyon ayarları güncellenemedi: {e}")


# ----------------- CLI AUTOMATION MODE -----------------

def run_cli_backup():
    app = RamisBackupApp()
    if not app.load_config():
        print("Hata: Veritabanı ve ortam ayarları yüklenemedi.")
        sys.exit(1)

    include_media = "--include-media" in sys.argv
    is_sql = "--sql" in sys.argv

    ext = ".tar.gz" if include_media else (".sql" if is_sql else ".dump")
    filename = f"ramis_auto_backup_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}{ext}"
    filepath = os.path.join(BACKUP_DIR, filename)

    def cli_log(msg):
        print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")

    cli_log(f"Otomatik yedekleme işlemi başlatıldı. Dosya: {filepath}")
    success = _perform_backup(
        filepath,
        is_sql=is_sql,
        include_media=include_media,
        db_config=app.db_config,
        db_name=app.db_name,
        log_fn=cli_log,
    )
    sys.exit(0 if success else 1)


def run_cli_restore(filepath):
    app = RamisBackupApp()
    if not app.load_config():
        print("Hata: Veritabanı ve ortam ayarları yüklenemedi.")
        sys.exit(1)

    def cli_log(msg):
        print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")

    cli_log(f"Geri yükleme işlemi başlatıldı. Dosya: {filepath}")
    try:
        success = _perform_restore(
            filepath,
            app.db_config,
            app.db_name,
            cli_log,
            allow_external=True,
        )
    except (FileNotFoundError, ValueError) as exc:
        cli_log(f"Geri yükleme iptal edildi: {exc}")
        success = False
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    if "--auto-backup" in sys.argv:
        run_cli_backup()
    elif "--restore" in sys.argv:
        idx = sys.argv.index("--restore")
        if idx + 1 < len(sys.argv):
            run_cli_restore(sys.argv[idx + 1])
        else:
            print("Hata: Geri yüklenecek dosya yolu belirtilmedi.")
            sys.exit(1)
    else:
        app = RamisBackupApp()
        app.run(None)
