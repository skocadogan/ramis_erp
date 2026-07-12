"""POS sipariş öncesi istasyon deposu stok kontrolü API."""

import pytest
from django.urls import reverse
from rest_framework import status


@pytest.mark.django_db
def test_check_station_stock_ok_when_product_has_no_recipe(api_client, branch, product, pos_user):
    api_client.force_authenticate(user=pos_user)
    url = reverse("order-check-station-stock")
    res = api_client.post(
        url,
        {
            "branch_id": str(branch.id),
            "items": [{"product_id": str(product.id), "quantity": 1}],
        },
        format="json",
    )
    assert res.status_code == status.HTTP_200_OK
    body = res.json()
    assert body["ok"] is True
    assert body["issues"] == []
    assert body["smart_firing_stats"]["busy_threshold_minutes"] == 15


@pytest.mark.django_db
def test_check_station_stock_exposes_ui_busy_threshold(
    api_client, branch, product, pos_user
):
    """Smart Firing ayarı modül seviyesinde okunur; varsayılan 15 dk."""
    api_client.force_authenticate(user=pos_user)
    url = reverse("order-check-station-stock")
    res = api_client.post(
        url,
        {
            "branch_id": str(branch.id),
            "items": [{"product_id": str(product.id), "quantity": 1}],
        },
        format="json",
    )
    assert res.status_code == status.HTTP_200_OK
    assert res.json()["smart_firing_stats"]["busy_threshold_minutes"] == 15
