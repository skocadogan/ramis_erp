"""Redis URL yardımcıları testleri."""

from django.test import SimpleTestCase

from core.redis_urls import (
    derive_redis_db,
    redis_url_for_channel_layer,
    redis_url_with_connect_timeout,
    redis_url_with_socket_timeout,
)


class RedisUrlsTests(SimpleTestCase):
    def test_derive_redis_db(self):
        self.assertEqual(
            derive_redis_db("redis://127.0.0.1:6379/0", 2),
            "redis://127.0.0.1:6379/2",
        )

    def test_connect_timeout_appended_once(self):
        url = redis_url_with_connect_timeout("redis://localhost:6379/2", 10)
        self.assertIn("socket_connect_timeout=10", url)
        again = redis_url_with_connect_timeout(url, 10)
        self.assertEqual(url, again)

    def test_socket_timeout_appended_once(self):
        url = redis_url_with_socket_timeout("redis://localhost:6379/2", 30)
        self.assertIn("socket_timeout=30", url)
        again = redis_url_with_socket_timeout(url, 30)
        self.assertEqual(url, again)

    def test_channel_layer_url_has_both_timeouts(self):
        url = redis_url_for_channel_layer(
            "redis://127.0.0.1:6379/2",
            connect_timeout_seconds=10,
            socket_timeout_seconds=30,
        )
        self.assertIn("socket_connect_timeout=10", url)
        self.assertIn("socket_timeout=30", url)
