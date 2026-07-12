"""
Custom throttling classes for rate limiting on sensitive endpoints.
"""

from django.utils.translation import gettext as _
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.response import Response
from rest_framework import status


class LoginRateThrottle(SimpleRateThrottle):
    """
    Throttle login attempts to prevent brute force attacks.
    Default: 5 attempts per minute.
    """
    scope = 'login'
    rate = '5/minute'

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        return self.cache_format % {
            'scope': self.scope,
            'ident': ident,
        }


class PasswordResetRateThrottle(SimpleRateThrottle):
    """
    Throttle password reset attempts to prevent abuse.
    Default: 3 attempts per hour.
    """
    scope = 'password_reset'
    rate = '3/hour'

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        return self.cache_format % {
            'scope': self.scope,
            'ident': ident,
        }


class SensitiveEndpointThrottle(SimpleRateThrottle):
    """
    General throttling for sensitive endpoints.
    Default: 10 requests per minute.
    """
    scope = 'sensitive'
    rate = '10/minute'

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            ident = request.user.pk
        else:
            ident = self.get_ident(request)
        return self.cache_format % {
            'scope': self.scope,
            'ident': ident,
        }
