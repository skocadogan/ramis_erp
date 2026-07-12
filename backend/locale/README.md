# Backend yerelleştirme (`django.po` / `django.mo`)

- **Kaynak:** `tr/LC_MESSAGES/django.po`, `en/LC_MESSAGES/django.po`
- **Çalışma zamanı:** aynı dizinde `django.mo` (polib veya `compilemessages` ile üretilir)

## `.mo` üretimi (gettext kurulu olmadan)

Proje kökü `backend/` varsayılır:

```bash
venv/bin/python scripts/compile_locale_mo.py
```

## Tam çıkarım (GNU gettext kuruluysa)

```bash
venv/bin/python manage.py makemessages -l tr -l en --ignore=venv
venv/bin/python manage.py compilemessages
```

## Kod kuralları (özet)

- Kullanıcıya dönük sabit dizeler: `django.utils.translation.gettext` (`_()`)
- `f-string` doğrudan `_()` içine konmaz; parametre için `_("… %(x)s") % {"x": val}`
- Modül raporları (Jinja2): `ReportRenderer` içinde `_` global; şablonda `{{ _('…') }}`
