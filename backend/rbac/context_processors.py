def user_permissions(request):
    """
    Şablonlarda kullanılmak üzere user_permissions ve user_roles context'i sağlar.
    Middleware yoksa get_all_permissions fallback kullanılır.
    user_roles için request-scope cache: aynı request içinde tekrar sorguyu engeller.
    """
    context = {
        'user_permissions': set(),
        'user_roles': set()
    }

    if not request.user.is_authenticated:
        return context

    try:
        if hasattr(request, 'user_permissions'):
            context['user_permissions'] = request.user_permissions
        elif hasattr(request.user, 'get_all_permissions'):
            context['user_permissions'] = request.user.get_all_permissions()
    except (AttributeError, TypeError):
        pass

    try:
        if hasattr(request.user, 'roles'):
            cache_attr = '_cached_context_user_roles'
            if not hasattr(request, cache_attr):
                setattr(
                    request, cache_attr,
                    {role.name for role in request.user.roles.filter(is_active=True)}
                )
            context['user_roles'] = getattr(request, cache_attr)
    except (AttributeError, TypeError):
        pass

    if request.user.is_superuser:
        context['is_superuser'] = True

    return context
