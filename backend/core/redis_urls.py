"""Redis URL yardımcıları — broker / cache / channels / lock ayrımı."""


from urllib.parse import urlparse, urlunparse


def derive_redis_db(url: str, db: int) -> str:
    """Verilen Redis URL'sinin path'ini /{db} olacak şekilde türetir."""
    if not url:
        return url
    parsed = urlparse(url)
    return urlunparse(
        (parsed.scheme, parsed.netloc, f'/{db}', parsed.params, parsed.query, parsed.fragment)
    )


def redis_url_with_connect_timeout(url: str, timeout_seconds: int) -> str:
    if not url or 'socket_connect_timeout' in url:
        return url
    sep = '&' if '?' in url else '?'
    return f'{url}{sep}socket_connect_timeout={timeout_seconds}'


def redis_url_with_socket_timeout(url: str, timeout_seconds: int) -> str:
    """Okuma timeout (sn). channels_redis BRPOP beklerken Redis yanıt vermezse kopar."""
    if not url or 'socket_timeout' in url:
        return url
    sep = '&' if '?' in url else '?'
    return f'{url}{sep}socket_timeout={timeout_seconds}'


def redis_url_for_channel_layer(
    url: str,
    *,
    connect_timeout_seconds: int,
    socket_timeout_seconds: int,
) -> str:
    """
    Django Channels (channels_redis) için Redis URL.

    channels_redis.brpop_timeout varsayılan 5 sn; redis-py socket_timeout da 5 sn ise
    yoğun/blocked Redis'te ``Timeout reading from 127.0.0.1:6379`` ile WS kopar.
    socket_timeout > brpop_timeout olmalı (öneri: 30 sn).
    """
    resolved = redis_url_with_connect_timeout(url, connect_timeout_seconds)
    return redis_url_with_socket_timeout(resolved, socket_timeout_seconds)
