import pytest
from rest_framework.test import APIClient
from apps.branches.models import Branch, KitchenStation
from apps.prep_display.ws_tokens import make_prep_display_token


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def branch(db):
    return Branch.objects.create(name='Test Şube', code='TST')


@pytest.fixture
def station(db, branch):
    return KitchenStation.objects.create(
        branch=branch,
        name='Mutfak İstasyonu',
        code='mutfak',
        color='#FF0000',
    )


@pytest.fixture
def second_station(db, branch):
    return KitchenStation.objects.create(
        branch=branch,
        name='Bar İstasyonu',
        code='bar',
        color='#0000FF',
    )


@pytest.fixture
def display_token(branch, station):
    """Prep Display kiosk token'ı."""
    return make_prep_display_token(str(branch.id), str(station.id))
