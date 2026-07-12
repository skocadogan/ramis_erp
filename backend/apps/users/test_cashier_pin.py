import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from apps.branches.models import Branch
from rbac.models import Role
from apps.shifts.models import CashierPinAssignment
from apps.pos_display.models import PosTerminal
from apps.shifts.serializers import CashierPinAssignmentWriteSerializer

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def test_data(db):
    branch = Branch.objects.create(name="Test Şube", code="TST01")
    
    role = Role.objects.create(name="Kasiyer")
    
    cashier = User.objects.create_user(
        username="kasiyer1",
        email="kasiyer1@test.com",
        password="TestPass123!",
        branch=branch,
    )
    cashier.roles.add(role)
    
    other_user = User.objects.create_user(
        username="otheruser",
        email="other@test.com",
        password="TestPass123!",
        branch=branch,
    )
    
    pos1 = PosTerminal.objects.create(
        name="POS 1",
        code="POS01",
        branch=branch,
    )
    
    pos2 = PosTerminal.objects.create(
        name="POS 2",
        code="POS02",
        branch=branch,
    )
    
    return {
        "branch": branch,
        "cashier": cashier,
        "other_user": other_user,
        "pos1": pos1,
        "pos2": pos2,
    }


@pytest.mark.django_db
class TestCashierPinValidation:
    def test_valid_pin_assignment_serializer(self, test_data):
        data = {
            "branch": str(test_data["branch"].id),
            "user": str(test_data["cashier"].id),
            "pin": "1234",
            "pos_terminals": [str(test_data["pos1"].id)],
        }
        serializer = CashierPinAssignmentWriteSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        assignment = serializer.save()
        assert assignment.pin == "1234"

    def test_invalid_pin_length_rejected(self, test_data):
        data = {
            "branch": str(test_data["branch"].id),
            "user": str(test_data["cashier"].id),
            "pin": "123", # 3 digits
            "pos_terminals": [str(test_data["pos1"].id)],
        }
        serializer = CashierPinAssignmentWriteSerializer(data=data)
        assert not serializer.is_valid()
        assert "pin" in serializer.errors

    def test_non_numeric_pin_rejected(self, test_data):
        data = {
            "branch": str(test_data["branch"].id),
            "user": str(test_data["cashier"].id),
            "pin": "12a4", # letters
            "pos_terminals": [str(test_data["pos1"].id)],
        }
        serializer = CashierPinAssignmentWriteSerializer(data=data)
        assert not serializer.is_valid()
        assert "pin" in serializer.errors

    def test_duplicate_pin_rejected(self, test_data):
        # Create first pin
        CashierPinAssignment.objects.create(
            branch=test_data["branch"],
            user=test_data["cashier"],
            pin="5555"
        )
        
        # Try to assign the same pin to another user (even if we temporarily make them a Cashier)
        role = Role.objects.get(name="Kasiyer")
        test_data["other_user"].roles.add(role)
        
        data = {
            "branch": str(test_data["branch"].id),
            "user": str(test_data["other_user"].id),
            "pin": "5555",
            "pos_terminals": [str(test_data["pos1"].id)],
        }
        serializer = CashierPinAssignmentWriteSerializer(data=data)
        assert not serializer.is_valid()
        assert "pin" in serializer.errors

    def test_non_cashier_user_rejected(self, test_data):
        data = {
            "branch": str(test_data["branch"].id),
            "user": str(test_data["other_user"].id), # does not have Kasiyer role
            "pin": "9999",
            "pos_terminals": [str(test_data["pos1"].id)],
        }
        serializer = CashierPinAssignmentWriteSerializer(data=data)
        assert not serializer.is_valid()
        assert "user" in serializer.errors


@pytest.mark.django_db
class TestCashierPinAuthAPI:
    def test_check_pin_api(self, api_client, test_data):
        # Check before assignment
        response = api_client.post("/api/v1/auth/check-pin/", {"username": "kasiyer1"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["has_pin"] is False
        assert response.data["has_cashier_role"] is True

        # Assign PIN
        assignment = CashierPinAssignment.objects.create(
            branch=test_data["branch"],
            user=test_data["cashier"],
            pin="4321"
        )
        assignment.pos_terminals.add(test_data["pos1"])

        # Check after assignment
        response = api_client.post("/api/v1/auth/check-pin/", {"username": "kasiyer1"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["has_pin"] is True
        assert response.data["has_cashier_role"] is True

        # Check regular user without cashier role
        response = api_client.post("/api/v1/auth/check-pin/", {"username": "otheruser"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["has_pin"] is False
        assert response.data["has_cashier_role"] is False

    def test_pin_login_success_and_pref_auto_save(self, api_client, test_data):
        # Assign PIN with exactly ONE terminal
        assignment = CashierPinAssignment.objects.create(
            branch=test_data["branch"],
            user=test_data["cashier"],
            pin="9876"
        )
        assignment.pos_terminals.add(test_data["pos1"])

        # Attempt PIN login
        response = api_client.post("/api/v1/auth/token/pin/", {
            "username": "kasiyer1",
            "pin": "9876"
        })
        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data
        assert "refresh" in response.data
        
        # Verify custom HTTPOnly cookie set correctly
        assert "access_token" in response.cookies
        assert "refresh_token" in response.cookies

        # Verify that preference for single terminal is auto-saved
        from apps.users.models import UserPosScreenPreferences, PosUiContext
        pref = UserPosScreenPreferences.objects.get(
            user=test_data["cashier"],
            ui_context=PosUiContext.POS
        )
        assert pref.data["assigned_pos_terminal_uuid"] == str(test_data["pos1"].id)

    def test_pin_login_invalid_pin_rejected(self, api_client, test_data):
        assignment = CashierPinAssignment.objects.create(
            branch=test_data["branch"],
            user=test_data["cashier"],
            pin="9876"
        )
        assignment.pos_terminals.add(test_data["pos1"])

        response = api_client.post("/api/v1/auth/token/pin/", {
            "username": "kasiyer1",
            "pin": "1111" # wrong PIN
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "error" in response.data
