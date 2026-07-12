#!/usr/bin/env python3
"""
Django ortamında kullanıcı listeleme / silme / parola atama / süper kullanıcı oluşturma /
login throttle (rate limit) kilidi kaldırma.
ramis kullanıcısı veya root (sudo -u ramis) ile çalıştırılmalıdır.
"""
from __future__ import annotations

import json
import sys
import uuid


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "usage", "message": "JSON dosya yolu gerekli"}))
        sys.exit(2)

    path = sys.argv[1]
    try:
        with open(path, encoding="utf-8") as f:
            payload = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(json.dumps({"ok": False, "error": "payload", "message": str(e)}))
        sys.exit(2)

    import django

    django.setup()

    from django.contrib.auth import get_user_model
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError
    from django.db import transaction

    User = get_user_model()
    op = payload.get("op")

    try:
        if op == "list":
            from django.conf import settings
            db_info = {}
            for alias in settings.DATABASES:
                db_info[alias] = {
                    "engine": settings.DATABASES[alias]["ENGINE"],
                    "name": str(settings.DATABASES[alias]["NAME"]),
                }

            users = []
            for u in User.objects.order_by("username").iterator():
                users.append(
                    {
                        "id": str(u.pk),
                        "username": u.username,
                        "email": u.email,
                        "is_superuser": u.is_superuser,
                        "is_staff": u.is_staff,
                        "is_active": u.is_active,
                    }
                )
            print(json.dumps({"ok": True, "users": users, "db": db_info}))
            return

        if op == "toggle_active":
            uid = payload.get("user_id")
            try:
                pk = uuid.UUID(str(uid))
            except (ValueError, TypeError):
                print(json.dumps({"ok": False, "error": "invalid_id", "message": "Geçersiz kullanıcı kimliği"}))
                sys.exit(1)

            user = User.objects.filter(pk=pk).first()
            if not user:
                print(json.dumps({"ok": False, "error": "not_found", "message": "Kullanıcı bulunamadı"}))
                sys.exit(1)

            if user.is_superuser and user.is_active:
                active_supers = User.objects.filter(is_superuser=True, is_active=True).count()
                if active_supers <= 1:
                    print(
                        json.dumps(
                            {
                                "ok": False,
                                "error": "last_superuser",
                                "message": "Son aktif süper kullanıcı pasifleştirilemez",
                            }
                        )
                    )
                    sys.exit(1)

            user.is_active = not user.is_active
            user.save()
            status = "aktif edildi" if user.is_active else "pasifleştirildi"
            print(json.dumps({"ok": True, "message": f"Kullanıcı {status}", "is_active": user.is_active}))
            return

        if op == "set_password":
            uid = payload.get("user_id")
            password = payload.get("password") or ""
            try:
                pk = uuid.UUID(str(uid))
            except (ValueError, TypeError):
                print(json.dumps({"ok": False, "error": "invalid_id", "message": "Geçersiz kullanıcı kimliği"}))
                sys.exit(1)

            user = User.objects.filter(pk=pk).first()
            if not user:
                print(json.dumps({"ok": False, "error": "not_found", "message": "Kullanıcı bulunamadı"}))
                sys.exit(1)

            try:
                validate_password(password, user=user)
            except ValidationError as e:
                print(
                    json.dumps(
                        {
                            "ok": False,
                            "error": "password_validation",
                            "messages": list(e.messages),
                        }
                    )
                )
                sys.exit(1)

            user.set_password(password)
            user.save()
            print(json.dumps({"ok": True, "message": "Parola güncellendi"}))
            return

        if op == "create_superuser":
            username = (payload.get("username") or "").strip()
            email = (payload.get("email") or "").strip()
            password = payload.get("password") or ""

            if not username or not email:
                print(
                    json.dumps(
                        {"ok": False, "error": "fields", "message": "Kullanıcı adı ve e-posta zorunlu"}
                    )
                )
                sys.exit(1)

            if User.objects.filter(username=username).exists():
                print(json.dumps({"ok": False, "error": "exists", "message": "Bu kullanıcı adı kullanılıyor"}))
                sys.exit(1)

            if User.objects.filter(email__iexact=email).exists():
                print(json.dumps({"ok": False, "error": "exists", "message": "Bu e-posta kullanılıyor"}))
                sys.exit(1)

            try:
                validate_password(password, user=User(username=username, email=email))
            except ValidationError as e:
                print(
                    json.dumps(
                        {
                            "ok": False,
                            "error": "password_validation",
                            "messages": list(e.messages),
                        }
                    )
                )
                sys.exit(1)

            with transaction.atomic():
                user = User.objects.create_superuser(
                    username=username,
                    email=email,
                    password=password,
                )
                try:
                    from rbac import Role

                    admin_role = Role.objects.filter(name="Sistem Yöneticisi").first()
                    if admin_role:
                        user.roles.add(admin_role)
                except Exception:
                    pass

            print(
                json.dumps(
                    {
                        "ok": True,
                        "message": "Süper kullanıcı oluşturuldu",
                        "user": {
                            "id": str(user.pk),
                            "username": user.username,
                            "email": user.email,
                        },
                    }
                )
            )
            return

        if op == "clear_login_throttle":
            from apps.users.login_throttle import LoginThrottleClearError, clear_login_throttle

            ip = (payload.get("ip") or "").strip() or None
            clear_all = bool(payload.get("clear_all"))
            try:
                deleted = clear_login_throttle(ip=ip, clear_all=clear_all)
            except LoginThrottleClearError as exc:
                print(json.dumps({"ok": False, "error": "invalid", "message": str(exc)}))
                sys.exit(1)

            if not deleted:
                print(
                    json.dumps(
                        {
                            "ok": True,
                            "message": "Silinecek login throttle kaydı bulunamadı",
                            "deleted": [],
                            "count": 0,
                        }
                    )
                )
                return

            print(
                json.dumps(
                    {
                        "ok": True,
                        "message": f"{len(deleted)} login throttle kaydı silindi",
                        "deleted": deleted,
                        "count": len(deleted),
                    }
                )
            )
            return

        print(json.dumps({"ok": False, "error": "unknown_op", "message": f"Bilinmeyen işlem: {op!r}"}))
        sys.exit(2)

    except Exception as e:
        print(json.dumps({"ok": False, "error": "exception", "message": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
