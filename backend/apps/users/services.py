from django.conf import settings


def assign_pos_terminal_preference(user, assigned_terminals):
    """Kasiyere tek POS terminali atanmışsa tercih kaydını oluşturur."""
    if len(assigned_terminals) != 1:
        return
    from apps.users.models import UserPosScreenPreferences, PosUiContext
    pref, created = UserPosScreenPreferences.objects.get_or_create(
        user=user,
        ui_context=PosUiContext.POS,
        defaults={"data": {}},
    )
    pref_data = dict(pref.data or {})
    pref_data["assigned_pos_terminal_uuid"] = str(assigned_terminals[0].id)
    pref_data["assigned_terminal_code"] = assigned_terminals[0].code
    pref.data = pref_data
    pref.save(update_fields=["data", "updated_at"])


def set_jwt_auth_cookies(response, access_token, refresh_token, remember_me):
    """JWT token'ları httpOnly cookie olarak response'a ekler."""
    is_secure = getattr(settings, "SESSION_COOKIE_SECURE", not settings.DEBUG)
    access_max_age = (
        int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds())
        if remember_me else None
    )
    refresh_max_age = (
        int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds())
        if remember_me else None
    )
    response.set_cookie(
        'access_token', access_token,
        httponly=True, samesite='Lax', secure=is_secure,
        max_age=access_max_age, path='/',
    )
    response.set_cookie(
        'refresh_token', refresh_token,
        httponly=True, samesite='Lax', secure=is_secure,
        max_age=refresh_max_age, path='/',
    )
    response.set_cookie(
        'ramis_remember', '1' if remember_me else '0',
        httponly=False, samesite='Lax', secure=is_secure,
        max_age=refresh_max_age if remember_me else None, path='/',
    )
