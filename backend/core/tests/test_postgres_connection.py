import os
from unittest.mock import patch

from django.test import SimpleTestCase

from core.postgres_connection import (
    is_split_asgi_deployment,
    resolve_postgres_application_name,
    resolve_postgres_conn_max_age,
)


class SplitAsgiDetectionTests(SimpleTestCase):
    def test_split_when_uvicorn_and_daphne(self):
        env = {'UVICORN_INSTANCES': '4', 'DAPHNE_INSTANCES': '2'}
        with patch.dict(os.environ, env, clear=False):
            self.assertTrue(is_split_asgi_deployment())

    def test_not_split_when_only_daphne(self):
        env = {'UVICORN_INSTANCES': '0', 'DAPHNE_INSTANCES': '2', 'RAMIS_ASGI_SPLIT': '0'}
        with patch.dict(os.environ, env, clear=False):
            self.assertFalse(is_split_asgi_deployment())

    def test_explicit_ramis_asgi_split(self):
        with patch.dict(os.environ, {'RAMIS_ASGI_SPLIT': 'true'}, clear=False):
            self.assertTrue(is_split_asgi_deployment())


class ConnMaxAgeTests(SimpleTestCase):
    def test_split_default_zero_without_env_override(self):
        env = {'UVICORN_INSTANCES': '4', 'DAPHNE_INSTANCES': '2'}
        with patch.dict(os.environ, env, clear=True):
            os.environ.update(env)
            self.assertEqual(resolve_postgres_conn_max_age(), 0)

    def test_split_forces_zero_even_when_env_says_sixty(self):
        env = {
            'UVICORN_INSTANCES': '4',
            'DAPHNE_INSTANCES': '2',
            'POSTGRES_CONN_MAX_AGE': '60',
        }
        with patch.dict(os.environ, env, clear=True):
            os.environ.update(env)
            self.assertEqual(resolve_postgres_conn_max_age(), 0)

    def test_persistent_opt_in_allows_env_value(self):
        env = {
            'UVICORN_INSTANCES': '4',
            'DAPHNE_INSTANCES': '2',
            'POSTGRES_CONN_MAX_AGE': '60',
            'RAMIS_DB_PERSISTENT_CONNECTIONS': 'true',
        }
        with patch.dict(os.environ, env, clear=True):
            os.environ.update(env)
            self.assertEqual(resolve_postgres_conn_max_age(), 60)

    def test_explicit_env_overrides_split_default(self):
        env = {
            'UVICORN_INSTANCES': '4',
            'DAPHNE_INSTANCES': '2',
            'POSTGRES_CONN_MAX_AGE': '120',
            'RAMIS_DB_PERSISTENT_CONNECTIONS': 'true',
        }
        with patch.dict(os.environ, env, clear=True):
            os.environ.update(env)
            self.assertEqual(resolve_postgres_conn_max_age(), 120)

    def test_monolith_default_sixty(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(resolve_postgres_conn_max_age(), 60)


class ApplicationNameTests(SimpleTestCase):
    def test_explicit_env(self):
        with patch.dict(os.environ, {'RAMIS_DB_APPLICATION_NAME': 'ramis-uvicorn-9001'}, clear=False):
            self.assertEqual(resolve_postgres_application_name(), 'ramis-uvicorn-9001')

    @patch('core.postgres_connection.sys.argv', ['uvicorn', 'config.asgi:application'])
    def test_infer_uvicorn(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('RAMIS_DB_APPLICATION_NAME', None)
            self.assertEqual(resolve_postgres_application_name(), 'ramis-uvicorn')
