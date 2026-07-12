"""
WebSocket auth unit tests.
Tests base64 token decoding and backward compatibility.
"""
import base64
from unittest.mock import MagicMock, patch

import pytest


class TestBase64TokenDecoding:
    """Base64 encode edilmiş token'ın decode edilmesi."""

    def test_decode_valid_base64_jwt(self):
        """Geçerli base64 encode edilmiş JWT token'ı decode edilmeli."""
        from apps.users.ws_auth import _try_decode_base64_token

        # Simulate a JWT-like token
        fake_jwt = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxfQ.signature"
        encoded = base64.b64encode(fake_jwt.encode("utf-8")).decode("utf-8")

        result = _try_decode_base64_token(encoded)
        assert result == fake_jwt

    def test_decode_with_missing_padding(self):
        """Padding eksik base64 token decode edilmeli."""
        from apps.users.ws_auth import _try_decode_base64_token

        fake_jwt = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxfQ.sig"
        encoded = base64.b64encode(fake_jwt.encode("utf-8")).decode("utf-8")
        # Remove padding
        encoded_no_pad = encoded.rstrip("=")

        result = _try_decode_base64_token(encoded_no_pad)
        assert result == fake_jwt

    def test_fallback_to_raw_token_on_invalid_base64(self):
        """Geçersiz base64 ise ham token dönmeli."""
        from apps.users.ws_auth import _try_decode_base64_token

        raw_token = "not-base64-token-at-all"
        result = _try_decode_base64_token(raw_token)
        assert result == raw_token

    def test_fallback_on_non_jwt_decoded(self):
        """Decode edilen ama JWT olmayan string ham haliyle dönmeli."""
        from apps.users.ws_auth import _try_decode_base64_token

        # Base64 encode a non-JWT string
        non_jwt = "hello-world"
        encoded = base64.b64encode(non_jwt.encode("utf-8")).decode("utf-8")

        result = _try_decode_base64_token(encoded)
        # Should return original because decoded doesn't look like JWT
        assert result == encoded

    def test_empty_token_returns_empty(self):
        """Boş token boş string dönmeli."""
        from apps.users.ws_auth import _try_decode_base64_token

        result = _try_decode_base64_token("")
        assert result == ""

    def test_none_token_returns_none(self):
        """None token None dönmeli."""
        from apps.users.ws_auth import _try_decode_base64_token

        result = _try_decode_base64_token(None)
        assert result is None


class TestTokensFromScope:
    """Scope'tan token çıkarma — base64 decode entegrasyonu."""

    def test_query_token_base64_decoded(self):
        """Query string'deki base64 token decode edilmeli."""
        from apps.users.ws_auth import _tokens_from_scope

        fake_jwt = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxfQ.signature"
        encoded = base64.b64encode(fake_jwt.encode("utf-8")).decode("utf-8")

        scope = {
            "query_string": f"branch_id=1&token={encoded}".encode("utf-8"),
            "cookies": {},
        }

        cookie_tok, query_tok = _tokens_from_scope(scope)
        assert cookie_tok is None
        assert query_tok == fake_jwt

    def test_query_token_raw_fallback(self):
        """Ham token gönderildiğinde aynen dönmeli."""
        from apps.users.ws_auth import _tokens_from_scope

        raw_token = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxfQ.signature"
        scope = {
            "query_string": f"branch_id=1&token={raw_token}".encode("utf-8"),
            "cookies": {},
        }

        cookie_tok, query_tok = _tokens_from_scope(scope)
        assert query_tok == raw_token

    def test_cookie_token_not_decoded(self):
        """Cookie token base64 decode edilmemeli (zaten raw)."""
        from apps.users.ws_auth import _tokens_from_scope

        raw_token = "some-cookie-token"
        scope = {
            "query_string": b"branch_id=1",
            "cookies": {"access_token": raw_token},
        }

        cookie_tok, query_tok = _tokens_from_scope(scope)
        assert cookie_tok == raw_token
        assert query_tok is None
